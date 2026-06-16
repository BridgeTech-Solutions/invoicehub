import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { computeBilan, computeCompteResultat } from '../../lib/syscohada-statements';
import { generatePdf, buildStatementHtml, resolveDocumentAssets } from '../../lib/pdf';
import {
  CreateChartAccountInput, UpdateChartAccountInput,
  CreateFiscalPeriodInput,
  CreateJournalInput, UpdateJournalInput,
  CreateJournalEntryInput, UpdateJournalEntryInput,
  CreateTaxDeclarationInput,
  ManualLetteringInput, UnletteredLinesInput,
} from './accounting.schema';

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // ── Plan comptable ──────────────────────────────────────────────────────────

  async getChartOfAccounts(params: { search?: string; accountClass?: string; isActive?: boolean }) {
    const where: Prisma.ChartOfAccountWhereInput = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    // Le frontend envoie class=1..9 ; l'enum Prisma attend c1..c9
    if (params.accountClass) where.accountClass = `c${params.accountClass}` as never;
    if (params.search) {
      where.OR = [
        { accountNumber: { contains: params.search, mode: 'insensitive' } },
        { name:          { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.chartOfAccount.findMany({ where, orderBy: { accountNumber: 'asc' } });
  }

  async createChartAccount(data: CreateChartAccountInput) {
    const existing = await this.prisma.chartOfAccount.findUnique({ where: { accountNumber: data.accountNumber } });
    if (existing) throw AppError.conflict(`Le compte ${data.accountNumber} existe déjà`);

    // Auto-dériver la classe depuis le 1er chiffre si non fournie
    const classDigit  = data.accountNumber.trim().charAt(0);
    const accountClass = (data.accountClass ?? (`c${classDigit}` as any));

    // Auto-dériver la nature SYSCOHADA si non fournie :
    // Classes 6 (charges) → débit normal ; Classes 7 (produits) → crédit normal
    // Classes 1-5 → débit normal par défaut (actif, trésorerie, stocks…)
    const autoNature = classDigit === '7' ? 'credit_normal' : 'debit_normal';
    const accountNature = (data.accountNature ?? autoNature) as any;

    return this.prisma.chartOfAccount.create({
      data: {
        accountNumber:        data.accountNumber,
        name:                 data.name,
        shortName:            data.shortName ?? undefined,
        parentAccountNumber:  data.parentAccountNumber ?? undefined,
        accountClass,
        accountNature,
        isDetailAccount:      data.isDetailAccount ?? true,
        allowsReconciliation: data.allowsReconciliation ?? false,
        description:          data.description ?? undefined,
        notes:                data.notes ?? undefined,
      },
    });
  }

  async getChartAccountById(accountNumber: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where:   { accountNumber },
      include: { parent: { select: { accountNumber: true, name: true } }, children: true },
    });
    if (!account) throw AppError.notFound('Compte comptable introuvable');
    return account;
  }

  async updateChartAccount(accountNumber: string, data: UpdateChartAccountInput) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { accountNumber } });
    if (!account) throw AppError.notFound('Compte comptable introuvable');
    if (account.isSystem) throw AppError.forbidden('Les comptes système SYSCOHADA ne peuvent pas être modifiés');
    return this.prisma.chartOfAccount.update({ where: { accountNumber }, data });
  }

  async deleteChartAccount(accountNumber: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where:   { accountNumber },
      include: { _count: { select: { journalEntryLines: true, children: true } } },
    });
    if (!account) throw AppError.notFound('Compte comptable introuvable');
    if (account.isSystem) throw AppError.forbidden('Les comptes système SYSCOHADA ne peuvent pas être supprimés');
    if (account._count.journalEntryLines > 0)
      throw AppError.conflict('Impossible de supprimer un compte avec des écritures');
    if (account._count.children > 0)
      throw AppError.conflict('Impossible de supprimer un compte avec des sous-comptes');
    await this.prisma.chartOfAccount.delete({ where: { accountNumber } });
  }

  // ── Périodes fiscales ───────────────────────────────────────────────────────

  async listFiscalPeriods() {
    return this.prisma.fiscalPeriod.findMany({
      orderBy: [{ fiscalYear: 'desc' }, { startDate: 'asc' }],
    });
  }

  async getFiscalPeriodById(id: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw AppError.notFound('Période introuvable');
    return period;
  }

  async createFiscalPeriod(data: CreateFiscalPeriodInput) {
    if (data.endDate <= data.startDate)
      throw AppError.badRequest('La date de fin doit être après la date de début');
    return this.prisma.fiscalPeriod.create({
      data: {
        name:       data.name,
        fiscalYear: data.fiscalYear,
        periodType: data.periodType ?? 'month',
        startDate:  data.startDate,
        endDate:    data.endDate,
        status:     'open',
      },
    });
  }

  async closeFiscalPeriod(id: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw AppError.notFound('Période introuvable');
    if (period.status !== 'open') throw AppError.badRequest("La période n'est pas ouverte");
    return this.prisma.fiscalPeriod.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
  }

  async reopenFiscalPeriod(id: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw AppError.notFound('Période introuvable');
    if (period.status === 'locked') throw AppError.forbidden('Impossible de rouvrir une période verrouillée');
    return this.prisma.fiscalPeriod.update({ where: { id }, data: { status: 'open', closedAt: null } });
  }

  // ── Journaux ────────────────────────────────────────────────────────────────

  async listJournals() {
    return this.prisma.accountingJournal.findMany({
      where:   { isActive: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { journalEntries: true } } },
    });
  }

  async getJournalById(id: string) {
    const journal = await this.prisma.accountingJournal.findUnique({
      where:   { id },
      include: { _count: { select: { journalEntries: true } } },
    });
    if (!journal) throw AppError.notFound('Journal introuvable');
    return journal;
  }

  async createJournal(data: CreateJournalInput, userId: string) {
    const existing = await this.prisma.accountingJournal.findFirst({ where: { code: data.code } });
    if (existing) throw AppError.conflict(`Le journal ${data.code} existe déjà`);
    return this.prisma.accountingJournal.create({
      data: { code: data.code, name: data.name, type: data.type as never, isActive: true, createdById: userId },
    });
  }

  async updateJournal(id: string, data: UpdateJournalInput) {
    const journal = await this.prisma.accountingJournal.findUnique({ where: { id } });
    if (!journal) throw AppError.notFound('Journal introuvable');
    const { type, ...rest } = data;
    return this.prisma.accountingJournal.update({
      where: { id },
      data:  { ...rest, ...(type ? { type: type as never } : {}) },
    });
  }

  async deleteJournal(id: string) {
    const journal = await this.prisma.accountingJournal.findUnique({
      where:   { id },
      include: { _count: { select: { journalEntries: true } } },
    });
    if (!journal) throw AppError.notFound('Journal introuvable');
    if (journal._count.journalEntries > 0)
      throw AppError.conflict('Impossible de supprimer un journal avec des écritures');
    await this.prisma.accountingJournal.delete({ where: { id } });
  }

  // ── Écritures comptables ────────────────────────────────────────────────────

  async listEntries(params: {
    page: number; limit: number;
    journalId?: string; fiscalPeriodId?: string;
    status?: string; search?: string;
    dateFrom?: string; dateTo?: string;
  }) {
    const { page, limit, journalId, fiscalPeriodId, status, search, dateFrom, dateTo } = params;
    const where: Prisma.JournalEntryWhereInput = {};
    if (journalId)      where.journalId      = journalId;
    if (fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
    if (status)         where.status         = status as never;
    if (search) {
      where.OR = [
        { entryNumber: { contains: search, mode: 'insensitive' } },
        { label:       { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.entryDate = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { entryDate: 'desc' },
        include: {
          journal:      { select: { id: true, code: true, name: true } },
          fiscalPeriod: { select: { id: true, name: true } },
          _count:       { select: { lines: true } },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEntryById(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where:   { id },
      include: {
        journal:      true,
        fiscalPeriod: true,
        lines:        { orderBy: { sortOrder: 'asc' } },
        createdBy:    { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!entry) throw AppError.notFound('Écriture comptable introuvable');
    return entry;
  }

  async createJournalEntry(data: CreateJournalEntryInput, userId: string) {
    const entryDate = data.entryDate;

    // Auto-détecter la période fiscale si non fournie
    let period;
    if (data.fiscalPeriodId) {
      period = await this.prisma.fiscalPeriod.findUnique({ where: { id: data.fiscalPeriodId } });
      if (!period) throw AppError.notFound('Période introuvable');
    } else {
      period = await this.prisma.fiscalPeriod.findFirst({
        where: {
          startDate: { lte: entryDate },
          endDate:   { gte: entryDate },
          status:    { in: ['open'] as any[] },
        },
        orderBy: { startDate: 'asc' },
      });
      if (!period) throw AppError.notFound(`Aucune période fiscale ouverte pour la date ${entryDate.toLocaleDateString('fr-FR')}`);
    }
    if (period.status === 'locked') throw AppError.forbidden("Impossible d'écrire dans une période verrouillée");
    if (period.status === 'closed') throw AppError.forbidden("Impossible d'écrire dans une période clôturée");

    const totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01)
      throw AppError.badRequest('Écriture non équilibrée : débit ≠ crédit');

    const [seqRow] = await this.prisma.$queryRaw<[{ nextval: string }]>`
      SELECT nextval('journal_entry_seq') AS nextval
    `.catch(() =>
      this.prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`
    );

    const entryNumber    = `JNL-${entryDate.getFullYear()}-${String(seqRow.nextval).slice(-6).padStart(6, '0')}`;
    const accountingDate = data.accountingDate ?? entryDate;

    return this.prisma.$transaction(async (tx) => {
      return tx.journalEntry.create({
        data: {
          journalId:      data.journalId,
          fiscalPeriodId: period.id,
          entryDate,
          accountingDate,
          label:          data.label,
          entryNumber,
          sourceType:     data.sourceType ?? null,
          sourceId:       data.sourceId   ?? null,
          totalDebit,
          totalCredit,
          status:         'draft',
          createdById:    userId,
          lines: {
            create: data.lines.map((l, i) => ({
              sortOrder:     i,
              accountNumber: l.accountNumber,
              label:         l.label,
              debit:         l.debit,
              credit:        l.credit,
              analyticAxis1: l.analyticAxis1 ?? null,
              analyticAxis2: l.analyticAxis2 ?? null,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async validateEntry(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where:   { id },
      include: { fiscalPeriod: { select: { status: true } } },
    });
    if (!entry) throw AppError.notFound('Écriture introuvable');
    if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être validés');
    if (entry.fiscalPeriod.status !== 'open')
      throw AppError.forbidden('La période de cette écriture n\'est pas ouverte');
    if (Math.abs(Number(entry.totalDebit) - Number(entry.totalCredit)) >= 0.01)
      throw AppError.badRequest('Écriture non équilibrée : débit ≠ crédit');
    return this.prisma.journalEntry.update({
      where: { id },
      data:  { status: 'validated', validatedById: userId, validatedAt: new Date() },
    });
  }

  /**
   * Validation en masse d'une sélection d'écritures (workflow DAF).
   * Chaque écriture est contrôlée individuellement : seules les brouillons
   * équilibrées d'une période ouverte sont validées ; les autres sont ignorées
   * et listées dans `skipped` avec le motif.
   */
  async validateEntries(ids: string[], userId: string) {
    if (!ids?.length) throw AppError.badRequest('Aucune écriture sélectionnée');

    const entries = await this.prisma.journalEntry.findMany({
      where:   { id: { in: ids } },
      include: { fiscalPeriod: { select: { status: true } } },
    });

    const found   = new Set(entries.map((e) => e.id));
    const skipped: { id: string; reason: string }[] = [];
    const toValidate: string[] = [];

    for (const id of ids) {
      if (!found.has(id)) skipped.push({ id, reason: 'introuvable' });
    }
    for (const e of entries) {
      if (e.status !== 'draft') { skipped.push({ id: e.id, reason: `statut « ${e.status} »` }); continue; }
      if (e.fiscalPeriod.status !== 'open') { skipped.push({ id: e.id, reason: 'période non ouverte' }); continue; }
      if (Math.abs(Number(e.totalDebit) - Number(e.totalCredit)) >= 0.01) {
        skipped.push({ id: e.id, reason: 'non équilibrée' }); continue;
      }
      toValidate.push(e.id);
    }

    if (toValidate.length) {
      await this.prisma.journalEntry.updateMany({
        where: { id: { in: toValidate } },
        data:  { status: 'validated', validatedById: userId, validatedAt: new Date() },
      });
    }
    return { validated: toValidate.length, skipped };
  }

  /**
   * Valide toutes les écritures en brouillon équilibrées correspondant aux
   * filtres (période/journal/dates), pour les périodes ouvertes uniquement.
   * Permet à la DAF de « tout valider » d'un mois en une action.
   */
  async validateAllDraftEntries(
    filters: { fiscalPeriodId?: string; journalId?: string; dateFrom?: string; dateTo?: string },
    userId: string,
  ) {
    const where: Prisma.JournalEntryWhereInput = {
      status:       'draft' as never,
      fiscalPeriod: { status: 'open' as never },
    };
    if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
    if (filters.journalId)      where.journalId      = filters.journalId;
    if (filters.dateFrom || filters.dateTo) {
      where.entryDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo   ? { lte: new Date(filters.dateTo)   } : {}),
      };
    }

    const candidates = await this.prisma.journalEntry.findMany({
      where,
      select: { id: true, totalDebit: true, totalCredit: true },
    });
    const balanced = candidates
      .filter((e) => Math.abs(Number(e.totalDebit) - Number(e.totalCredit)) < 0.01)
      .map((e) => e.id);
    const skippedUnbalanced = candidates.length - balanced.length;

    if (balanced.length) {
      await this.prisma.journalEntry.updateMany({
        where: { id: { in: balanced } },
        data:  { status: 'validated', validatedById: userId, validatedAt: new Date() },
      });
    }
    return { validated: balanced.length, skippedUnbalanced, totalDraft: candidates.length };
  }

  /** Compte/somme des écritures en attente de validation (brouillons). */
  async getPendingValidationSummary(fiscalPeriodId?: string) {
    const where: Prisma.JournalEntryWhereInput = { status: 'draft' as never };
    if (fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
    const agg = await this.prisma.journalEntry.aggregate({
      where,
      _count: true,
      _sum:   { totalDebit: true },
    });
    return { count: agg._count, amount: Number(agg._sum.totalDebit ?? 0) };
  }

  async cancelEntry(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw AppError.notFound('Écriture introuvable');
    if (entry.status === 'locked' || entry.status === 'validated') {
      throw AppError.badRequest('Impossible d\'annuler une écriture validée ou verrouillée — utilisez l\'extourne');
    }
    return this.prisma.journalEntry.update({ where: { id }, data: { status: 'cancelled' as never } });
  }

  async updateJournalEntry(id: string, data: UpdateJournalEntryInput) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw AppError.notFound('Écriture introuvable');
    if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    return this.prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: id } });
      }

      const updateData: Prisma.JournalEntryUpdateInput = {};
      if (data.label          !== undefined) updateData.label          = data.label;
      if (data.entryDate      !== undefined) updateData.entryDate      = data.entryDate;
      if (data.accountingDate !== undefined) updateData.accountingDate = data.accountingDate ?? undefined;
      if (data.lines) {
        updateData.totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
        updateData.totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
        updateData.lines = {
          create: data.lines.map((l, i) => ({
            sortOrder:     i,
            accountNumber: l.accountNumber,
            label:         l.label,
            debit:         l.debit,
            credit:        l.credit,
            analyticAxis1: l.analyticAxis1 ?? null,
            analyticAxis2: l.analyticAxis2 ?? null,
          })),
        };
      }

      return tx.journalEntry.update({ where: { id }, data: updateData, include: { lines: true } });
    });
  }

  async reverseEntry(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!entry) throw AppError.notFound('Écriture introuvable');
    if (!['validated', 'locked'].includes(entry.status)) {
      throw AppError.badRequest('Seules les écritures validées ou verrouillées peuvent être extournées');
    }

    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id: entry.fiscalPeriodId } });
    if (period?.status === 'locked')
      throw AppError.forbidden("Période verrouillée — créez une nouvelle période ouverte pour l'extourne");

    const [seqRow] = await this.prisma.$queryRaw<[{ nextval: string }]>`
      SELECT nextval('journal_entry_seq') AS nextval
    `.catch(() =>
      this.prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`
    );

    const today       = new Date();
    const entryNumber = `JNL-${today.getFullYear()}-${String(seqRow.nextval).slice(-6).padStart(6, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      return tx.journalEntry.create({
        data: {
          journalId:      entry.journalId,
          fiscalPeriodId: entry.fiscalPeriodId,
          entryDate:      today,
          accountingDate: today,
          label:          `EXTOURNE — ${entry.label}`,
          entryNumber,
          sourceType:     'extourne',
          sourceId:       entry.id,
          totalDebit:     entry.totalCredit,
          totalCredit:    entry.totalDebit,
          status:         'draft',
          createdById:    userId,
          lines: {
            create: entry.lines.map((l, i) => ({
              sortOrder:     i,
              accountNumber: l.accountNumber,
              label:         `EXTOURNE — ${l.label}`,
              debit:         l.credit,
              credit:        l.debit,
              analyticAxis1: l.analyticAxis1 ?? null,
              analyticAxis2: l.analyticAxis2 ?? null,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  // ── Balance & Grand livre ───────────────────────────────────────────────────

  async getAccountBalance(params: { fiscalPeriodId?: string; accountClass?: string }) {
    const entryWhere: Prisma.JournalEntryWhereInput = { status: { in: ['validated', 'locked'] as never[] } };
    if (params.fiscalPeriodId) entryWhere.fiscalPeriodId = params.fiscalPeriodId;

    const lineWhere: Prisma.JournalEntryLineWhereInput = { journalEntry: entryWhere };
    if (params.accountClass) {
      lineWhere.account = { accountClass: `c${params.accountClass}` as never };
    }

    const lines = await this.prisma.journalEntryLine.groupBy({
      by:      ['accountNumber'],
      where:   lineWhere,
      _sum:    { debit: true, credit: true },
      orderBy: { accountNumber: 'asc' },
    });

    const accountNumbers = lines.map((l) => l.accountNumber);
    const accounts       = await this.prisma.chartOfAccount.findMany({
      where: { accountNumber: { in: accountNumbers } },
    });
    const accountMap = new Map(accounts.map((a) => [a.accountNumber, a]));

    return lines.map((l) => ({
      accountNumber: l.accountNumber,
      account:       accountMap.get(l.accountNumber) ?? null,
      totalDebit:    Number(l._sum?.debit  ?? 0),
      totalCredit:   Number(l._sum?.credit ?? 0),
      balance:       Number(l._sum?.debit  ?? 0) - Number(l._sum?.credit ?? 0),
    }));
  }

  async getAccountLedger(accountNumber: string, params: { page: number; limit: number; fiscalPeriodId?: string; includeDraft?: boolean }) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { accountNumber } });
    if (!account) throw AppError.notFound('Compte introuvable');

    // Cohérence avec la balance : par défaut seules les écritures définitives
    // (validated/locked). includeDraft = vue « brouillard » incluant les saisies
    // automatiques pas encore validées par la DAF. Les écritures annulées
    // (cancelled) sont toujours exclues.
    const statuses = params.includeDraft
      ? ['draft', 'validated', 'locked']
      : ['validated', 'locked'];
    const where: Prisma.JournalEntryLineWhereInput = {
      accountNumber,
      journalEntry: {
        status: { in: statuses as never[] },
        ...(params.fiscalPeriodId ? { fiscalPeriodId: params.fiscalPeriodId } : {}),
      },
    };

    const [lines, total] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        skip:    (params.page - 1) * params.limit,
        take:    params.limit,
        orderBy: { journalEntry: { entryDate: 'asc' } },
        include: {
          journalEntry: {
            select: { entryNumber: true, entryDate: true, label: true, journal: { select: { code: true } } },
          },
        },
      }),
      this.prisma.journalEntryLine.count({ where }),
    ]);
    return { account, lines, total };
  }

  async exportSageCsv(params: { dateFrom?: string; dateTo?: string; journals?: string[]; periodId?: string }): Promise<string> {
    const where: Prisma.JournalEntryWhereInput = { status: { in: ['validated', 'locked'] as never[] } };
    if (params.periodId) where.fiscalPeriodId = params.periodId;
    if (params.journals?.length) where.journalId = { in: params.journals };
    if (params.dateFrom || params.dateTo) {
      where.entryDate = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo   ? { lte: new Date(params.dateTo)   } : {}),
      };
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: { journal: true, lines: true },
      orderBy: { entryDate: 'asc' },
    });

    const rows = ['Journal;Date;Numéro;Compte;Libellé;Débit;Crédit'];
    for (const e of entries) {
      for (const l of e.lines) {
        rows.push([
          e.journal.code,
          new Date(e.entryDate).toLocaleDateString('fr-FR'),
          e.entryNumber,
          l.accountNumber,
          `"${l.label.replace(/"/g, '""')}"`,
          l.debit.toString().replace('.', ','),
          l.credit.toString().replace('.', ','),
        ].join(';'));
      }
    }
    return rows.join('\n');
  }

  async getAccountingStats() {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const where: Prisma.JournalEntryWhereInput = {
      status:    { in: ['validated', 'locked'] as never[] },
      entryDate: { gte: firstDay, lte: lastDay },
    };

    const lines = await this.prisma.journalEntryLine.findMany({
      where:   { journalEntry: where },
      include: { account: { select: { accountClass: true } } },
    });

    let revenueMonth  = 0;
    let expensesMonth = 0;

    for (const l of lines) {
      const cls = l.account.accountClass;
      if (cls === 'c7') revenueMonth  += Number(l.credit) - Number(l.debit);
      if (cls === 'c6') expensesMonth += Number(l.debit)  - Number(l.credit);
    }

    // Écritures en attente de validation DAF (brouillons) — pour ne pas laisser
    // croire que l'activité est nulle quand les écritures auto ne sont pas encore
    // validées.
    const pendingAgg = await this.prisma.journalEntry.aggregate({
      where:  { status: 'draft' as never },
      _count: true,
      _sum:   { totalDebit: true },
    });

    return {
      revenueMonth,
      expensesMonth,
      netResult: revenueMonth - expensesMonth,
      vatDue:    0,
      trend:     [],
      pendingValidation: {
        count:  pendingAgg._count,
        amount: Number(pendingAgg._sum.totalDebit ?? 0),
      },
    };
  }

  // ── États financiers SYSCOHADA (Bilan & Compte de résultat) ──────────────────

  /**
   * Soldes par compte (débit − crédit) sur un périmètre, écritures définitives
   * uniquement (validated/locked) — cohérent avec la balance et les autres états.
   */
  private async getBalancesMap(scope: { fiscalPeriodId?: string; fiscalYear?: number }): Promise<Map<string, number>> {
    const entryWhere: Prisma.JournalEntryWhereInput = { status: { in: ['validated', 'locked'] as never[] } };
    if (scope.fiscalPeriodId)   entryWhere.fiscalPeriodId = scope.fiscalPeriodId;
    else if (scope.fiscalYear)  entryWhere.fiscalPeriod   = { fiscalYear: scope.fiscalYear };

    const lines = await this.prisma.journalEntryLine.groupBy({
      by:    ['accountNumber'],
      where: { journalEntry: entryWhere },
      _sum:  { debit: true, credit: true },
    });

    const map = new Map<string, number>();
    for (const l of lines) {
      map.set(l.accountNumber, Number(l._sum?.debit ?? 0) - Number(l._sum?.credit ?? 0));
    }
    return map;
  }

  /** Bilan SYSCOHADA (Système Normal) calculé depuis la balance. */
  async getBilan(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    return computeBilan(await this.getBalancesMap(scope));
  }

  /** Compte de résultat SYSCOHADA (SIG) calculé depuis la balance. */
  async getCompteResultat(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    return computeCompteResultat(await this.getBalancesMap(scope));
  }

  // ── Export PDF des états financiers ──────────────────────────────────────────

  private async statementMeta(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const settings = await this.prisma.companySettings.findFirst({
      select: { headerImagePath: true, footerImagePath: true, stampPath: true },
    });
    const { headerImageB64, footerImageB64 } = resolveDocumentAssets(settings ?? null);
    let periodLabel = 'Toutes périodes';
    if (scope.fiscalYear) periodLabel = `Exercice ${scope.fiscalYear}`;
    else if (scope.fiscalPeriodId) {
      const p = await this.prisma.fiscalPeriod.findUnique({ where: { id: scope.fiscalPeriodId }, select: { name: true } });
      if (p?.name) periodLabel = p.name;
    }
    return { headerImg: headerImageB64, footerImg: footerImageB64, periodLabel };
  }

  private static fmtXaf(n: number): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n));
  }

  async generateBilanPdf(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const bilan = await this.getBilan(scope);
    const { headerImg, footerImg, periodLabel } = await this.statementMeta(scope);
    const f = AccountingService.fmtXaf;

    const actifRows = bilan.actif
      .filter((l) => Math.abs(l.brut) > 0.5 || Math.abs(l.net) > 0.5)
      .map((l) => `<tr><td><span class="code">${l.code}</span>${l.label}</td><td class="num">${l.brut > 0 ? f(l.brut) : '—'}</td><td class="num">${l.amortissements > 0 ? f(l.amortissements) : '—'}</td><td class="num">${f(l.net)}</td></tr>`)
      .join('');
    const passifRows = bilan.passif
      .filter((l) => Math.abs(l.net) > 0.5)
      .map((l) => `<tr${l.code === 'CH' ? ' class="solde-row"' : ''}><td><span class="code">${l.code}</span>${l.label}</td><td class="num">${f(l.net)}</td></tr>`)
      .join('');

    const warnings =
      (bilan.equilibre ? '' : `<p style="color:#c0392b;font-size:10px;margin-top:8px;">⚠ Bilan déséquilibré : écart de ${f(Math.abs(bilan.ecart))} XAF.</p>`) +
      (Math.abs(bilan.comptesNonVentiles) > 0.5 ? `<p style="color:#b45309;font-size:10px;">⚠ Comptes non ventilés : ${f(Math.abs(bilan.comptesNonVentiles))} XAF à reclasser.</p>` : '');

    const bodyHtml = `
      <h2 class="sect">Actif</h2>
      <table>
        <thead><tr><th>Poste</th><th class="num">Brut</th><th class="num">Amort./Dépréc.</th><th class="num">Net</th></tr></thead>
        <tbody>${actifRows}<tr class="total-row"><td colspan="3">TOTAL ACTIF</td><td class="num">${f(bilan.totalActif)}</td></tr></tbody>
      </table>
      <h2 class="sect">Passif</h2>
      <table>
        <thead><tr><th>Poste</th><th class="num">Net</th></tr></thead>
        <tbody>${passifRows}<tr class="total-row"><td>TOTAL PASSIF</td><td class="num">${f(bilan.totalPassif)}</td></tr></tbody>
      </table>${warnings}`;

    const html = buildStatementHtml({ title: 'Bilan', subtitle: 'SYSCOHADA — Système Normal', periodLabel, headerImg, footerImg, bodyHtml });
    const buffer = await generatePdf(html);
    return { buffer, filename: `BTS_Bilan_${periodLabel.replace(/[^\w]+/g, '-')}.pdf` };
  }

  async generateCompteResultatPdf(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const cr = await this.getCompteResultat(scope);
    const { headerImg, footerImg, periodLabel } = await this.statementMeta(scope);
    const f = AccountingService.fmtXaf;

    const rows = cr.lines
      .filter((l) => l.kind === 'solde' || Math.abs(l.amount) > 0.5)
      .map((l) => {
        const val = l.kind === 'charge' && l.amount > 0 ? `(${f(Math.abs(l.amount))})` : f(Math.abs(l.amount));
        return `<tr${l.kind === 'solde' ? ' class="solde-row"' : ''}><td><span class="code">${l.code}</span>${l.label}</td><td class="num">${val}</td></tr>`;
      })
      .join('');

    const bodyHtml = `<table><tbody>${rows}</tbody></table>
      <p style="font-size:9px;color:#888;margin-top:6px;">Charges entre parenthèses. Soldes intermédiaires de gestion en gras.</p>`;

    const html = buildStatementHtml({ title: 'Compte de résultat', subtitle: 'SYSCOHADA — Soldes intermédiaires de gestion', periodLabel, headerImg, footerImg, bodyHtml });
    const buffer = await generatePdf(html);
    return { buffer, filename: `BTS_Compte-resultat_${periodLabel.replace(/[^\w]+/g, '-')}.pdf` };
  }

  // ── Déclarations fiscales ───────────────────────────────────────────────────

  async listTaxDeclarations(params: { page: number; limit: number; declarationType?: string }) {
    const { page, limit } = params;
    const where: Prisma.TaxDeclarationWhereInput = {};
    if (params.declarationType) where.declarationType = params.declarationType;
    const [data, total] = await Promise.all([
      this.prisma.taxDeclaration.findMany({
        where,
        skip:    (params.page - 1) * params.limit,
        take:    params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.taxDeclaration.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createTaxDeclaration(data: CreateTaxDeclarationInput, userId: string) {
    return this.prisma.taxDeclaration.create({
      data: {
        declarationType: data.declarationType,
        fiscalPeriodId:  data.fiscalPeriodId ?? null,
        periodStart:     data.periodStart,
        periodEnd:       data.periodEnd,
        tvaCollected:    data.tvaCollected,
        tvaDeductible:   data.tvaDeductible,
        tvaCredit:       data.tvaCredit,
        notes:           data.notes ?? null,
        status:          'draft',
        createdById:     userId,
      },
    });
  }

  async getTaxDeclarationById(id: string) {
    const d = await this.prisma.taxDeclaration.findUnique({ where: { id } });
    if (!d) throw AppError.notFound('Déclaration introuvable');
    return d;
  }

  async submitTaxDeclaration(id: string, userId: string) {
    const d = await this.prisma.taxDeclaration.findUnique({ where: { id } });
    if (!d) throw AppError.notFound('Déclaration introuvable');
    if (d.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être soumis');
    return this.prisma.taxDeclaration.update({
      where: { id },
      data:  { status: 'submitted', submittedAt: new Date(), submittedById: userId },
    });
  }

  // ── Lettrage manuel ─────────────────────────────────────────────────────────

  private generateNextCode(lastCode: string | null): string {
    if (!lastCode) return 'A';
    const chars = lastCode.split('');
    let i = chars.length - 1;
    while (i >= 0) {
      if (chars[i]! < 'Z') {
        chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
        return chars.join('');
      }
      chars[i] = 'A';
      i--;
    }
    return 'A' + chars.join('');
  }

  async letterLinesAuto(lineIds: string[], userId: string): Promise<void> {
    if (lineIds.length < 2) throw AppError.badRequest('Au moins 2 lignes requises');
    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { id: { in: lineIds } },
      select: { id: true, accountNumber: true, debit: true, credit: true, letteringCode: true },
    });
    if (lines.length !== lineIds.length) throw AppError.notFound('Une ou plusieurs lignes introuvables');
    const accountNumbers = [...new Set(lines.map(l => l.accountNumber))];
    if (accountNumbers.length > 1)
      throw AppError.badRequest(`Les lignes appartiennent à plusieurs comptes : ${accountNumbers.join(', ')}`);
    const accountNumber = accountNumbers[0]!;
    await this.letterLines({ lineIds, accountNumber }, userId);
  }

  async letterLines(input: ManualLetteringInput, userId: string): Promise<void> {
    const { lineIds, accountNumber } = input;

    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { id: { in: lineIds } },
      select: { id: true, accountNumber: true, debit: true, credit: true, letteringCode: true },
    });

    if (lines.length !== lineIds.length)
      throw AppError.notFound('Une ou plusieurs lignes introuvables');

    const wrongAccount = lines.find(l => l.accountNumber !== accountNumber);
    if (wrongAccount)
      throw AppError.badRequest(`La ligne ${wrongAccount.id} appartient au compte ${wrongAccount.accountNumber}, pas ${accountNumber}`);

    const alreadyLettered = lines.find(l => l.letteringCode);
    if (alreadyLettered)
      throw AppError.conflict(`La ligne ${alreadyLettered.id} est déjà lettrée (${alreadyLettered.letteringCode})`);

    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      throw AppError.badRequest(`Lettrage non équilibré : débit ${totalDebit} ≠ crédit ${totalCredit}`);

    await this.prisma.$transaction(async (tx) => {
      const last = await tx.journalEntryLine.findFirst({
        where:   { accountNumber, letteringCode: { not: null } },
        orderBy: { letteredAt: 'desc' },
        select:  { letteringCode: true },
      });
      const code = this.generateNextCode(last?.letteringCode ?? null);
      await tx.journalEntryLine.updateMany({
        where: { id: { in: lineIds } },
        data:  { letteringCode: code, letteredAt: new Date(), letteredById: userId },
      });
    });
  }

  async deleteLettering(code: string, accountNumber: string): Promise<void> {
    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { letteringCode: code, accountNumber },
      select: { id: true },
    });
    if (lines.length === 0)
      throw AppError.notFound(`Aucune ligne lettrée avec le code "${code}" sur le compte ${accountNumber}`);
    await this.prisma.journalEntryLine.updateMany({
      where: { letteringCode: code, accountNumber },
      data:  { letteringCode: null, letteredAt: null, letteredById: null },
    });
  }

  async getUnletteredLines(input: UnletteredLinesInput) {
    const { accountNumber, dateFrom, dateTo, page, limit } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryLineWhereInput = {
      accountNumber,
      letteringCode: null,
      // Les lignes d'écritures annulées ne sont pas lettrables.
      journalEntry: {
        status: { not: 'cancelled' as never },
        ...(dateFrom || dateTo ? {
          entryDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
          },
        } : {}),
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'asc' },
        include: {
          journalEntry: {
            select: { entryNumber: true, entryDate: true, label: true, sourceType: true, sourceId: true },
          },
        },
      }),
      this.prisma.journalEntryLine.count({ where }),
    ]);

    const totalDebit  = data.reduce((s, l) => s + Number(l.debit),  0);
    const totalCredit = data.reduce((s, l) => s + Number(l.credit), 0);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), totalDebit, totalCredit, balance: totalDebit - totalCredit };
  }

  async getLeteredGroups(accountNumber: string, dateFrom?: string, dateTo?: string) {
    // Récupère les lignes lettrées pour ce compte, groupées par letteringCode
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        account: { accountNumber },
        letteringCode: { not: null },
        journalEntry: {
          status: { not: 'cancelled' as never },
          ...(dateFrom || dateTo ? {
            entryDate: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
            },
          } : {}),
        },
      },
      include: {
        journalEntry: { select: { id: true, entryNumber: true, journalId: true, journal: { select: { code: true } }, entryDate: true } },
      },
      orderBy: [{ letteringCode: 'asc' }, { journalEntry: { entryDate: 'asc' } }],
    });

    // Groupe par letteringCode
    const groups = new Map<string, any[]>();
    for (const line of lines) {
      const code = line.letteringCode!;
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code)!.push(line);
    }

    return Array.from(groups.entries()).map(([letterCode, grpLines]) => {
      const totalDebit  = grpLines.reduce((s: number, l: any) => s + Number(l.debit),  0);
      const totalCredit = grpLines.reduce((s: number, l: any) => s + Number(l.credit), 0);
      return {
        letterCode,
        lines: grpLines.map((l: any) => ({
          id:          l.id,
          entryId:     l.journalEntryId,
          entryNumber: l.journalEntry?.entryNumber ?? '',
          journalCode: l.journalEntry?.journal?.code ?? '',
          date:        l.journalEntry?.entryDate?.toISOString().split('T')[0] ?? '',
          label:       l.label,
          debit:       Number(l.debit),
          credit:      Number(l.credit),
          letterCode:  l.letteringCode,
        })),
        totalDebit,
        totalCredit,
        balance:    totalDebit - totalCredit,
        letteredAt: grpLines[0]?.letteredAt?.toISOString() ?? new Date().toISOString(),
      };
    });
  }
}
