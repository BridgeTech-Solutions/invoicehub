import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sweepAccountingOutbox } from '../../lib/accounting-outbox';
import { AppError } from '../../common/errors/app-error';
import { computeBilan, computeCompteResultat, attachBilanAccounts } from '../../lib/syscohada-statements';
import { computeBilanFromRubriques, type RubriqueDef, type RubriqueSource } from '../../lib/statement-rubriques';
import { BILAN_RUBRIQUES } from '../../lib/statement-rubriques.seed';
import type { UpdateRubriqueInput } from './accounting.schema';
import { generatePdf, buildStatementHtml, resolveDocumentAssets, escapeHtml } from '../../lib/pdf';
import { subsetSum, type SubsetCandidate } from '../bank/bank.matching';
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

  // ── Health check : « Comptabilité prête ? » ──────────────────────────────────
  // Vérifie en amont tout ce dont le moteur d'écritures a besoin, pour signaler les
  // problèmes de configuration AVANT qu'ils ne fassent échouer une écriture au fil
  // de l'eau (facture émise sans pièce comptable). Exposé en un indicateur UI.
  async getReadiness() {
    const issues: Array<{ code: string; message: string }> = [];

    const settings = await this.prisma.companySettings.findFirst();
    if (!settings) {
      return {
        ready: false,
        issues: [{ code: 'NO_SETTINGS', message: "Paramètres de l'entreprise non configurés." }],
      };
    }

    // 1. Comptes configurés : présents, actifs, imputables (compte de détail).
    const ACCOUNT_FIELDS = [
      'collectedTaxAccount', 'deductibleTaxAccount', 'initialStockAccount', 'escompteAccountingAccount',
      'stockAccount', 'stockVariationAccount', 'stockLossAccount',
      'defaultClientAccount', 'defaultSupplierAccount', 'defaultBankAccount',
      'defaultSalesGoodsAccount', 'defaultSalesServiceAccount', 'defaultPurchaseAccount', 'defaultExpenseAccount',
      'withholdingAccount',
      ...(((settings as any).useAdvanceAccount) ? ['advanceAccount'] : []),
    ];
    const configured = [...new Set(
      ACCOUNT_FIELDS
        .map((f) => (settings as any)[f])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== ''),
    )];
    if (configured.length > 0) {
      const rows = await this.prisma.chartOfAccount.findMany({
        where:  { accountNumber: { in: configured } },
        select: { accountNumber: true, isActive: true, isDetailAccount: true },
      });
      const byNum = new Map(rows.map((r) => [r.accountNumber, r]));
      const missing   = configured.filter((a) => !byNum.has(a));
      const inactive  = configured.filter((a) => byNum.get(a)?.isActive === false);
      const notDetail = configured.filter((a) => byNum.get(a)?.isDetailAccount === false);
      if (missing.length)   issues.push({ code: 'MISSING_ACCOUNTS',  message: `Comptes inexistants dans le plan comptable : ${missing.join(', ')}.` });
      if (inactive.length)  issues.push({ code: 'INACTIVE_ACCOUNTS', message: `Comptes désactivés : ${inactive.join(', ')}.` });
      if (notDetail.length) issues.push({ code: 'ROOT_ACCOUNTS',     message: `Comptes racine non imputables : ${notDetail.join(', ')}.` });
    }

    // 2. Journaux par défaut requis par le moteur (ventes, banque, achats, OD).
    const journals = await this.prisma.accountingJournal.findMany({
      where: { isActive: true }, select: { type: true },
    });
    const types = new Set(journals.map((j) => String(j.type)));
    const missingJournals = ['sales', 'bank', 'purchases', 'operations'].filter((t) => !types.has(t));
    if (missingJournals.length) {
      issues.push({ code: 'MISSING_JOURNALS', message: `Journaux comptables manquants ou inactifs : ${missingJournals.join(', ')}.` });
    }

    // 3. Période fiscale ouverte couvrant aujourd'hui (sinon toute écriture du jour échoue).
    const today = new Date();
    const openPeriod = await this.prisma.fiscalPeriod.findFirst({
      where: { status: 'open', startDate: { lte: today }, endDate: { gte: today } },
      select: { id: true },
    });
    if (!openPeriod) {
      issues.push({ code: 'NO_OPEN_PERIOD', message: "Aucune période fiscale ouverte pour la date du jour." });
    }

    return { ready: issues.length === 0, issues };
  }

  // ── Outbox comptable : rejeu / régénération des écritures manquantes ──────────
  /** État de l'outbox : combien d'écritures restent à passer / en échec. */
  async getOutboxStatus() {
    const [pending, failed, recentFailed] = await Promise.all([
      this.prisma.accountingEvent.count({ where: { status: 'pending' } }),
      this.prisma.accountingEvent.count({ where: { status: 'failed' } }),
      this.prisma.accountingEvent.findMany({
        where: { status: 'failed' }, orderBy: { updatedAt: 'desc' }, take: 20,
        select: { hook: true, sourceType: true, sourceId: true, attempts: true, lastError: true, updatedAt: true },
      }),
    ]);
    return { pending, failed, recentFailed };
  }

  /**
   * Action manuelle « régénérer les écritures manquantes » : réarme les événements
   * en échec (failed → pending) puis rejoue tout le lot dû. À lancer après avoir
   * corrigé une config comptable ou rouvert une période.
   */
  async regenerateMissingEntries() {
    await this.prisma.accountingEvent.updateMany({
      where: { status: 'failed' },
      data:  { status: 'pending', attempts: 0, nextRetryAt: new Date() },
    });
    return sweepAccountingOutbox(this.prisma as unknown as PrismaClient, 500);
  }

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
      include: { _count: { select: { journalEntries: true } } },
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

  // ── Clôture d'exercice — ÉTAPE 1 : aperçu & contrôles (lecture seule) ──────────
  // Ne modifie RIEN : calcule le résultat (6/7), liste les soldes de bilan à
  // reporter (classes 1-5) et évalue les contrôles bloquants. Sert à valider les
  // montants AVANT de générer les écritures de clôture et de verrouiller.
  async getFiscalYearClosePreview(year: number) {
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const periods = await this.prisma.fiscalPeriod.findMany({
      where:   { fiscalYear: year },
      select:  { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    if (periods.length === 0) throw AppError.notFound(`Aucune période pour l'exercice ${year}.`);

    const periodIds     = periods.map((p) => p.id);
    const alreadyClosed = periods.every((p) => p.status === 'locked');

    const draftCount = await this.prisma.journalEntry.count({
      where: { fiscalPeriodId: { in: periodIds }, status: 'draft' },
    });

    // Agrégation par compte des écritures NON annulées de l'exercice.
    const grouped = await this.prisma.journalEntryLine.groupBy({
      by:    ['accountNumber'],
      where: { journalEntry: { fiscalPeriodId: { in: periodIds }, status: { not: 'cancelled' } } },
      _sum:  { debit: true, credit: true },
    });

    let charges = 0, produits = 0, totalDebit = 0, totalCredit = 0;
    const carryForward: Array<{ accountNumber: string; balance: number }> = [];
    for (const g of grouped) {
      const d = Number(g._sum.debit ?? 0);
      const c = Number(g._sum.credit ?? 0);
      totalDebit += d; totalCredit += c;
      const cls = g.accountNumber.charAt(0);
      if      (cls === '6') charges  += (d - c);       // charges : solde débiteur
      else if (cls === '7') produits += (c - d);       // produits : solde créditeur
      else if ('12345'.includes(cls)) {
        const balance = r2(d - c);
        if (Math.abs(balance) > 0.005) carryForward.push({ accountNumber: g.accountNumber, balance });
      }
    }
    charges = r2(charges); produits = r2(produits);
    const resultat = r2(produits - charges);

    const balanced         = Math.abs(r2(totalDebit) - r2(totalCredit)) < 0.01;
    const allPeriodsClosed = periods.every((p) => p.status === 'closed' || p.status === 'locked');

    return {
      year,
      alreadyClosed,
      resultat: { produits, charges, resultat, sens: resultat >= 0 ? 'benefice' : 'perte' },
      controls: {
        allPeriodsClosed,
        noDraftEntries: draftCount === 0,
        balanced,
        canClose: allPeriodsClosed && draftCount === 0 && balanced && !alreadyClosed,
      },
      draftCount,
      carryForwardCount: carryForward.length,
      carryForward: carryForward.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
      periods,
    };
  }

  // Numéro d'écriture séquentiel (JOURNAL-ANNÉE-NNNNN), atomique via advisory lock.
  private async _nextEntryNumber(tx: Prisma.TransactionClient, journalCode: string, year: number): Promise<string> {
    const prefix = `${journalCode}-${year}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`jentry:${journalCode}:${year}`}))`;
    const last = await tx.journalEntry.findFirst({
      where:   { journal: { code: journalCode }, entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: 'desc' }, select: { entryNumber: true },
    });
    let next = 1;
    if (last?.entryNumber) {
      const n = parseInt(last.entryNumber.replace(prefix, ''), 10);
      if (!Number.isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  // Crée les 12 périodes mensuelles d'un exercice s'il n'en a aucune.
  private async _ensureYearPeriods(tx: Prisma.TransactionClient, year: number, userId: string) {
    const existing = await tx.fiscalPeriod.findMany({ where: { fiscalYear: year }, orderBy: { startDate: 'asc' } });
    if (existing.length > 0) return existing;
    const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    for (let m = 0; m < 12; m++) {
      await tx.fiscalPeriod.create({
        data: {
          name: `${MONTHS[m]} ${year}`, fiscalYear: year, periodType: 'month',
          startDate: new Date(Date.UTC(year, m, 1)),
          endDate:   new Date(Date.UTC(year, m + 1, 0)),
          status: 'open', createdById: userId,
        },
      });
    }
    return tx.fiscalPeriod.findMany({ where: { fiscalYear: year }, orderBy: { startDate: 'asc' } });
  }

  // ── Clôture d'exercice — ÉTAPE 2 : génération + verrouillage ───────────────────
  // En UNE transaction : détermination du résultat (6/7 → 1301/1302), à-nouveau des
  // soldes de bilan (classes 1-5) sur l'exercice suivant, puis verrouillage des
  // écritures et périodes de l'exercice (intangibilité assurée par les triggers).
  async closeFiscalYear(year: number, userId: string) {
    const r2 = (n: number) => Math.round(n * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      // 1. Contrôles bloquants (re-vérifiés dans la transaction).
      const periods = await tx.fiscalPeriod.findMany({ where: { fiscalYear: year }, orderBy: { startDate: 'asc' } });
      if (periods.length === 0) throw AppError.notFound(`Aucune période pour l'exercice ${year}.`);
      if (periods.every((p) => p.status === 'locked')) throw AppError.conflict(`L'exercice ${year} est déjà clôturé.`);
      if (!periods.every((p) => p.status === 'closed' || p.status === 'locked'))
        throw AppError.badRequest('Toutes les périodes de l\'exercice doivent être clôturées avant la clôture annuelle.');
      const periodIds = periods.map((p) => p.id);
      const draft = await tx.journalEntry.count({ where: { fiscalPeriodId: { in: periodIds }, status: 'draft' } });
      if (draft > 0) throw AppError.badRequest(`${draft} écriture(s) en brouillon dans l'exercice : validez-les d'abord.`);

      // Comptes techniques requis (imputables).
      const [resBenef, resPerte] = await Promise.all([
        tx.chartOfAccount.findFirst({ where: { accountNumber: '1301', isDetailAccount: true, isActive: true }, select: { accountNumber: true } }),
        tx.chartOfAccount.findFirst({ where: { accountNumber: '1302', isDetailAccount: true, isActive: true }, select: { accountNumber: true } }),
      ]);
      if (!resBenef || !resPerte) throw AppError.badRequest('Comptes de résultat 1301/1302 introuvables ou non imputables dans le plan comptable.');

      const clJournal = await tx.accountingJournal.findFirst({ where: { type: 'closing' as never, isActive: true } });
      const anJournal = await tx.accountingJournal.findFirst({ where: { type: 'opening' as never, isActive: true } });
      if (!clJournal) throw AppError.badRequest('Journal de clôture (type closing) introuvable.');
      if (!anJournal) throw AppError.badRequest('Journal d\'à-nouveau (type opening) introuvable.');

      const lastPeriod = periods[periods.length - 1]!;
      const closingDate = new Date(lastPeriod.endDate);

      // 2. Agrégation par compte (avant détermination).
      const grouped = await tx.journalEntryLine.groupBy({
        by: ['accountNumber'],
        where: { journalEntry: { fiscalPeriodId: { in: periodIds }, status: { not: 'cancelled' } } },
        _sum: { debit: true, credit: true },
      });

      let produits = 0, charges = 0;
      const detLines: Array<{ sortOrder: number; accountNumber: string; label: string; debit: number; credit: number }> = [];
      let so = 0;
      for (const g of grouped) {
        const d = Number(g._sum.debit ?? 0), c = Number(g._sum.credit ?? 0);
        const cls = g.accountNumber.charAt(0);
        if (cls === '7') {
          const bal = r2(c - d); // solde créditeur d'un produit
          if (Math.abs(bal) > 0.005) { produits += bal; detLines.push({ sortOrder: so++, accountNumber: g.accountNumber, label: 'Solde produit (clôture)', debit: bal, credit: 0 }); }
        } else if (cls === '6') {
          const bal = r2(d - c); // solde débiteur d'une charge
          if (Math.abs(bal) > 0.005) { charges += bal; detLines.push({ sortOrder: so++, accountNumber: g.accountNumber, label: 'Solde charge (clôture)', debit: 0, credit: bal }); }
        }
      }
      produits = r2(produits); charges = r2(charges);
      const resultat = r2(produits - charges);

      let determinationNumber: string | null = null;
      if (detLines.length > 0) {
        // Ligne de résultat (contrepartie) : 1301 crédité (bénéfice) ou 1302 débité (perte).
        if (resultat >= 0) detLines.push({ sortOrder: so++, accountNumber: '1301', label: `Résultat de l'exercice ${year} (bénéfice)`, debit: 0, credit: resultat });
        else               detLines.push({ sortOrder: so++, accountNumber: '1302', label: `Résultat de l'exercice ${year} (perte)`,   debit: r2(-resultat), credit: 0 });

        const totDebit  = r2(detLines.reduce((s, l) => s + l.debit, 0));
        const totCredit = r2(detLines.reduce((s, l) => s + l.credit, 0));
        if (Math.abs(totDebit - totCredit) > 0.01) throw new Error(`Écriture de détermination déséquilibrée (${totDebit} vs ${totCredit}).`);

        determinationNumber = await this._nextEntryNumber(tx, clJournal.code, year);
        await tx.journalEntry.create({
          data: {
            journalId: clJournal.id, fiscalPeriodId: lastPeriod.id, entryDate: closingDate, accountingDate: closingDate,
            entryNumber: determinationNumber, label: `Détermination du résultat — exercice ${year}`,
            sourceType: 'year_close', sourceId: null, entryKind: `result:${year}`,
            totalDebit: totDebit, totalCredit: totCredit, status: 'validated', validatedById: userId, validatedAt: new Date(),
            lines: { create: detLines },
          },
        });
      }

      // 3. À-nouveau : soldes de bilan (classes 1-5) APRÈS détermination.
      const nextYear = year + 1;
      const nextPeriods = await this._ensureYearPeriods(tx, nextYear, userId);
      const firstNext = nextPeriods[0]!;
      const openingDate = new Date(firstNext.startDate);

      const grouped2 = await tx.journalEntryLine.groupBy({
        by: ['accountNumber'],
        where: { journalEntry: { fiscalPeriodId: { in: periodIds }, status: { not: 'cancelled' } } },
        _sum: { debit: true, credit: true },
      });
      const anLines: Array<{ sortOrder: number; accountNumber: string; label: string; debit: number; credit: number }> = [];
      let so2 = 0;
      for (const g of grouped2) {
        const cls = g.accountNumber.charAt(0);
        if (!'12345'.includes(cls)) continue;
        const bal = r2(Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0));
        if (Math.abs(bal) <= 0.005) continue;
        if (bal > 0) anLines.push({ sortOrder: so2++, accountNumber: g.accountNumber, label: `À-nouveau ${nextYear}`, debit: bal, credit: 0 });
        else         anLines.push({ sortOrder: so2++, accountNumber: g.accountNumber, label: `À-nouveau ${nextYear}`, debit: 0, credit: r2(-bal) });
      }

      let aNouveauNumber: string | null = null;
      if (anLines.length > 0) {
        const totD = r2(anLines.reduce((s, l) => s + l.debit, 0));
        const totC = r2(anLines.reduce((s, l) => s + l.credit, 0));
        if (Math.abs(totD - totC) > 0.01) throw new Error(`À-nouveau déséquilibré (${totD} vs ${totC}) — bilan de clôture non équilibré.`);
        aNouveauNumber = await this._nextEntryNumber(tx, anJournal.code, nextYear);
        await tx.journalEntry.create({
          data: {
            journalId: anJournal.id, fiscalPeriodId: firstNext.id, entryDate: openingDate, accountingDate: openingDate,
            entryNumber: aNouveauNumber, label: `Report à-nouveau — bilan d'ouverture ${nextYear}`,
            sourceType: 'year_open', sourceId: null, entryKind: `opening:${nextYear}`,
            totalDebit: totD, totalCredit: totC, status: 'validated', validatedById: userId, validatedAt: new Date(),
            lines: { create: anLines },
          },
        });
      }

      // 4. Verrouillage des écritures et périodes de l'exercice clôturé.
      const now = new Date();
      await tx.journalEntry.updateMany({
        where: { fiscalPeriodId: { in: periodIds }, status: { not: 'cancelled' } },
        data:  { status: 'locked', lockedAt: now },
      });
      await tx.fiscalPeriod.updateMany({
        where: { id: { in: periodIds } },
        data:  { status: 'locked', lockedAt: now, lockedById: userId },
      });

      return {
        year,
        resultat: { produits, charges, resultat, sens: resultat >= 0 ? 'benefice' : 'perte' },
        determinationEntry: determinationNumber,
        aNouveauEntry: aNouveauNumber,
        nextYearPeriodsCreated: nextPeriods.length,
        lockedPeriods: periodIds.length,
      };
    });
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
      data: { code: data.code, name: data.name, description: data.description ?? undefined, defaultAccountId: data.defaultAccountId ?? undefined, bankAccountId: data.bankAccountId ?? undefined, type: data.type as never, isActive: true, createdById: userId },
    });
  }

  async updateJournal(id: string, data: UpdateJournalInput) {
    const journal = await this.prisma.accountingJournal.findUnique({ where: { id } });
    if (!journal) throw AppError.notFound('Journal introuvable');
    // Allow-list des champs réellement persistés sur le modèle AccountingJournal.
    const updateData: Prisma.AccountingJournalUpdateInput = {};
    if (data.name             !== undefined) updateData.name             = data.name;
    if (data.description      !== undefined) updateData.description      = data.description ?? null;
    if (data.defaultAccountId !== undefined) updateData.defaultAccountId = data.defaultAccountId ?? null;
    if (data.bankAccountId    !== undefined) updateData.bankAccount      = data.bankAccountId ? { connect: { id: data.bankAccountId } } : { disconnect: true };
    if (data.type             !== undefined) updateData.type             = data.type as never;
    if (data.isActive         !== undefined) updateData.isActive         = data.isActive;
    return this.prisma.accountingJournal.update({ where: { id }, data: updateData });
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
        lines:        { orderBy: { sortOrder: 'asc' }, include: { account: { select: { accountNumber: true, name: true } } } },
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

    // Une écriture en partie double = au moins deux lignes.
    if (!data.lines || data.lines.length < 2)
      throw AppError.badRequest('Une écriture comptable requiert au moins deux lignes.');
    // Une ligne est à un seul sens (débit OU crédit), jamais les deux.
    if (data.lines.some((l) => l.debit > 0 && l.credit > 0))
      throw AppError.badRequest('Une ligne ne peut être à la fois au débit et au crédit.');

    const totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01)
      throw AppError.badRequest('Écriture non équilibrée : débit ≠ crédit');

    // Comptes existants (message clair en amont au lieu d'une violation FK = 500).
    const accts = [...new Set(data.lines.map((l) => l.accountNumber))];
    const known = await this.prisma.chartOfAccount.findMany({
      where: { accountNumber: { in: accts } }, select: { accountNumber: true },
    });
    const unknown = accts.filter((a) => !known.some((k) => k.accountNumber === a));
    if (unknown.length)
      throw AppError.badRequest(`Compte(s) inconnu(s) au plan comptable : ${unknown.join(', ')}.`);

    const [seqRow] = await this.prisma.$queryRaw<[{ nextval: string }]>`
      SELECT nextval('journal_entry_seq') AS nextval
    `.catch(() =>
      this.prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`
    );

    // Valeur COMPLÈTE de la séquence (globalement unique) — l'ancien slice(-6)
    // provoquait des collisions d'entryNumber dès que la séquence dépassait 999 999.
    const entryNumber    = `JNL-${entryDate.getFullYear()}-${String(seqRow.nextval).padStart(6, '0')}`;
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

  /**
   * Filet de sécurité SYSCOHADA : au-delà de l'équilibre des totaux d'en-tête
   * (`total_debit`/`total_credit`), on vérifie que la SOMME RÉELLE DES LIGNES
   * s'équilibre. Protège contre une écriture dont les en-têtes seraient corrects
   * mais dont les lignes divergeraient (partie double rompue).
   */
  private static assertLinesBalanced(lines: { debit: unknown; credit: unknown }[]): void {
    const debit  = lines.reduce((s, l) => s + Number(l.debit),  0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(debit - credit) >= 0.01)
      throw AppError.badRequest(
        `Écriture non équilibrée (lignes) : débit ${debit.toFixed(2)} ≠ crédit ${credit.toFixed(2)}`,
      );
  }

  async validateEntry(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where:   { id },
      include: {
        fiscalPeriod: { select: { status: true } },
        lines:        { select: { debit: true, credit: true } },
      },
    });
    if (!entry) throw AppError.notFound('Écriture introuvable');
    if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être validés');
    if (entry.fiscalPeriod.status !== 'open')
      throw AppError.forbidden('La période de cette écriture n\'est pas ouverte');
    if (Math.abs(Number(entry.totalDebit) - Number(entry.totalCredit)) >= 0.01)
      throw AppError.badRequest('Écriture non équilibrée : débit ≠ crédit');
    AccountingService.assertLinesBalanced(entry.lines);
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
      include: {
        fiscalPeriod: { select: { status: true } },
        lines:        { select: { debit: true, credit: true } },
      },
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
        skipped.push({ id: e.id, reason: 'non équilibrée (en-tête)' }); continue;
      }
      const ld = e.lines.reduce((s, l) => s + Number(l.debit),  0);
      const lc = e.lines.reduce((s, l) => s + Number(l.credit), 0);
      if (Math.abs(ld - lc) >= 0.01) {
        skipped.push({ id: e.id, reason: 'non équilibrée (lignes)' }); continue;
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
      select: {
        id: true, totalDebit: true, totalCredit: true,
        lines: { select: { debit: true, credit: true } },
      },
    });
    const balanced = candidates
      .filter((e) => {
        if (Math.abs(Number(e.totalDebit) - Number(e.totalCredit)) >= 0.01) return false;
        const ld = e.lines.reduce((s, l) => s + Number(l.debit),  0);
        const lc = e.lines.reduce((s, l) => s + Number(l.credit), 0);
        return Math.abs(ld - lc) < 0.01;
      })
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

  /** Map<numéroCompte, intitulé> pour enrichir le détail des postes. */
  private async getAccountNames(): Promise<Map<string, string>> {
    const accounts = await this.prisma.chartOfAccount.findMany({ select: { accountNumber: true, name: true } });
    return new Map(accounts.map((a) => [a.accountNumber, a.name]));
  }

  /**
   * Bilan SYSCOHADA (Système Normal) calculé depuis la balance, avec colonne N-1.
   * `detailed` = attache à chaque poste le détail des comptes qui le composent
   * (vue « bilan détaillé » pour la DAF).
   */
  /** Charge le modèle de rubriques du bilan depuis la base (modèle éditable). */
  private async loadBilanRubriques(): Promise<RubriqueDef[]> {
    const rows = await this.prisma.statementRubrique.findMany({
      orderBy: [{ masseOrder: 'asc' }, { lineOrder: 'asc' }],
    });
    return rows.map((r) => ({
      side:       r.side as 'actif' | 'passif',
      masseCode:  r.masseCode, masseLabel: r.masseLabel, masseOrder: r.masseOrder,
      code:       r.code, label: r.label, lineOrder: r.lineOrder,
      isResult:   r.isResult,
      sources:    (r.sources as unknown) as RubriqueSource[],
    }));
  }

  // ── Paramétrage des rubriques (modèle éditable « façon Sage ») ───────────────

  /** Liste les rubriques du bilan, regroupées et ordonnées (pour l'écran de paramétrage). */
  async listStatementRubriques() {
    return this.prisma.statementRubrique.findMany({
      orderBy: [{ side: 'asc' }, { masseOrder: 'asc' }, { lineOrder: 'asc' }],
    });
  }

  /** Met à jour le libellé et/ou les sources d'une rubrique (par code de poste). */
  async updateStatementRubrique(code: string, data: UpdateRubriqueInput) {
    const rubrique = await this.prisma.statementRubrique.findUnique({ where: { code } });
    if (!rubrique) throw AppError.notFound(`Rubrique ${code} introuvable`);
    if (rubrique.isResult && data.sources?.length)
      throw AppError.badRequest('Le résultat net est calculé automatiquement : ses comptes ne sont pas modifiables.');
    return this.prisma.statementRubrique.update({
      where: { code },
      data: {
        ...(data.label   !== undefined ? { label: data.label } : {}),
        ...(data.sources !== undefined ? { sources: data.sources as never } : {}),
      },
    });
  }

  /** Réinitialise toutes les rubriques au modèle SYSCOHADA d'origine (seed). */
  async resetStatementRubriques() {
    await this.prisma.$transaction(async (tx) => {
      await tx.statementRubrique.deleteMany({});
      await tx.statementRubrique.createMany({
        data: BILAN_RUBRIQUES.map((r) => ({
          side: r.side, masseCode: r.masseCode, masseLabel: r.masseLabel, masseOrder: r.masseOrder,
          code: r.code, label: r.label, lineOrder: r.lineOrder, isResult: r.isResult ?? false,
          sources: r.sources as never,
        })),
      });
    });
    return { reset: BILAN_RUBRIQUES.length };
  }

  async getBilan(scope: { fiscalPeriodId?: string; fiscalYear?: number }, detailed = false) {
    const b = await this.getBalancesMap(scope);
    // Exercice précédent (colonne Net N-1) — uniquement si un exercice est ciblé.
    const bN1 = scope.fiscalYear ? await this.getBalancesMap({ fiscalYear: scope.fiscalYear - 1 }) : undefined;

    // Modèle paramétrable (rubriques) si présent ; sinon repli sur le calcul en dur.
    const rubriques = await this.loadBilanRubriques();
    if (rubriques.length) {
      const names = detailed ? await this.getAccountNames() : undefined;
      return computeBilanFromRubriques(rubriques, b, bN1, names);
    }
    const bilan = computeBilan(b, bN1);
    if (detailed) attachBilanAccounts(bilan, b, await this.getAccountNames());
    return bilan;
  }

  /** Compte de résultat SYSCOHADA (SIG) calculé depuis la balance. */
  async getCompteResultat(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    return computeCompteResultat(await this.getBalancesMap(scope));
  }

  // ── Export PDF des états financiers ──────────────────────────────────────────

  private async statementMeta(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const settings = await this.prisma.companySettings.findFirst({
      select: {
        headerImagePath: true, footerImagePath: true, stampPath: true,
        companyName: true, taxNumber: true, rccm: true, address: true, city: true, defaultCurrency: true,
      },
    });
    const { headerImageB64, footerImageB64 } = resolveDocumentAssets(settings ?? null);
    let periodLabel = 'Toutes périodes';
    let closingDate: string | undefined;
    if (scope.fiscalYear) {
      periodLabel = `Exercice ${scope.fiscalYear}`;
      closingDate = `31/12/${scope.fiscalYear}`;
    } else if (scope.fiscalPeriodId) {
      const p = await this.prisma.fiscalPeriod.findUnique({ where: { id: scope.fiscalPeriodId }, select: { name: true, endDate: true } });
      if (p?.name) periodLabel = p.name;
      if (p?.endDate) closingDate = new Date(p.endDate).toLocaleDateString('fr-FR');
    }
    return {
      headerImg: headerImageB64, footerImg: footerImageB64, periodLabel, closingDate,
      companyName: settings?.companyName ?? 'Bridge Technologies Solutions',
      niu:      settings?.taxNumber ?? undefined,
      rccm:     settings?.rccm ?? undefined,
      address:  [settings?.address, settings?.city].filter(Boolean).join(', ') || undefined,
      currency: settings?.defaultCurrency ?? 'XAF',
    };
  }

  private static fmtXaf(n: number): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n));
  }

  async generateBilanPdf(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const bilan = await this.getBilan(scope);
    const meta = await this.statementMeta(scope);
    const f = AccountingService.fmtXaf;
    const n = (v: number) => (Math.abs(v) > 0.5 ? f(v) : '—');

    // Actif : 5 colonnes (Poste / Brut / Amort. / Net N / Net N-1), groupé par masse.
    const actifBody = bilan.actifMasses.map((m) => {
      const visible = m.lines.filter((l) => Math.abs(l.brut) > 0.5 || Math.abs(l.net) > 0.5 || Math.abs(l.netN1) > 0.5);
      if (visible.length === 0) return '';
      const rows = visible.map((l) =>
        `<tr><td><span class="code">${escapeHtml(l.code)}</span>${escapeHtml(l.label)}</td><td class="num">${n(l.brut)}</td><td class="num">${n(l.amortissements)}</td><td class="num">${f(l.net)}</td><td class="num">${n(l.netN1)}</td></tr>`,
      ).join('');
      if (m.lines.length === 1) return rows; // écart de conversion : ligne seule
      return `<tr class="masse-row"><td colspan="5">${escapeHtml(m.label)}</td></tr>${rows}` +
        `<tr class="total-row"><td><span class="code">${m.code}</span>Total ${escapeHtml(m.label.toLowerCase())}</td><td></td><td></td><td class="num">${f(m.totalNet)}</td><td class="num">${n(m.totalNetN1)}</td></tr>`;
    }).join('');

    // Passif : 3 colonnes (Poste / Net N / Net N-1), groupé par masse.
    const passifBody = bilan.passifMasses.map((m) => {
      const visible = m.lines.filter((l) => Math.abs(l.net) > 0.5 || Math.abs(l.netN1) > 0.5);
      if (visible.length === 0) return '';
      const rows = visible.map((l) =>
        `<tr${l.code === 'CH' ? ' class="solde-row"' : ''}><td><span class="code">${escapeHtml(l.code)}</span>${escapeHtml(l.label)}</td><td class="num">${f(l.net)}</td><td class="num">${n(l.netN1)}</td></tr>`,
      ).join('');
      if (m.lines.length === 1) return rows;
      return `<tr class="masse-row"><td colspan="3">${escapeHtml(m.label)}</td></tr>${rows}` +
        `<tr class="total-row"><td><span class="code">${m.code}</span>Total ${escapeHtml(m.label.toLowerCase())}</td><td class="num">${f(m.totalNet)}</td><td class="num">${n(m.totalNetN1)}</td></tr>`;
    }).join('');

    const cur = escapeHtml(meta.currency);
    const warnings =
      (bilan.equilibre ? '' : `<p style="color:#c0392b;font-size:10px;margin-top:8px;">⚠ Bilan déséquilibré : écart de ${f(Math.abs(bilan.ecart))} ${cur}.</p>`) +
      (Math.abs(bilan.comptesNonVentiles) > 0.5 ? `<p style="color:#b45309;font-size:10px;">⚠ Comptes non ventilés : ${f(Math.abs(bilan.comptesNonVentiles))} ${cur} à reclasser.</p>` : '');

    // Colgroups partagés corps + total (table-layout:fixed) pour aligner les colonnes.
    const actifCols  = '<colgroup><col style="width:34%"><col style="width:16.5%"><col style="width:16.5%"><col style="width:16.5%"><col style="width:16.5%"></colgroup>';
    const passifCols = '<colgroup><col style="width:52%"><col style="width:24%"><col style="width:24%"></colgroup>';
    const bodyHtml = `
      <div class="bilan-cols">
        <div class="bilan-col">
          <h2 class="sect">Actif</h2>
          <table class="bil">${actifCols}
            <thead><tr><th>Poste</th><th class="num">Brut</th><th class="num">Amort.</th><th class="num">Net N</th><th class="num">Net N-1</th></tr></thead>
            <tbody>${actifBody}</tbody>
          </table>
          <table class="bil bil-foot">${actifCols}
            <tbody><tr class="total-row total-general"><td colspan="3"><span class="code">BZ</span>TOTAL GÉNÉRAL ACTIF</td><td class="num">${f(bilan.totalActif)}</td><td class="num">${n(bilan.totalActifN1)}</td></tr></tbody>
          </table>
        </div>
        <div class="bilan-col">
          <h2 class="sect">Passif</h2>
          <table class="bil">${passifCols}
            <thead><tr><th>Poste</th><th class="num">Net N</th><th class="num">Net N-1</th></tr></thead>
            <tbody>${passifBody}</tbody>
          </table>
          <table class="bil bil-foot">${passifCols}
            <tbody><tr class="total-row total-general"><td><span class="code">DZ</span>TOTAL GÉNÉRAL PASSIF</td><td class="num">${f(bilan.totalPassif)}</td><td class="num">${n(bilan.totalPassifN1)}</td></tr></tbody>
          </table>
        </div>
      </div>${warnings}`;

    const html = buildStatementHtml({
      title: 'Bilan', subtitle: 'SYSCOHADA — Système Normal',
      periodLabel: meta.periodLabel, closingDate: meta.closingDate,
      companyName: meta.companyName, niu: meta.niu, rccm: meta.rccm, address: meta.address, currency: meta.currency,
      headerImg: meta.headerImg, footerImg: meta.footerImg, bodyHtml,
    });
    const buffer = await generatePdf(html);
    return { buffer, filename: `BTS_Bilan_${meta.periodLabel.replace(/[^\w]+/g, '-')}.pdf` };
  }

  async generateCompteResultatPdf(scope: { fiscalPeriodId?: string; fiscalYear?: number }) {
    const cr = await this.getCompteResultat(scope);
    const meta = await this.statementMeta(scope);
    const f = AccountingService.fmtXaf;

    const rows = cr.lines
      .filter((l) => l.kind === 'solde' || Math.abs(l.amount) > 0.5)
      .map((l) => {
        const val = l.kind === 'charge' && l.amount > 0 ? `(${f(Math.abs(l.amount))})` : f(Math.abs(l.amount));
        return `<tr${l.kind === 'solde' ? ' class="solde-row"' : ''}><td><span class="code">${escapeHtml(l.code)}</span>${escapeHtml(l.label)}</td><td class="num">${val}</td></tr>`;
      })
      .join('');

    const bodyHtml = `<table><tbody>${rows}</tbody></table>
      <p style="font-size:9px;color:#888;margin-top:6px;">Charges entre parenthèses. Soldes intermédiaires de gestion en gras.</p>`;

    const html = buildStatementHtml({
      title: 'Compte de résultat', subtitle: 'SYSCOHADA — Soldes intermédiaires de gestion',
      periodLabel: meta.periodLabel, closingDate: meta.closingDate,
      companyName: meta.companyName, niu: meta.niu, rccm: meta.rccm, address: meta.address, currency: meta.currency,
      headerImg: meta.headerImg, footerImg: meta.footerImg, bodyHtml,
    });
    const buffer = await generatePdf(html);
    return { buffer, filename: `BTS_Compte-resultat_${meta.periodLabel.replace(/[^\w]+/g, '-')}.pdf` };
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

  /**
   * Prochain code de lettrage d'un compte. On prend le MAX réel (bijective base-26 :
   * d'abord la longueur, puis l'ordre alphabétique) et non « le dernier par date » —
   * sinon, après suppression/recréation, on risquait de réutiliser un code.
   * À appeler dans une transaction déjà protégée par le verrou (voir _letterCore).
   */
  private async _nextLetteringCode(tx: Prisma.TransactionClient, accountNumber: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ lettering_code: string }>>`
      SELECT lettering_code FROM journal_entry_lines
      WHERE account_number = ${accountNumber} AND lettering_code IS NOT NULL
      ORDER BY LENGTH(lettering_code) DESC, lettering_code DESC
      LIMIT 1
    `;
    return this.generateNextCode(rows[0]?.lettering_code ?? null);
  }

  async letterLinesAuto(lineIds: string[], userId: string): Promise<{ letteringCode: string }> {
    const ids = [...new Set(lineIds)];
    if (ids.length < 2) throw AppError.badRequest('Au moins 2 lignes distinctes requises');
    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { id: { in: ids } },
      select: { id: true, accountNumber: true },
    });
    if (lines.length !== ids.length) throw AppError.notFound('Une ou plusieurs lignes introuvables');
    const accountNumbers = [...new Set(lines.map(l => l.accountNumber))];
    if (accountNumbers.length > 1)
      throw AppError.badRequest(`Les lignes appartiennent à plusieurs comptes : ${accountNumbers.join(', ')}`);
    return this.letterLines({ lineIds: ids, accountNumber: accountNumbers[0]! }, userId);
  }

  async letterLines(input: ManualLetteringInput, userId: string): Promise<{ letteringCode: string }> {
    const { accountNumber } = input;
    const lineIds = [...new Set(input.lineIds)];
    if (lineIds.length < 2) throw AppError.badRequest('Au moins 2 lignes distinctes requises');

    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { id: { in: lineIds } },
      select: {
        id: true, accountNumber: true, debit: true, credit: true, letteringCode: true,
        journalEntry: { select: { fiscalPeriod: { select: { status: true } } } },
      },
    });

    if (lines.length !== lineIds.length)
      throw AppError.notFound('Une ou plusieurs lignes introuvables');

    const wrongAccount = lines.find(l => l.accountNumber !== accountNumber);
    if (wrongAccount)
      throw AppError.badRequest(`La ligne ${wrongAccount.id} appartient au compte ${wrongAccount.accountNumber}, pas ${accountNumber}`);

    // Le compte doit être déclaré lettrable (flag SYSCOHADA `allowsReconciliation`) :
    // on ne lettre pas un compte de charge/produit/trésorerie.
    const account = await this.prisma.chartOfAccount.findUnique({
      where:  { accountNumber },
      select: { allowsReconciliation: true },
    });
    if (!account) throw AppError.notFound(`Compte ${accountNumber} introuvable`);
    if (!account.allowsReconciliation)
      throw AppError.badRequest(`Le compte ${accountNumber} n'est pas lettrable.`, 'ACCOUNT_NOT_RECONCILABLE');

    // Aucune ligne d'un exercice clôturé/verrouillé (cohérent avec le reste du module).
    if (lines.some(l => l.journalEntry?.fiscalPeriod?.status !== 'open'))
      throw AppError.forbidden('Lettrage impossible : une écriture appartient à une période non ouverte.');

    const alreadyLettered = lines.find(l => l.letteringCode);
    if (alreadyLettered)
      throw AppError.conflict(`La ligne ${alreadyLettered.id} est déjà lettrée (${alreadyLettered.letteringCode})`);

    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      throw AppError.badRequest(`Lettrage non équilibré : débit ${totalDebit} ≠ crédit ${totalCredit}`);

    return this.prisma.$transaction(async (tx) => {
      // Verrou par compte : sérialise la génération du code pour empêcher deux
      // lettrages concurrents de produire le même code (fusion accidentelle).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountNumber}))`;
      const code = await this._nextLetteringCode(tx, accountNumber);
      await tx.journalEntryLine.updateMany({
        where: { id: { in: lineIds } },
        data:  { letteringCode: code, letteredAt: new Date(), letteredById: userId },
      });
      return { letteringCode: code };
    });
  }

  async deleteLettering(code: string, accountNumber: string): Promise<void> {
    if (!accountNumber) throw AppError.badRequest('Numéro de compte requis');
    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { letteringCode: code, accountNumber },
      select: { id: true, journalEntry: { select: { fiscalPeriod: { select: { status: true } } } } },
    });
    if (lines.length === 0)
      throw AppError.notFound(`Aucune ligne lettrée avec le code "${code}" sur le compte ${accountNumber}`);
    // On ne délettre pas des écritures d'un exercice clôturé/verrouillé.
    if (lines.some(l => l.journalEntry?.fiscalPeriod?.status !== 'open'))
      throw AppError.forbidden('Délettrage impossible : une écriture appartient à une période non ouverte.');
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

    const [data, total, sums] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'asc' },
        include: {
          journalEntry: {
            select: { entryNumber: true, entryDate: true, label: true, sourceType: true, sourceId: true, journal: { select: { code: true } } },
          },
        },
      }),
      this.prisma.journalEntryLine.count({ where }),
      // Totaux calculés sur TOUT le compte (pas la seule page) — sinon le solde
      // « à lettrer » était faux dès qu'il y avait plus d'une page de lignes.
      this.prisma.journalEntryLine.aggregate({ where, _sum: { debit: true, credit: true } }),
    ]);

    const totalDebit  = Number(sums._sum.debit  ?? 0);
    const totalCredit = Number(sums._sum.credit ?? 0);

    // Aplatissement vers la forme plate attendue par le frontend (mêmes champs
    // que les groupes lettrés) : date / n° pièce / journal n'apparaissaient pas.
    const flat = data.map((l: any) => ({
      id:          l.id,
      entryId:     l.journalEntryId,
      entryNumber: l.journalEntry?.entryNumber ?? '',
      journalCode: l.journalEntry?.journal?.code ?? '',
      date:        l.journalEntry?.entryDate?.toISOString().split('T')[0] ?? '',
      label:       l.label,
      debit:       Number(l.debit),
      credit:      Number(l.credit),
      letterCode:  l.letteringCode,
    }));

    return { data: flat, total, page, limit, totalPages: Math.ceil(total / limit), totalDebit, totalCredit, balance: totalDebit - totalCredit };
  }

  // Nombre maximum de groupes lettrés renvoyés en une fois (les plus récents) —
  // borne mémoire : sans date, un compte ancien pouvait charger tout son historique.
  private static readonly LETTERED_GROUPS_LIMIT = 500;

  async getLeteredGroups(accountNumber: string, dateFrom?: string, dateTo?: string) {
    const lineWhere: Prisma.JournalEntryLineWhereInput = {
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
    };

    // On borne au N codes les plus récents (par date de lettrage) au lieu de charger
    // tout l'historique, puis on récupère les lignes de ces seuls codes.
    const recentCodes = await this.prisma.journalEntryLine.groupBy({
      by:      ['letteringCode'],
      where:   lineWhere,
      _max:    { letteredAt: true },
      orderBy: { _max: { letteredAt: 'desc' } },
      take:    AccountingService.LETTERED_GROUPS_LIMIT,
    });
    const codes = recentCodes.map(c => c.letteringCode!).filter(Boolean);
    if (codes.length === 0) return [];

    const lines = await this.prisma.journalEntryLine.findMany({
      where: { ...lineWhere, letteringCode: { in: codes } },
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

  // ── Lettrage automatique : PROPOSITIONS ──────────────────────────────────────

  /**
   * Propose des groupes de lettrage équilibrés sur un compte : pour chaque ligne
   * d'un sens, cherche un sous-ensemble de lignes du sens opposé dont la somme
   * l'égale (ex. un règlement soldant une ou plusieurs factures). Ne modifie rien
   * (suggestions) — l'utilisateur valide ensuite via letterLines. Réutilise le
   * `subsetSum` du rapprochement bancaire.
   */
  async suggestLettering(accountNumber: string, dateFrom?: string, dateTo?: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { accountNumber }, select: { allowsReconciliation: true },
    });
    if (!account) throw AppError.notFound(`Compte ${accountNumber} introuvable`);
    if (!account.allowsReconciliation)
      throw AppError.badRequest(`Le compte ${accountNumber} n'est pas lettrable.`, 'ACCOUNT_NOT_RECONCILABLE');

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountNumber, letteringCode: null,
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
      select: { id: true, debit: true, credit: true, label: true, journalEntry: { select: { entryDate: true } } },
      orderBy: { createdAt: 'asc' },
      take: 300, // borne : le subset-sum est exponentiel dans le pire cas
    });

    const debits  = lines.filter(l => Number(l.debit)  > 0).map(l => ({ id: l.id, amount: Number(l.debit),  label: l.label ?? '', date: l.journalEntry?.entryDate ?? new Date() }));
    const credits = lines.filter(l => Number(l.credit) > 0).map(l => ({ id: l.id, amount: Number(l.credit), label: l.label ?? '', date: l.journalEntry?.entryDate ?? new Date() }));

    const used = new Set<string>();
    const suggestions: Array<{ lineIds: string[]; total: number; debitIds: string[]; creditIds: string[] }> = [];

    // On solde chaque ligne « one-side » par un sous-ensemble de l'autre sens.
    // On part du plus petit nombre de lignes (les crédits, souvent des règlements).
    const [anchors, others, anchorIsCredit] = credits.length <= debits.length
      ? [credits, debits, true]
      : [debits, credits, false];

    for (const anchor of anchors) {
      if (used.has(anchor.id)) continue;
      const pool: SubsetCandidate[] = others.filter(o => !used.has(o.id));
      const tol = Math.max(1, anchor.amount * 0.001);
      const [match] = subsetSum(pool, anchor.amount, tol, 6, 1);
      if (!match) continue;
      const otherIds = match.ids;
      if (otherIds.some(id => used.has(id))) continue;
      used.add(anchor.id);
      otherIds.forEach(id => used.add(id));
      const debitIds  = anchorIsCredit ? otherIds : [anchor.id];
      const creditIds = anchorIsCredit ? [anchor.id] : otherIds;
      suggestions.push({ lineIds: [anchor.id, ...otherIds], total: anchor.amount, debitIds, creditIds });
    }

    return { accountNumber, count: suggestions.length, suggestions };
  }

  // ── Lettrage partiel / écart de règlement ────────────────────────────────────

  /**
   * Lettre un groupe DÉSÉQUILIBRÉ en imputant le résidu sur un compte d'écart
   * (escompte/frais/arrondi). On crée une écriture d'écart (brouillon) : une ligne
   * sur le compte de tiers qui absorbe le résidu — lettrée avec le groupe pour
   * l'équilibrer — et sa contrepartie sur le compte d'écart. Le résidu doit rester
   * sous un plafond de sécurité.
   */
  async letterLinesWithDifference(
    input: { lineIds: string[]; accountNumber: string; differenceAccount?: string; label?: string },
    userId: string,
  ): Promise<{ letteringCode: string; difference: number; entryId: string }> {
    const accountNumber = input.accountNumber;
    const lineIds = [...new Set(input.lineIds)];
    if (lineIds.length < 1) throw AppError.badRequest('Au moins une ligne requise');

    const lines = await this.prisma.journalEntryLine.findMany({
      where:  { id: { in: lineIds } },
      select: {
        id: true, accountNumber: true, debit: true, credit: true, letteringCode: true,
        journalEntry: { select: { entryDate: true, fiscalPeriod: { select: { status: true } } } },
      },
    });
    if (lines.length !== lineIds.length) throw AppError.notFound('Une ou plusieurs lignes introuvables');
    if (lines.some(l => l.accountNumber !== accountNumber))
      throw AppError.badRequest('Toutes les lignes doivent appartenir au même compte.');
    if (lines.some(l => l.letteringCode))
      throw AppError.conflict('Une ligne est déjà lettrée.');
    if (lines.some(l => l.journalEntry?.fiscalPeriod?.status !== 'open'))
      throw AppError.forbidden('Lettrage impossible : une écriture appartient à une période non ouverte.');

    const account = await this.prisma.chartOfAccount.findUnique({
      where: { accountNumber }, select: { allowsReconciliation: true },
    });
    if (!account?.allowsReconciliation)
      throw AppError.badRequest(`Le compte ${accountNumber} n'est pas lettrable.`, 'ACCOUNT_NOT_RECONCILABLE');

    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    const difference  = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(difference) < 0.01)
      throw AppError.badRequest('Groupe déjà équilibré : utilisez le lettrage simple.', 'ALREADY_BALANCED');

    // Plafond de sécurité : on ne « passe en écart » qu'un petit résidu (escompte,
    // frais, arrondi), jamais un demi-règlement. 5 % de la plus grosse jambe.
    const ceiling = Math.max(1000, Math.max(totalDebit, totalCredit) * 0.05);
    if (Math.abs(difference) > ceiling)
      throw AppError.badRequest(
        `Écart trop important (${difference.toLocaleString('fr-FR')}) : au-delà du seuil d'écart de règlement.`,
        'DIFFERENCE_TOO_LARGE',
      );

    // Compte d'écart : fourni, sinon compte d'escompte de l'entreprise (673).
    const settings = await this.prisma.companySettings.findFirst({ select: { escompteAccountingAccount: true } });
    const differenceAccount = input.differenceAccount ?? settings?.escompteAccountingAccount;
    if (!differenceAccount)
      throw AppError.badRequest("Aucun compte d'écart configuré (escompte) — précisez differenceAccount.", 'NO_DIFFERENCE_ACCOUNT');

    // Journal d'opérations diverses pour l'écriture d'écart.
    const journal = await this.prisma.accountingJournal.findFirst({
      where: { isActive: true, type: { in: ['operations', 'misc'] as any } },
      orderBy: { type: 'asc' },
    });
    if (!journal) throw AppError.badRequest("Aucun journal d'opérations diverses disponible.", 'NO_OD_JOURNAL');

    const entryDate = new Date();
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { startDate: { lte: entryDate }, endDate: { gte: entryDate }, status: 'open' as any },
      orderBy: { startDate: 'asc' },
    });
    if (!period) throw AppError.forbidden(`Aucune période ouverte pour le ${entryDate.toLocaleDateString('fr-FR')}.`);

    const [seqRow] = await this.prisma.$queryRaw<[{ nextval: string }]>`
      SELECT nextval('journal_entry_seq') AS nextval
    `.catch(() => this.prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`);
    const entryNumber = `JNL-${entryDate.getFullYear()}-${String(seqRow.nextval).slice(-6).padStart(6, '0')}`;

    // difference > 0 : le compte de tiers est trop débiteur → on le CRÉDITE du résidu
    // (et on débite le compte d'écart) pour équilibrer le groupe. Inversement sinon.
    const absDiff       = Math.abs(difference);
    const tiersIsCredit = difference > 0;
    const label         = input.label ?? `Écart de règlement — lettrage ${accountNumber}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountNumber}))`;

      const entry = await tx.journalEntry.create({
        data: {
          journalId: journal.id, fiscalPeriodId: period.id,
          entryDate, accountingDate: entryDate, label, entryNumber,
          sourceType: 'lettering_difference', status: 'draft',
          totalDebit: absDiff, totalCredit: absDiff, createdById: userId,
          lines: {
            create: [
              { sortOrder: 0, accountNumber,            label, debit: tiersIsCredit ? 0 : absDiff, credit: tiersIsCredit ? absDiff : 0 },
              { sortOrder: 1, accountNumber: differenceAccount, label, debit: tiersIsCredit ? absDiff : 0, credit: tiersIsCredit ? 0 : absDiff },
            ],
          },
        },
        include: { lines: true },
      });

      // La ligne de tiers de l'écriture d'écart rejoint le groupe → il s'équilibre.
      const tiersLine = entry.lines.find(l => l.accountNumber === accountNumber)!;
      const code = await this._nextLetteringCode(tx, accountNumber);
      await tx.journalEntryLine.updateMany({
        where: { id: { in: [...lineIds, tiersLine.id] } },
        data:  { letteringCode: code, letteredAt: new Date(), letteredById: userId },
      });

      return { letteringCode: code, difference, entryId: entry.id };
    });
  }
}
