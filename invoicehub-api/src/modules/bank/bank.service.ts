// src/modules/bank/bank.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';
import {
  CreateBankAccountInput, UpdateBankAccountInput,
  CreateTransactionInput, ReconcileInput, OpenReconciliationInput,
  ImportCsvInput, DetectFormatInput,
} from './bank.schema';
import {
  decodeBuffer, autoDetectFormat, parseStatementFile,
  detectFileFormat, computeContentHash,
  DetectedFormat, ImportPreview, FileFormat,
} from './bank.parsers';
import type { BankProfile } from './bank.profiles';
import {
  computeScore, subsetSum, hungarian, SubsetCandidate,
} from './bank.matching';

export interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  lines:         unknown[];
}

@Injectable()
export class BankService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(BANK_IMPORT_QUEUE) private bankImportQueue: Queue<BankImportJobData>,
  ) {}

  // ── Résumé ─────────────────────────────────────────────────────────────────

  async getBankSummary() {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [accounts, unreconciledCount, openReconciliations, importsThisMonth] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true, name: true, bankName: true, currentBalance: true, currency: true, color: true,
          _count: { select: { transactions: { where: { reconciliationStatus: 'pending' } } } },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.bankTransaction.count({
        where: { reconciliationStatus: 'pending', bankAccount: { deletedAt: null } },
      }),
      this.prisma.bankReconciliation.count({ where: { status: 'open' } }),
      this.prisma.bankStatementImport.count({ where: { importedAt: { gte: startOfMonth } } }),
    ]);

    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.currentBalance ?? 0), 0);

    return {
      totalBalance,
      accountsCount: accounts.length,
      unreconciledCount,
      openReconciliations,
      importsThisMonth,
      accounts: accounts.map((a) => ({
        id:             a.id,
        name:           a.name,
        bankName:       a.bankName,
        currentBalance: Number(a.currentBalance),
        currency:       a.currency,
        color:          a.color,
        pendingCount:   a._count.transactions,
      })),
    };
  }

  // ── Comptes bancaires ───────────────────────────────────────────────────────

  async listAccounts() {
    return this.prisma.bankAccount.findMany({
      where:   { deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true } } },
    });
  }

  async getAccountById(id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where:   { id, deletedAt: null },
      include: { transactions: { orderBy: { transactionDate: 'desc' }, take: 10 } },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    return account;
  }

  async createAccount(data: CreateBankAccountInput) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { isDefault: true, deletedAt: null },
          data:  { isDefault: false },
        });
      }
      return tx.bankAccount.create({
        data: {
          name:              data.name,
          bankName:          data.bankName,
          accountNumber:     data.accountNumber   ?? undefined,
          branchName:        data.branchName       ?? undefined,
          iban:              data.iban              ?? undefined,
          swiftBic:          data.swiftBic          ?? undefined,
          currency:          data.currency,
          openingBalance:    data.openingBalance,
          currentBalance:    data.openingBalance,
          isDefault:         data.isDefault,
          accountingAccount: data.accountingAccount ?? undefined,
          color:             data.color             ?? undefined,
          notes:             data.notes             ?? undefined,
        },
      });
    });
  }

  async updateAccount(id: string, data: UpdateBankAccountInput) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    // Le solde d'ouverture est figé dès qu'il existe au moins un mouvement (sinon il
    // désynchroniserait le solde courant et fausserait les rapprochements). On
    // l'autorise tant que le compte n'a aucune transaction, en resynchronisant alors
    // le solde courant. Sinon on l'ignore / le rejette.
    const { openingBalance, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };

    if (openingBalance !== undefined && Number(openingBalance) !== Number(account.openingBalance)) {
      const movements = await this.prisma.bankTransaction.count({ where: { bankAccountId: id } });
      if (movements > 0) {
        throw AppError.conflict(
          "Le solde d'ouverture ne peut plus être modifié : ce compte a déjà des mouvements.",
        );
      }
      updateData['openingBalance'] = openingBalance;
      updateData['currentBalance'] = openingBalance; // aucun mouvement → resynchronisation
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { isDefault: true, deletedAt: null, id: { not: id } },
          data:  { isDefault: false },
        });
      }
      return tx.bankAccount.update({ where: { id }, data: updateData });
    });
  }

  async deleteAccount(id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    if (Number(account.currentBalance) !== 0) {
      throw AppError.conflict('Impossible de supprimer un compte avec un solde non nul');
    }
    await this.prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async listTransactions(params: {
    page: number; limit: number;
    accountId?: string; type?: string;
    dateFrom?: string; dateTo?: string;
    reconciled?: boolean; search?: string;
  }) {
    const { page, limit, accountId, type, dateFrom, dateTo, reconciled, search } = params;
    const where: Record<string, unknown> = {};
    if (accountId) where['bankAccountId'] = accountId;
    if (type)      where['type']           = type;
    if (typeof reconciled === 'boolean') {
      where['reconciliationStatus'] = reconciled ? 'reconciled' : 'pending';
    }
    if (dateFrom || dateTo) {
      where['transactionDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    if (search) {
      where['OR'] = [
        { label:     { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip:     (page - 1) * limit,
        take:     limit,
        orderBy:  { transactionDate: 'desc' },
        include:  { bankAccount: { select: { id: true, name: true, currency: true } } },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return { data, total };
  }

  async getTransactionById(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({
      where:   { id },
      include: { bankAccount: true },
    });
    if (!t) throw AppError.notFound('Transaction introuvable');
    return t;
  }

  async createTransaction(data: CreateTransactionInput) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, deletedAt: null },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const delta = data.type === 'credit' ? data.amount : -data.amount;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.bankTransaction.create({
        data: {
          bankAccountId:   data.bankAccountId,
          transactionDate: data.transactionDate,
          label:           data.label,
          amount:          data.amount,
          type:            data.type,
          reference:       data.reference ?? undefined,
          category:        data.category  ?? undefined,
          notes:           data.notes     ?? undefined,
        },
      });
      await tx.bankAccount.update({
        where: { id: data.bankAccountId },
        data:  { currentBalance: { increment: delta } },
      });
      return transaction;
    });
  }

  // ── Suggestions de matching ─────────────────────────────────────────────────

  async getSuggestions(transactionId: string) {
    const tx0 = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx0) throw AppError.notFound('Transaction introuvable');
    if (tx0.reconciliationStatus === 'reconciled') return { suggestions: [] };

    const amount    = Number(tx0.amount);
    const tolerance = Math.max(1, amount * 0.05);
    const dateFrom  = new Date(tx0.transactionDate);
    dateFrom.setDate(dateFrom.getDate() - 10);
    const dateTo = new Date(tx0.transactionDate);
    dateTo.setDate(dateTo.getDate() + 10);

    const [payments, supplierPayments, expenses, matchingRules] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amount:      { gte: amount - tolerance, lte: amount + tolerance },
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        include: { invoice: { select: { number: true } } },
        take: 5,
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amount:      { gte: amount - tolerance, lte: amount + tolerance },
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        include: { supplierInvoice: { select: { supplierInvoiceNumber: true } } },
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: {
          deletedAt: null, bankTransactionId: null,
          amountTtc:   { gte: amount - tolerance, lte: amount + tolerance },
          expenseDate: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true, number: true, title: true, amountTtc: true, expenseDate: true },
        take: 5,
      }),
      this.prisma.bankMatchingRule.findMany({
        where: { bankAccountId: tx0.bankAccountId, isActive: true },
      }),
    ]);

    const getRuleBonus = (entityLabel: string, entityAmount: number): number => {
      for (const rule of matchingRules) {
        if (rule.confidence < 3) continue;
        const labelMatch = entityLabel.toLowerCase().includes(rule.labelContains.toLowerCase());
        const amountOk   = (!rule.amountMin || entityAmount >= Number(rule.amountMin))
                        && (!rule.amountMax || entityAmount <= Number(rule.amountMax));
        if (labelMatch && amountOk) return 15;
      }
      return 0;
    };

    const score = (entityAmount: number, entityDate: Date, entityLabel: string, entityRef?: string | null) =>
      computeScore({
        entityAmount, entityDate, entityLabel, entityRef,
        txAmount:  amount,
        txDate:    tx0.transactionDate,
        txLabel:   tx0.label,
        txRef:     tx0.reference,
        ruleBonus: getRuleBonus(entityLabel, entityAmount),
      });

    const suggestions: Array<{
      entityType: string; entityId: string; label: string;
      amount: number; date: Date; score: number; scoreDetail: object;
    }> = [];

    for (const p of payments) {
      const lbl    = `Paiement FAC ${p.invoice?.number ?? ''} — ${Number(p.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score(Number(p.amount), p.paymentDate, lbl, p.reference);
      suggestions.push({ entityType: 'payment', entityId: p.id, label: lbl, amount: Number(p.amount), date: p.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const sp of supplierPayments) {
      const lbl    = `Paiement fournisseur ${sp.supplierInvoice?.supplierInvoiceNumber ?? ''} — ${Number(sp.amount).toLocaleString('fr-FR')} XAF`;
      const detail = score(Number(sp.amount), sp.paymentDate, lbl, sp.reference);
      suggestions.push({ entityType: 'supplier_payment', entityId: sp.id, label: lbl, amount: Number(sp.amount), date: sp.paymentDate, score: detail.total, scoreDetail: detail });
    }
    for (const e of expenses) {
      const lbl    = `Dépense ${e.number} — ${e.title}`;
      const detail = score(Number(e.amountTtc), e.expenseDate, lbl);
      suggestions.push({ entityType: 'expense', entityId: e.id, label: lbl, amount: Number(e.amountTtc), date: e.expenseDate, score: detail.total, scoreDetail: detail });
    }

    suggestions.sort((a, b) => b.score - a.score);
    return { transaction: tx0, suggestions: suggestions.slice(0, 10) };
  }

  // ── Réconciliation d'une transaction ────────────────────────────────────────

  async reconcileTransaction(id: string, data: ReconcileInput, userId?: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.reconciliationStatus === 'reconciled') throw AppError.conflict('Transaction déjà rapprochée');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bankTransaction.update({
        where: { id },
        data: {
          reconciliationStatus: 'reconciled',
          reconciledAt:         now,
          reconciledById:       userId ?? undefined,
          matchedEntityType:    data.matchedEntityType,
          matchedEntityId:      data.matchedEntityId,
        },
      });

      if (data.matchedEntityType === 'payment') {
        await tx.payment.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id, reconciledAt: now, reconciledById: userId ?? undefined },
        });
      } else if (data.matchedEntityType === 'supplier_payment') {
        await tx.supplierPayment.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id, reconciledAt: now, reconciledById: userId ?? undefined },
        });
      } else if (data.matchedEntityType === 'expense') {
        await tx.expense.updateMany({
          where: { id: data.matchedEntityId, deletedAt: null, bankTransactionId: null },
          data:  { bankTransactionId: id },
        });
      }

      return result;
    });

    // Apprentissage automatique
    if (userId) {
      this.learnMatchingRule(id, data.matchedEntityType, data.matchedEntityId, userId).catch(() => {});
    }

    return updated;
  }

  async unmatchTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    if (t.reconciliationStatus !== 'reconciled') throw AppError.badRequest('Transaction non rapprochée');

    return this.prisma.$transaction(async (tx) => {
      if (t.matchedEntityType === 'payment' && t.matchedEntityId) {
        await tx.payment.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null, reconciledAt: null, reconciledById: null },
        });
      } else if (t.matchedEntityType === 'supplier_payment' && t.matchedEntityId) {
        await tx.supplierPayment.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null, reconciledAt: null, reconciledById: null },
        });
      } else if (t.matchedEntityType === 'expense' && t.matchedEntityId) {
        await tx.expense.updateMany({
          where: { id: t.matchedEntityId, bankTransactionId: id },
          data:  { bankTransactionId: null },
        });
      }
      return tx.bankTransaction.update({
        where: { id },
        data: {
          reconciliationStatus: 'pending',
          reconciledAt:         null,
          matchedEntityType:    null,
          matchedEntityId:      null,
        },
      });
    });
  }

  async ignoreTransaction(id: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Transaction introuvable');
    return this.prisma.bankTransaction.update({ where: { id }, data: { reconciliationStatus: 'ignored' } });
  }

  // ── Rapprochements ──────────────────────────────────────────────────────────

  async listReconciliations(params: { page: number; limit: number; accountId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.accountId) where['bankAccountId'] = params.accountId;

    const [data, total] = await Promise.all([
      this.prisma.bankReconciliation.findMany({
        where,
        skip:    (params.page - 1) * params.limit,
        take:    params.limit,
        orderBy: { periodStart: 'desc' },
        include: { bankAccount: { select: { id: true, name: true } } },
      }),
      this.prisma.bankReconciliation.count({ where }),
    ]);
    return { data, total };
  }

  async getReconciliationById(id: string) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where:   { id },
      include: { bankAccount: true },
    });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');
    return r;
  }

  async openReconciliation(data: OpenReconciliationInput, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    return this.prisma.bankReconciliation.create({
      data: {
        bankAccountId:           data.bankAccountId,
        periodStart:             data.periodStart,
        periodEnd:               data.periodEnd,
        openingBalance:          data.openingBalance,
        closingBalanceStatement: 0,
        closingBalanceSystem:    Number(account.currentBalance),
        notes:                   data.notes ?? undefined,
        status:                  'in_progress',
        createdById:             userId,
      },
    });
  }

  async getReconciliationReport(id: string) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where:   { id },
      include: { bankAccount: { select: { id: true, name: true, currency: true } } },
    });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const [reconciledTxns, pendingCount, ignoredCount] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'reconciled',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
        select: { type: true, amount: true },
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'ignored',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
      }),
    ]);

    let totalCredits = 0, totalDebits = 0;
    for (const t of reconciledTxns) {
      if (t.type === 'credit') totalCredits += Number(t.amount);
      else totalDebits += Number(t.amount);
    }

    const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
    const closingBalanceSystem    = Number(r.closingBalanceSystem);
    const gap                     = closingBalanceStatement - closingBalanceSystem;

    return {
      reconciliation: r,
      openingBalance: Number(r.openingBalance),
      totalCredits, totalDebits,
      closingBalanceStatement, closingBalanceSystem,
      gap,
      isBalanced:      Math.abs(gap) < 1,
      reconciledCount: reconciledTxns.length,
      pendingCount, ignoredCount,
    };
  }

  async completeReconciliation(id: string, userId: string) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');
    if (r.status !== 'in_progress') throw AppError.badRequest('Session déjà clôturée');

    return this.prisma.$transaction(async (tx) => {
      const reconciledTxns = await tx.bankTransaction.findMany({
        where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'reconciled',
                 transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
        select: { type: true, amount: true },
      });

      let totalCredits = 0, totalDebits = 0;
      for (const t of reconciledTxns) {
        if (t.type === 'credit') totalCredits += Number(t.amount);
        else totalDebits += Number(t.amount);
      }

      const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
      const closingBalanceSystem    = Number(r.closingBalanceSystem);
      const now                     = new Date();

      const [updated] = await Promise.all([
        tx.bankReconciliation.update({
          where: { id },
          data: {
            status:                 'completed',
            completedAt:            now,
            completedById:          userId,
            closingBalanceStatement,
            isBalanced:             Math.abs(closingBalanceStatement - closingBalanceSystem) < 1,
          },
        }),
        tx.bankAccount.update({
          where: { id: r.bankAccountId },
          data:  { lastReconciledDate: r.periodEnd },
        }),
      ]);

      return updated;
    });
  }

  // ── Import CSV (ancien pipeline — déprécié) ─────────────────────────────────

  async importCsv(csvContent: string, params: ImportCsvInput, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: params.bankAccountId, deletedAt: null },
    });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const lines   = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) throw AppError.badRequest('Le fichier CSV est vide ou ne contient pas d\'en-tête');

    const parseCsvLine = (line: string, delimiter: string): string[] => {
      const result: string[] = [];
      let cur = ''; let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === delimiter && !inQuotes) { result.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      result.push(cur.trim());
      return result;
    };

    const parseDate = (raw: string, format: ImportCsvInput['dateFormat']): Date | null => {
      const s = raw.trim();
      let day: number, month: number, year: number;
      if (format === 'DD/MM/YYYY') [day, month, year] = s.split('/').map(Number) as [number, number, number];
      else if (format === 'MM/DD/YYYY') [month, day, year] = s.split('/').map(Number) as [number, number, number];
      else [year, month, day] = s.split('-').map(Number) as [number, number, number];
      // Date calendaire → construite en UTC : minuit LOCAL décalait la date d'un jour
      // en arrière à l'écriture dans la colonne `@db.Date` (cf. parseDate dans bank.parsers).
      const d = new Date(Date.UTC(year, month - 1, day));
      return isNaN(d.getTime()) ? null : d;
    };

    const headers  = parseCsvLine(lines[0]!, params.delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const colIndex = (name: string) => {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = headers.indexOf(key);
      if (idx === -1) throw AppError.badRequest(`Colonne "${name}" introuvable dans le CSV`);
      return idx;
    };

    const dateIdx  = colIndex(params.dateColumn);
    const labelIdx = colIndex(params.labelColumn);
    const debitIdx = colIndex(params.debitColumn);
    const creditIdx = colIndex(params.creditColumn);
    const refIdx   = params.referenceColumn ? headers.indexOf(params.referenceColumn.toLowerCase().replace(/[^a-z0-9]/g, '')) : -1;

    const toCreate: Array<{
      bankAccountId: string; transactionDate: Date; label: string;
      amount: number; type: 'debit' | 'credit'; reference?: string; source: string;
    }> = [];

    let skipped = 0, totalCredits = 0, totalDebits = 0;
    let periodStart: Date | null = null, periodEnd: Date | null = null;

    for (const raw of lines.slice(1)) {
      const cols     = parseCsvLine(raw, params.delimiter);
      const date     = parseDate(cols[dateIdx] ?? '', params.dateFormat);
      if (!date) { skipped++; continue; }

      const debitRaw  = Number((cols[debitIdx]  ?? '0').replace(/\s/g, '').replace(',', '.'));
      const creditRaw = Number((cols[creditIdx] ?? '0').replace(/\s/g, '').replace(',', '.'));
      const label     = (cols[labelIdx] ?? '').trim();
      if (!label) { skipped++; continue; }

      const isCredit = creditRaw > 0;
      const amount   = isCredit ? creditRaw : debitRaw;
      if (amount <= 0) { skipped++; continue; }

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd   || date > periodEnd)   periodEnd   = date;
      if (isCredit) totalCredits += amount; else totalDebits += amount;

      toCreate.push({
        bankAccountId: params.bankAccountId,
        transactionDate: date, label, amount,
        type:      isCredit ? 'credit' : 'debit',
        reference: refIdx >= 0 ? (cols[refIdx] ?? undefined) : undefined,
        source:    'csv',
      });
    }

    if (toCreate.length === 0) throw AppError.badRequest('Aucune ligne valide dans le fichier CSV');

    return this.prisma.$transaction(async (tx) => {
      const importRecord = await tx.bankStatementImport.create({
        data: {
          bankAccountId:  params.bankAccountId,
          filename:       'import.csv',
          fileFormat:     'csv',
          periodStart:    periodStart!,
          periodEnd:      periodEnd!,
          totalCredits, totalDebits,
          nbTransactions: toCreate.length,
          status:         'completed',
          importedById:   userId,
          processedAt:    new Date(),
        },
      });

      await tx.bankTransaction.createMany({
        data: toCreate.map(t => ({ ...t, importId: importRecord.id })),
      });

      await tx.bankAccount.update({
        where: { id: params.bankAccountId },
        data:  { currentBalance: { increment: totalCredits - totalDebits } },
      });

      return {
        importId:   importRecord.id,
        nbImported: toCreate.length,
        nbSkipped:  skipped,
        totalCredits, totalDebits,
        periodStart: periodStart!,
        periodEnd:   periodEnd!,
      };
    });
  }

  // ── Nouveau pipeline import : DETECT → PREVIEW → CONFIRM ───────────────────

  async detectImportFormat(
    fileBuffer: Buffer,
    bankAccountId: string,
    filename: string,
    encodingHint?: DetectFormatInput['encoding'],
  ) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const content    = decodeBuffer(fileBuffer, encodingHint ?? 'auto');
    const fileFormat = detectFileFormat(filename, content);

    if (fileFormat === 'ofx' || fileFormat === 'mt940') {
      return {
        profileId: fileFormat, profileName: fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
        delimiter: ',' as const, encoding: encodingHint ?? 'auto',
        dateFormat: 'YYYY-MM-DD', numberFormat: { thousands: '', decimal: '.' },
        columnMapping: { date: 'auto', label: 'auto' },
        confidence: 95, source: 'verified' as const,
        verificationNote: `Format ${fileFormat.toUpperCase()} — structure auto-interprétée`,
        headerRow: 0, fileFormat,
        confidenceScore: 95, needsMapping: false,
        headers: null, sampleRows: null, profileCandidates: [],
      };
    }

    const [override, dbProfiles] = await Promise.all([
      this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
      this.prisma.bankImportProfile.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, source: true, columnMapping: true, dateFormat: true, numberFormat: true, delimiter: true, encoding: true, amountSign: true, directionValues: true, skipRowsContaining: true },
      }),
    ]);

    const extraProfiles = (dbProfiles as any[]).map(p => ({
      id:           p.id,
      name:         p.name,
      source:       p.source,
      columns:      p.columnMapping as any,
      dateFormat:   p.dateFormat,
      numberFormat: p.numberFormat as any,
      encoding:     p.encoding,
      delimiter:    p.delimiter,
      amountSign:   p.amountSign,
      directionValues: p.directionValues as any,
      skipRowsContaining: p.skipRowsContaining as any,
      _dbId:     p.id,
      _dbName:   p.name,
      _dbSource: p.source,
    })) as Array<BankProfile & { _dbId: string; _dbName: string; _dbSource: string }>;

    const fmt              = autoDetectFormat(content, override?.profileData ?? undefined, extraProfiles);
    const confidenceScore  = fmt.confidence;
    const needsMapping     = confidenceScore < 80 && !override;

    console.log(`[detectImportFormat] confidence=${confidenceScore}%, needsMapping=${needsMapping}, override=${override ? 'OUI (id:'+override.id+')' : 'NON'}, profiles DB=${dbProfiles.length}`);

    return {
      format:            fileFormat,
      detectedBank:      fmt.profileName ?? null,
      confidence:        confidenceScore >= 80 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low',
      confidenceScore,
      warnings:          [],
      needsMapping,
      headers:           fmt.headers ?? null,
      sampleRows:        fmt.sampleRows ?? null,
      profileCandidates: fmt.profileCandidates ?? [],
      detectedMapping:   { ...fmt, fileFormat, needsMapping },
    };
  }

  async previewImport(
    fileBuffer: Buffer,
    bankAccountId: string,
    filename: string,
    encodingHint?: DetectFormatInput['encoding'],
    formatOverride?: DetectedFormat,
    columnMappingOverride?: object,
  ): Promise<{ importId: string; rows: any[]; totalRows: number; skippedRows: number; duplicates: number; parseErrors: Array<{ row: number; message: string }>; periodStart: string | null; periodEnd: string | null; format: any; detectedBank: string | null }> {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');

    const [dbOverride, existingHashes] = await Promise.all([
      this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
      this.prisma.bankTransaction.findMany({
        where:  { bankAccountId, contentHash: { not: null } },
        select: { contentHash: true },
      }),
    ]);
    const hashSet = new Set(existingHashes.map(h => h.contentHash!));

    // Si l'utilisateur a mappé les colonnes manuellement dans le ColumnMapper,
    // on construit le formatOverride AVANT de parser — sinon parseStatementFile
    // utilise l'auto-détection et produit 0 lignes pour un format inconnu.
    let resolvedFormatOverride: DetectedFormat | undefined = formatOverride ?? (dbOverride?.profileData as unknown as DetectedFormat | undefined) ?? undefined;

    if (columnMappingOverride && typeof columnMappingOverride === 'object') {
      const cm = columnMappingOverride as any;
      console.log('[previewImport] columnMappingOverride reçu:', JSON.stringify(cm, null, 2));
      resolvedFormatOverride = {
        profileId:    null,
        profileName:  'Mapping manuel',
        delimiter:    cm.delimiter    ?? ';',
        encoding:     cm.encoding     ?? encodingHint ?? 'utf-8',
        dateFormat:   cm.dateFormat   ?? 'DD/MM/YYYY',
        numberFormat: cm.numberFormat ?? { thousands: ' ', decimal: ',' },
        columnMapping: {
          date:         cm.columnMapping?.date         ?? '',
          label:        cm.columnMapping?.label        ?? '',
          debit:        cm.columnMapping?.debit,
          credit:       cm.columnMapping?.credit,
          amount:       cm.columnMapping?.amount,
          direction:    cm.columnMapping?.direction,
          reference:    cm.columnMapping?.reference,
          balanceAfter: cm.columnMapping?.balanceAfter,
          valueDate:    cm.columnMapping?.valueDate,
        },
        headerRow: cm.headerRow ?? 0,
        confidence: 100,
        source: 'user' as const,
      };
      console.log('[previewImport] resolvedFormatOverride.columnMapping:', JSON.stringify(resolvedFormatOverride.columnMapping));
    } else {
      console.log('[previewImport] AUCUN columnMappingOverride — auto-détection utilisée');
    }

    const result = parseStatementFile(
      fileBuffer, filename, bankAccountId,
      resolvedFormatOverride,
      encodingHint ?? 'auto',
    );

    const uniqueTxns    = result.transactions.filter(t => !hashSet.has(t.contentHash));
    const duplicateRows = result.transactions.length - uniqueTxns.length;

    let detectedFormat: DetectedFormat = resolvedFormatOverride ?? result.detectedFormat ?? {
      profileId:    result.fileFormat,
      profileName:  result.fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
      delimiter:    ',' as const,
      encoding:     encodingHint ?? 'auto',
      dateFormat:   'YYYY-MM-DD',
      numberFormat: { thousands: '', decimal: '.' },
      columnMapping: { date: 'auto', label: 'auto' },
      confidence:   95, source: 'verified' as const, headerRow: 0,
    };

    const preview: ImportPreview = {
      detectedFormat,
      totalRows:          result.transactions.length + result.errors.length,
      validRows:          uniqueTxns.length,
      errorRows:          result.errors.length,
      duplicateRows,
      sampleTransactions: uniqueTxns,
      sampleRows:         uniqueTxns.slice(0, 5),
      errors:             result.errors,
      dateRange: {
        min: uniqueTxns.reduce<Date | null>((m, t) => !m || t.transactionDate < m ? t.transactionDate : m, null),
        max: uniqueTxns.reduce<Date | null>((m, t) => !m || t.transactionDate > m ? t.transactionDate : m, null),
      },
      totalDebits:  uniqueTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
      totalCredits: uniqueTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
    };

    const periodStart = preview.dateRange.min ?? new Date();
    const periodEnd   = preview.dateRange.max ?? new Date();

    const importRecord = await this.prisma.bankStatementImport.create({
      data: {
        bankAccountId, filename,
        fileFormat:     result.fileFormat === 'unknown' ? 'csv' : result.fileFormat,
        periodStart, periodEnd,
        totalCredits:   preview.totalCredits,
        totalDebits:    preview.totalDebits,
        nbTransactions: preview.validRows,
        status:         'pending',
        previewData:    preview as any,
        detectedFormat: detectedFormat as any,
      },
    });

    console.log(`[previewImport] résultat: ${result.transactions.length} transactions, ${result.errors.length} erreurs, ${duplicateRows} doublons`);
    if (result.errors.length > 0) {
      console.log('[previewImport] premières erreurs:', result.errors.slice(0, 3));
    }

    return {
      importId:    importRecord.id,
      rows:        uniqueTxns.map((t: any) => ({
        date:      t.transactionDate instanceof Date ? t.transactionDate.toISOString().split('T')[0] : t.transactionDate,
        label:     t.label,
        debit:     t.type === 'debit'  ? t.amount : null,
        credit:    t.type === 'credit' ? t.amount : null,
        balance:   t.balanceAfter ?? null,
        reference: t.reference   ?? null,
      })),
      totalRows:   preview.totalRows   ?? 0,
      skippedRows: preview.errorRows   ?? 0,
      duplicates:  duplicateRows,
      parseErrors: result.errors.slice(0, 5),
      periodStart: preview.dateRange.min ? (preview.dateRange.min as Date).toISOString().split('T')[0] : null,
      periodEnd:   preview.dateRange.max ? (preview.dateRange.max as Date).toISOString().split('T')[0] : null,
      format:      (result.fileFormat === 'unknown' ? 'csv' : result.fileFormat) as any,
      detectedBank: detectedFormat.profileName ?? null,
    };
  }

  async confirmImport(importId: string, userId: string): Promise<{
    nbImported: number; nbSkipped: number; nbDuplicates: number; status: string; jobId?: string;
  }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');
    if (importRecord.status !== 'pending') throw AppError.conflict('Cet import a déjà été traité');

    const preview = importRecord.previewData as unknown as ImportPreview;
    if (!preview) throw AppError.badRequest('Données de prévisualisation manquantes — relancez la phase PREVIEW');

    const existingHashes = await this.prisma.bankTransaction.findMany({
      where:  { bankAccountId: importRecord.bankAccountId, contentHash: { not: null } },
      select: { contentHash: true },
    });
    const hashSet     = new Set(existingHashes.map(h => h.contentHash!));
    const transactions = preview.sampleTransactions.filter(t => !hashSet.has(t.contentHash));
    const nbDuplicates = preview.duplicateRows;

    // `previewData` transite par une colonne JSONB : les Date en reviennent sous
    // forme de chaînes ISO. Sans cette re-normalisation, la branche asynchrone
    // (> 200 lignes) plantait sur `t.transactionDate.toISOString is not a function`,
    // rendant tout relevé de plus de 200 lignes impossible à importer.
    const asDate = (v: Date | string | null | undefined): Date | undefined =>
      v == null ? undefined : (v instanceof Date ? v : new Date(v));

    if (transactions.length === 0) {
      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'completed', processedAt: new Date(), importedById: userId, nbTransactions: 0 },
      });
      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
    }

    // Async si > 200 lignes
    if (transactions.length > 200) {
      const lines = transactions.map(t => ({
        bankAccountId:   importRecord.bankAccountId,
        transactionDate: asDate(t.transactionDate)!.toISOString(),
        valueDate:       asDate(t.valueDate)?.toISOString(),
        label: t.label, amount: t.amount, type: t.type,
        reference: t.reference, balanceAfter: t.balanceAfter,
        contentHash: t.contentHash, source: 'csv_import', importId, createdById: userId,
      }));

      const job = await this.bankImportQueue.add('process', {
        importId, bankAccountId: importRecord.bankAccountId, lines,
      });

      await this.prisma.bankStatementImport.update({
        where: { id: importId },
        data:  { status: 'processing', jobId: job.id ?? null, importedById: userId },
      });

      return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'processing', jobId: job.id };
    }

    // Sync si ≤ 200 lignes
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bankTransaction.createMany({
        data: transactions.map(t => ({
          bankAccountId:   importRecord.bankAccountId,
          transactionDate: asDate(t.transactionDate)!,
          valueDate:       asDate(t.valueDate),
          label:           t.label,
          amount:          t.amount,
          type:            t.type,
          reference:       t.reference ?? undefined,
          balanceAfter:    t.balanceAfter ?? undefined,
          contentHash:     t.contentHash,
          source:          'csv_import',
          importId, createdById: userId,
        })),
        skipDuplicates: true,
      });

      const delta = transactions.reduce((acc, t) => acc + (t.type === 'credit' ? t.amount : -t.amount), 0);

      await Promise.all([
        tx.bankAccount.update({
          where: { id: importRecord.bankAccountId },
          data:  { currentBalance: { increment: delta } },
        }),
        tx.bankStatementImport.update({
          where: { id: importId },
          data:  { status: 'completed', processedAt: new Date(), importedById: userId,
                   nbTransactions: created.count, nbUnmatched: created.count },
        }),
      ]);

      await this.prisma.bankProfileOverride.updateMany({
        where: { bankAccountId: importRecord.bankAccountId },
        data:  { verifiedCount: { increment: 1 }, isVerified: true },
      });

      return { nbImported: created.count, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
    });
  }

  async rollbackImport(importId: string): Promise<{ deleted: number }> {
    const importRecord = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!importRecord) throw AppError.notFound('Import introuvable');

    if (importRecord.status === 'pending') {
      await this.prisma.bankStatementImport.delete({ where: { id: importId } });
      return { deleted: 0 };
    }
    if (importRecord.status !== 'completed') throw AppError.conflict('Seul un import complété peut être annulé');

    return this.prisma.$transaction(async (tx) => {
      const txns = await tx.bankTransaction.findMany({
        where:  { importId, reconciliationStatus: 'pending' },
        select: { id: true, type: true, amount: true },
      });

      if (txns.length > 0) {
        const balanceDelta = txns.reduce((acc, t) => acc + (t.type === 'credit' ? -Number(t.amount) : Number(t.amount)), 0);
        await tx.bankAccount.update({
          where: { id: importRecord.bankAccountId },
          data:  { currentBalance: { increment: balanceDelta } },
        });
      }

      const deleted = await tx.bankTransaction.deleteMany({ where: { importId, reconciliationStatus: 'pending' } });
      await tx.bankStatementImport.update({ where: { id: importId }, data: { status: 'cancelled' } });
      return { deleted: deleted.count };
    });
  }

  async getImportStatus(importId: string) {
    const record = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!record) throw AppError.notFound('Import introuvable');

    let progress = 100;
    if (record.status === 'processing' && record.jobId) {
      try {
        const job = await this.bankImportQueue.getJob(record.jobId);
        if (job) progress = (job.progress as number) ?? 0;
      } catch { /* job terminé */ }
    }

    return {
      importId: record.id, status: record.status, progress,
      nbTransactions: record.nbTransactions, nbMatched: record.nbMatched,
      nbUnmatched: record.nbUnmatched, processedAt: record.processedAt,
      errorMessage: record.errorMessage,
    };
  }

  async listImports(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.bankStatementImport.findMany({
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { importedAt: 'desc' },
        include: { bankAccount: { select: { id: true, name: true } } },
      }),
      this.prisma.bankStatementImport.count(),
    ]);
    return { data, total };
  }

  async getImportConfig(accountId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: accountId, deletedAt: null } });
    if (!account) throw AppError.notFound('Compte bancaire introuvable');
    const override = await this.prisma.bankProfileOverride.findUnique({ where: { bankAccountId: accountId } });
    return {
      accountId,
      hasOverride:   !!override,
      isVerified:    override?.isVerified   ?? false,
      verifiedCount: override?.verifiedCount ?? 0,
      profileData:   override?.profileData  ?? null,
    };
  }

  async saveProfileOverride(bankAccountId: string, profileData: DetectedFormat, userId: string) {
    return this.prisma.bankProfileOverride.upsert({
      where:  { bankAccountId },
      create: { bankAccountId, profileData: profileData as any, createdById: userId, verifiedCount: 1, isVerified: false },
      update: { profileData: profileData as any, verifiedCount: { increment: 1 } },
    });
  }

  // ── Subset Sum ──────────────────────────────────────────────────────────────

  async findSubsetMatches(transactionId: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!t) throw AppError.notFound('Transaction introuvable');

    const amount    = Number(t.amount);
    const tolerance = Math.max(1, amount * 0.001);
    const dateFrom  = new Date(t.transactionDate); dateFrom.setDate(dateFrom.getDate() - 10);
    const dateTo    = new Date(t.transactionDate); dateTo.setDate(dateTo.getDate() + 10);

    const [payments, supplierPayments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where:  { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amount: true, paymentDate: true, reference: true },
        take:   20,
      }),
      this.prisma.supplierPayment.findMany({
        where:  { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amount: true, paymentDate: true, reference: true },
        take:   20,
      }),
      this.prisma.expense.findMany({
        where:  { deletedAt: null, bankTransactionId: null, expenseDate: { gte: dateFrom, lte: dateTo } },
        select: { id: true, amountTtc: true, expenseDate: true, title: true },
        take:   20,
      }),
    ]);

    const candidates: SubsetCandidate[] = [
      ...payments.map(p          => ({ id: `payment:${p.id}`,          amount: Number(p.amount),    label: p.reference ?? '',   date: p.paymentDate })),
      ...supplierPayments.map(s  => ({ id: `supplier_payment:${s.id}`, amount: Number(s.amount),    label: s.reference ?? '',   date: s.paymentDate })),
      ...expenses.map(e          => ({ id: `expense:${e.id}`,          amount: Number(e.amountTtc), label: e.title,             date: e.expenseDate })),
    ];

    const matches = subsetSum(candidates, amount, tolerance, 6, 5);
    return { transaction: t, candidates: candidates.length, matches };
  }

  // ── Auto-match Hungarian ────────────────────────────────────────────────────

  async getAutoMatchBatch(reconciliationId: string, highConfidenceOnly: boolean) {
    const r = await this.prisma.bankReconciliation.findUnique({ where: { id: reconciliationId } });
    if (!r) throw AppError.notFound('Session de rapprochement introuvable');

    const pendingTxns = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending',
               transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
    });
    if (pendingTxns.length === 0) return { applied: 0, suggestions: [] };

    const [payments, supplierPayments, expenses] = await Promise.all([
      this.prisma.payment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
      this.prisma.supplierPayment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
      this.prisma.expense.findMany({ where: { deletedAt: null, bankTransactionId: null, expenseDate: { gte: r.periodStart, lte: r.periodEnd } }, take: 100 }),
    ]);

    type Candidate = { entityType: string; entityId: string; amount: number; date: Date; label: string };
    const candidates: Candidate[] = [
      ...payments.map(p        => ({ entityType: 'payment',          entityId: p.id, amount: Number(p.amount),    date: p.paymentDate, label: '' })),
      ...supplierPayments.map(s => ({ entityType: 'supplier_payment', entityId: s.id, amount: Number(s.amount),   date: s.paymentDate, label: '' })),
      ...expenses.map(e         => ({ entityType: 'expense',          entityId: e.id, amount: Number(e.amountTtc), date: e.expenseDate, label: e.title })),
    ];
    if (candidates.length === 0) return { applied: 0, suggestions: [] };

    const costMatrix = pendingTxns.map(tx =>
      candidates.map(c => {
        const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                      txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
        return 100 - detail.total;
      })
    );

    const assignment = hungarian(costMatrix);
    const high: Array<{ txId: string; entityType: string; entityId: string; score: number }> = [];
    const medium: typeof high = [];

    for (let i = 0; i < pendingTxns.length; i++) {
      const j = assignment[i];
      if (j === undefined || j < 0 || j >= candidates.length) continue;
      const tx = pendingTxns[i]!;
      const c  = candidates[j]!;
      const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label,
                                    txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
      if (detail.total >= 90)      high.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
      else if (detail.total >= 70) medium.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
    }

    // highConfidenceOnly = true  → on applique uniquement la haute confiance (≥ 90 %)
    // highConfidenceOnly = false → mode étendu : on applique aussi les 70–89 %
    const toApply = highConfidenceOnly ? high : [...high, ...medium];

    let applied = 0;
    if (toApply.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const m of toApply) {
          await tx.bankTransaction.update({
            where: { id: m.txId },
            data:  { reconciliationStatus: 'reconciled', reconciledAt: new Date(),
                     matchedEntityType: m.entityType, matchedEntityId: m.entityId },
          });
        }
      });
      applied = toApply.length;
    }

    return { applied, high, medium };
  }

  // ── Apprentissage automatique ────────────────────────────────────────────────

  async learnMatchingRule(transactionId: string, entityType: string, entityId: string, userId: string) {
    const t = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!t) return;

    const tokens = t.label.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    if (tokens.length === 0) return;

    const labelContains = tokens.sort((a, b) => b.length - a.length)[0]!.slice(0, 255);

    const existing = await this.prisma.bankMatchingRule.findFirst({
      where: { bankAccountId: t.bankAccountId, labelContains, entityType },
    });

    if (existing) {
      await this.prisma.bankMatchingRule.update({
        where: { id: existing.id },
        data:  { confidence: { increment: 1 }, entityId, amountMin: Number(t.amount) * 0.9, amountMax: Number(t.amount) * 1.1 },
      });
    } else {
      await this.prisma.bankMatchingRule.create({
        data: {
          bankAccountId: t.bankAccountId,
          labelContains, entityType, entityId,
          amountMin:   Number(t.amount) * 0.9,
          amountMax:   Number(t.amount) * 1.1,
          confidence:  1, isActive: true, isAutoApply: false,
          createdById: userId,
        },
      });
    }
  }

  // ── CRUD Règles de matching ──────────────────────────────────────────────────

  async listMatchingRules(bankAccountId?: string) {
    return this.prisma.bankMatchingRule.findMany({
      where:   { ...(bankAccountId ? { bankAccountId } : {}), isActive: true },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createMatchingRule(data: {
    bankAccountId?: string | null; labelContains: string; entityType: string;
    entityId?: string | null; category?: string | null; amountMin?: number | null; amountMax?: number | null; autoApply?: boolean;
  }, userId: string) {
    return this.prisma.bankMatchingRule.create({
      data: {
        bankAccountId: data.bankAccountId ?? undefined,
        labelContains: data.labelContains,
        entityType:    data.entityType,
        entityId:      data.entityId   ?? undefined,
        category:      data.category   ?? undefined,
        amountMin:     data.amountMin  ?? undefined,
        amountMax:     data.amountMax  ?? undefined,
        isAutoApply:   data.autoApply  ?? false,
        confidence:    1, createdById: userId,
      },
    });
  }

  async updateMatchingRule(id: string, data: {
    bankAccountId?: string | null; labelContains?: string; entityType?: string;
    entityId?: string | null; category?: string | null; amountMin?: number | null; amountMax?: number | null;
    autoApply?: boolean; isActive?: boolean;
  }) {
    // Allow-list : `autoApply` (API) -> `isAutoApply` (colonne). On ne passe à
    // Prisma que des champs réellement présents sur le modèle.
    const d: Prisma.BankMatchingRuleUpdateInput = {};
    if (data.labelContains !== undefined) d.labelContains = data.labelContains;
    if (data.entityType    !== undefined) d.entityType    = data.entityType;
    if (data.entityId      !== undefined) d.entityId      = data.entityId ?? null;
    if (data.category      !== undefined) d.category      = data.category ?? null;
    if (data.amountMin     !== undefined) d.amountMin     = data.amountMin ?? null;
    if (data.amountMax     !== undefined) d.amountMax     = data.amountMax ?? null;
    if (data.autoApply     !== undefined) d.isAutoApply   = data.autoApply;
    if (data.isActive      !== undefined) d.isActive      = data.isActive;
    return this.prisma.bankMatchingRule.update({ where: { id }, data: d });
  }

  async deleteMatchingRule(id: string) {
    return this.prisma.bankMatchingRule.update({ where: { id }, data: { isActive: false } });
  }

  // ── Profils d'import partagés ────────────────────────────────────────────────

  async listImportProfiles() {
    return this.prisma.bankImportProfile.findMany({
      where:   { deletedAt: null },
      orderBy: [{ source: 'asc' }, { name: 'asc' }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getImportProfileById(id: string) {
    const profile = await this.prisma.bankImportProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!profile) throw AppError.notFound('Profil d\'import introuvable');
    return profile;
  }

  async createImportProfile(data: {
    name: string; bankName?: string; country?: string;
    fileFormat?: string; encoding?: string; delimiter?: string;
    dateFormat?: string; numberFormat: object; columnMapping: object;
    directionValues?: object; amountSign?: string;
    skipRowsContaining?: string[]; skipFirstRows?: number; isPublic?: boolean; notes?: string;
  }, userId: string) {
    return this.prisma.bankImportProfile.create({
      data: {
        name:               data.name,
        bankName:           data.bankName           ?? undefined,
        country:            data.country            ?? undefined,
        source:             'user',
        fileFormat:         data.fileFormat          ?? 'csv',
        encoding:           data.encoding            ?? 'utf-8',
        delimiter:          data.delimiter           ?? ';',
        dateFormat:         data.dateFormat          ?? 'DD/MM/YYYY',
        numberFormat:       data.numberFormat,
        columnMapping:      data.columnMapping,
        directionValues:    data.directionValues     ?? undefined,
        amountSign:         data.amountSign          ?? undefined,
        skipRowsContaining: data.skipRowsContaining  ?? undefined,
        skipFirstRows:      data.skipFirstRows        ?? 0,
        isPublic:           data.isPublic             ?? false,
        notes:              data.notes               ?? undefined,
        createdById:        userId,
      },
    });
  }

  async updateImportProfile(id: string, data: Partial<{
    name: string; bankName: string; country: string;
    fileFormat: string; encoding: string; delimiter: string;
    dateFormat: string; numberFormat: object; columnMapping: object;
    directionValues: object; amountSign: string;
    skipRowsContaining: string[]; skipFirstRows: number; isPublic: boolean; notes: string;
  }>) {
    const profile = await this.prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw AppError.notFound('Profil d\'import introuvable');
    return this.prisma.bankImportProfile.update({ where: { id }, data });
  }

  async deleteImportProfile(id: string) {
    const profile = await this.prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw AppError.notFound('Profil d\'import introuvable');
    await this.prisma.bankImportProfile.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async incrementImportProfileUsage(id: string) {
    await this.prisma.bankImportProfile.updateMany({
      where: { id, deletedAt: null },
      data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }
}
