import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import {
  CreateBankAccountInput, CreateTransactionInput,
  ReconcileInput, OpenReconciliationInput, ImportCsvInput,
} from './bank.schema';
import {
  decodeBuffer, autoDetectFormat, parseStatementFile,
  detectFileFormat, computeContentHash,
  DetectedFormat, ImportPreview, FileFormat,
} from './bank.parsers';
import {
  computeScore, subsetSum, hungarian, SubsetCandidate,
} from './bank.matching';
import { bankImportQueue } from '../../jobs/queues';

// ── Résumé banque ─────────────────────────────────────────────────────────────

export async function getBankSummary() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [accounts, unreconciledCount, openReconciliations, importsThisMonth] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true, name: true, bankName: true, currentBalance: true, currency: true, color: true,
        _count: {
          select: {
            transactions: { where: { reconciliationStatus: 'pending' } },
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    prisma.bankTransaction.count({
      where: { reconciliationStatus: 'pending', bankAccount: { deletedAt: null } },
    }),
    prisma.bankReconciliation.count({
      where: { status: 'open' },
    }),
    prisma.bankStatementImport.count({
      where: { importedAt: { gte: startOfMonth } },
    }),
  ]);

  const totalBalance = accounts.reduce(
    (sum: number, a) => sum + Number(a.currentBalance ?? 0),
    0,
  );

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

// ── Comptes bancaires ──────────────────────────────────────────────────────────

export async function listAccounts() {
  return prisma.bankAccount.findMany({
    where: { deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { transactions: true } } },
  });
}

export async function getAccountById(id: string) {
  const account = await prisma.bankAccount.findFirst({
    where: { id, deletedAt: null },
    include: {
      transactions: { orderBy: { transactionDate: 'desc' }, take: 10 },
    },
  });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');
  return account;
}

export async function createAccount(data: CreateBankAccountInput) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.bankAccount.updateMany({ where: { isDefault: true, deletedAt: null }, data: { isDefault: false } });
    }
    return tx.bankAccount.create({
      data: {
        name:             data.name,
        bankName:         data.bankName,
        accountNumber:    data.accountNumber ?? undefined,
        branchName:       data.branchName    ?? undefined,
        iban:             data.iban           ?? undefined,
        swiftBic:         data.swiftBic       ?? undefined,
        currency:         data.currency,
        openingBalance:   data.openingBalance,
        currentBalance:   data.openingBalance,
        isDefault:        data.isDefault,
        accountingAccount: data.accountingAccount ?? undefined,
        color:            data.color             ?? undefined,
        notes:            data.notes             ?? undefined,
      },
    });
  });
}

export async function updateAccount(id: string, data: Partial<CreateBankAccountInput>) {
  const account = await prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.bankAccount.updateMany({ where: { isDefault: true, deletedAt: null, id: { not: id } }, data: { isDefault: false } });
    }
    return tx.bankAccount.update({
      where: { id },
      data: {
        ...(data.name              !== undefined ? { name: data.name }                                  : {}),
        ...(data.bankName          !== undefined ? { bankName: data.bankName }                          : {}),
        ...(data.accountNumber     !== undefined ? { accountNumber: data.accountNumber ?? undefined }   : {}),
        ...(data.branchName        !== undefined ? { branchName: data.branchName ?? undefined }         : {}),
        ...(data.iban              !== undefined ? { iban: data.iban ?? undefined }                     : {}),
        ...(data.swiftBic          !== undefined ? { swiftBic: data.swiftBic ?? undefined }             : {}),
        ...(data.currency          !== undefined ? { currency: data.currency }                          : {}),
        ...(data.isDefault         !== undefined ? { isDefault: data.isDefault }                        : {}),
        ...(data.accountingAccount !== undefined ? { accountingAccount: data.accountingAccount ?? undefined } : {}),
        ...(data.color             !== undefined ? { color: data.color ?? undefined }                   : {}),
        ...(data.notes             !== undefined ? { notes: data.notes ?? undefined }                   : {}),
      },
    });
  });
}

export async function deleteAccount(id: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');
  if (Number(account.currentBalance) !== 0) {
    throw AppError.conflict('Impossible de supprimer un compte avec un solde non nul');
  }
  await prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listTransactions(params: {
  page: number; limit: number;
  accountId?: string; type?: string;
  dateFrom?: string; dateTo?: string;
  reconciled?: boolean; search?: string;
}) {
  const { page, limit, accountId, type, dateFrom, dateTo, reconciled, search } = params;
  const where: Record<string, unknown> = {};
  if (accountId) where['bankAccountId'] = accountId;
  if (type) where['type'] = type;
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
    prisma.bankTransaction.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { transactionDate: 'desc' },
      include: { bankAccount: { select: { id: true, name: true, currency: true } } },
    }),
    prisma.bankTransaction.count({ where }),
  ]);
  return { data, total };
}

export async function getTransactionById(id: string) {
  const t = await prisma.bankTransaction.findUnique({
    where: { id },
    include: { bankAccount: true },
  });
  if (!t) throw AppError.notFound('Transaction introuvable');
  return t;
}

export async function createTransaction(data: CreateTransactionInput) {
  const account = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const delta = data.type === 'credit' ? data.amount : -data.amount;

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.create({
      data: {
        bankAccountId:   data.bankAccountId,
        transactionDate: data.transactionDate,
        label:           data.label,
        amount:          data.amount,
        type:            data.type,
        reference:       data.reference  ?? undefined,
        category:        data.category   ?? undefined,
        notes:           data.notes      ?? undefined,
      },
    });
    await tx.bankAccount.update({
      where: { id: data.bankAccountId },
      data:  { currentBalance: { increment: delta } },
    });
    return transaction;
  });
}

// ── Suggestions de rapprochement automatique ──────────────────────────────────

export async function getSuggestions(transactionId: string) {
  const tx0 = await prisma.bankTransaction.findUnique({ where: { id: transactionId } });
  if (!tx0) throw AppError.notFound('Transaction introuvable');
  if (tx0.reconciliationStatus === 'reconciled') return { suggestions: [] };
  const t = tx0;

  const amount    = Number(t.amount);
  const tolerance = Math.max(1, amount * 0.05); // ±5% ou ±1 XAF
  const dateFrom  = new Date(t.transactionDate);
  dateFrom.setDate(dateFrom.getDate() - 10);
  const dateTo    = new Date(t.transactionDate);
  dateTo.setDate(dateTo.getDate() + 10);

  const [payments, supplierPayments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: {
        deletedAt:        null,
        bankTransactionId: null,
        amount: { gte: amount - tolerance, lte: amount + tolerance },
        paymentDate: { gte: dateFrom, lte: dateTo },
      },
      include: { invoice: { select: { number: true } } },
      take: 5,
    }),
    prisma.supplierPayment.findMany({
      where: {
        deletedAt:        null,
        bankTransactionId: null,
        amount: { gte: amount - tolerance, lte: amount + tolerance },
        paymentDate: { gte: dateFrom, lte: dateTo },
      },
      include: { supplierInvoice: { select: { supplierInvoiceNumber: true } } },
      take: 5,
    }),
    prisma.expense.findMany({
      where: {
        deletedAt:        null,
        bankTransactionId: null,
        amountTtc: { gte: amount - tolerance, lte: amount + tolerance },
        expenseDate: { gte: dateFrom, lte: dateTo },
      },
      select: { id: true, number: true, title: true, amountTtc: true, expenseDate: true },
      take: 5,
    }),
  ]);

  const txDate  = t.transactionDate;
  const txRef   = t.reference;

  // Charger les règles de matching apprises pour ce compte
  const matchingRules = await prisma.bankMatchingRule.findMany({
    where: { bankAccountId: t.bankAccountId, isActive: true },
  });

  function getRuleBonus(entityLabel: string, entityAmount: number): number {
    for (const rule of matchingRules) {
      if (rule.confidence < 3) continue;
      const labelMatch = entityLabel.toLowerCase().includes(rule.labelContains.toLowerCase());
      const amountOk   = (!rule.amountMin || entityAmount >= Number(rule.amountMin))
                      && (!rule.amountMax || entityAmount <= Number(rule.amountMax));
      if (labelMatch && amountOk) return 15;
    }
    return 0;
  }

  function score(entityAmount: number, entityDate: Date, entityLabel: string, entityRef?: string | null) {
    return computeScore({
      entityAmount, entityDate, entityLabel, entityRef,
      txAmount:  amount,
      txDate,
      txLabel:   t.label,
      txRef,
      ruleBonus: getRuleBonus(entityLabel, entityAmount),
    });
  }

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
  return { transaction: t, suggestions: suggestions.slice(0, 10) };
}

export async function reconcileTransaction(id: string, data: ReconcileInput, userId?: string) {
  const t = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!t) throw AppError.notFound('Transaction introuvable');
  if (t.reconciliationStatus === 'reconciled') throw AppError.conflict('Transaction déjà rapprochée');

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
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

    // Lier l'entité correspondante → empêche le double rapprochement
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

  // Apprentissage automatique de la règle de matching
  if (userId) {
    learnMatchingRule(id, data.matchedEntityType, data.matchedEntityId, userId).catch(() => {});
  }

  return updated;
}

export async function unmatchTransaction(id: string) {
  const t = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!t) throw AppError.notFound('Transaction introuvable');
  if (t.reconciliationStatus !== 'reconciled') throw AppError.badRequest('Transaction non rapprochée');

  return prisma.$transaction(async (tx) => {
    // Délier l'entité correspondante
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

export async function ignoreTransaction(id: string) {
  const t = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!t) throw AppError.notFound('Transaction introuvable');
  return prisma.bankTransaction.update({
    where: { id },
    data:  { reconciliationStatus: 'ignored' },
  });
}

// ── Rapprochements ────────────────────────────────────────────────────────────

export async function listReconciliations(params: { page: number; limit: number; accountId?: string }) {
  const where: Record<string, unknown> = {};
  if (params.accountId) where['bankAccountId'] = params.accountId;

  const [data, total] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { periodStart: 'desc' },
      include: { bankAccount: { select: { id: true, name: true } } },
    }),
    prisma.bankReconciliation.count({ where }),
  ]);
  return { data, total };
}

export async function getReconciliationById(id: string) {
  const r = await prisma.bankReconciliation.findUnique({
    where: { id },
    include: { bankAccount: true },
  });
  if (!r) throw AppError.notFound('Session de rapprochement introuvable');
  return r;
}

export async function openReconciliation(data: OpenReconciliationInput, userId: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  return prisma.bankReconciliation.create({
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

export async function getReconciliationReport(id: string) {
  const r = await prisma.bankReconciliation.findUnique({
    where: { id },
    include: { bankAccount: { select: { id: true, name: true, currency: true } } },
  });
  if (!r) throw AppError.notFound('Session de rapprochement introuvable');

  const [reconciledTxns, pendingCount, ignoredCount] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        bankAccountId:        r.bankAccountId,
        reconciliationStatus: 'reconciled',
        transactionDate:      { gte: r.periodStart, lte: r.periodEnd },
      },
      select: { type: true, amount: true },
    }),
    prisma.bankTransaction.count({
      where: {
        bankAccountId:        r.bankAccountId,
        reconciliationStatus: 'pending',
        transactionDate:      { gte: r.periodStart, lte: r.periodEnd },
      },
    }),
    prisma.bankTransaction.count({
      where: {
        bankAccountId:        r.bankAccountId,
        reconciliationStatus: 'ignored',
        transactionDate:      { gte: r.periodStart, lte: r.periodEnd },
      },
    }),
  ]);

  let totalCredits = 0;
  let totalDebits  = 0;
  for (const t of reconciledTxns) {
    if (t.type === 'credit') totalCredits += Number(t.amount);
    else totalDebits += Number(t.amount);
  }

  const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
  const closingBalanceSystem    = Number(r.closingBalanceSystem);
  const gap                     = closingBalanceStatement - closingBalanceSystem;
  const isBalanced              = Math.abs(gap) < 1;

  return {
    reconciliation:    r,
    openingBalance:    Number(r.openingBalance),
    totalCredits,
    totalDebits,
    closingBalanceStatement,
    closingBalanceSystem,
    gap,
    isBalanced,
    reconciledCount: reconciledTxns.length,
    pendingCount,
    ignoredCount,
  };
}

export async function completeReconciliation(id: string, userId: string) {
  const r = await prisma.bankReconciliation.findUnique({ where: { id } });
  if (!r) throw AppError.notFound('Session de rapprochement introuvable');
  if (r.status !== 'in_progress') throw AppError.badRequest('Session déjà clôturée');

  return prisma.$transaction(async (tx) => {
    // Calcule le solde de clôture relevé = solde ouverture + crédits rapprochés − débits rapprochés
    const reconciledTxns = await tx.bankTransaction.findMany({
      where: {
        bankAccountId:        r.bankAccountId,
        reconciliationStatus: 'reconciled',
        transactionDate:      { gte: r.periodStart, lte: r.periodEnd },
      },
      select: { type: true, amount: true },
    });

    let totalCredits = 0;
    let totalDebits  = 0;
    for (const t of reconciledTxns) {
      if (t.type === 'credit') totalCredits += Number(t.amount);
      else totalDebits += Number(t.amount);
    }

    const closingBalanceStatement = Number(r.openingBalance) + totalCredits - totalDebits;
    const closingBalanceSystem    = Number(r.closingBalanceSystem);
    const isBalanced              = Math.abs(closingBalanceStatement - closingBalanceSystem) < 1;
    const now                     = new Date();

    const [updated] = await Promise.all([
      tx.bankReconciliation.update({
        where: { id },
        data: {
          status:                 'completed',
          completedAt:            now,
          completedById:          userId,
          closingBalanceStatement,
          isBalanced,
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

// ── Import CSV de relevé bancaire ─────────────────────────────────────────────

function parseDate(raw: string, format: ImportCsvInput['dateFormat']): Date | null {
  const s = raw.trim();
  let day: number, month: number, year: number;
  if (format === 'DD/MM/YYYY') {
    [day, month, year] = s.split('/').map(Number) as [number, number, number];
  } else if (format === 'MM/DD/YYYY') {
    [month, day, year] = s.split('/').map(Number) as [number, number, number];
  } else {
    [year, month, day] = s.split('-').map(Number) as [number, number, number];
  }
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export async function importCsv(csvContent: string, params: ImportCsvInput, userId: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id: params.bankAccountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw AppError.badRequest('Le fichier CSV est vide ou ne contient pas d\'en-tête');

  const headers = parseCsvLine(lines[0]!, params.delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colIndex = (name: string) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headers.indexOf(key);
    if (idx === -1) throw AppError.badRequest(`Colonne "${name}" introuvable dans le CSV (colonnes trouvées : ${headers.join(', ')})`);
    return idx;
  };

  const dateIdx  = colIndex(params.dateColumn);
  const labelIdx = colIndex(params.labelColumn);
  const debitIdx = colIndex(params.debitColumn);
  const creditIdx = colIndex(params.creditColumn);
  const refIdx   = params.referenceColumn ? headers.indexOf(params.referenceColumn.toLowerCase().replace(/[^a-z0-9]/g, '')) : -1;

  const dataLines = lines.slice(1);
  const toCreate: Array<{
    bankAccountId: string; transactionDate: Date; label: string;
    amount: number; type: 'debit' | 'credit'; reference?: string; source: string;
  }> = [];

  let skipped = 0;
  let periodStart: Date | null = null;
  let periodEnd:   Date | null = null;
  let totalCredits = 0;
  let totalDebits  = 0;

  for (const raw of dataLines) {
    const cols = parseCsvLine(raw, params.delimiter);
    const rawDate = cols[dateIdx] ?? '';
    const date    = parseDate(rawDate, params.dateFormat);
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
      bankAccountId:   params.bankAccountId,
      transactionDate: date,
      label,
      amount,
      type:      isCredit ? 'credit' : 'debit',
      reference: refIdx >= 0 ? (cols[refIdx] ?? undefined) : undefined,
      source:    'csv',
    });
  }

  if (toCreate.length === 0) throw AppError.badRequest('Aucune ligne valide dans le fichier CSV');

  return prisma.$transaction(async (tx) => {
    const importRecord = await tx.bankStatementImport.create({
      data: {
        bankAccountId:  params.bankAccountId,
        filename:       'import.csv',
        fileFormat:     'csv',
        periodStart:    periodStart!,
        periodEnd:      periodEnd!,
        totalCredits,
        totalDebits,
        nbTransactions: toCreate.length,
        status:         'completed',
        importedById:   userId,
        processedAt:    new Date(),
      },
    });

    await tx.bankTransaction.createMany({
      data: toCreate.map(t => ({ ...t, importId: importRecord.id })),
    });

    // Met à jour le solde courant du compte
    const balanceDelta = totalCredits - totalDebits;
    await tx.bankAccount.update({
      where: { id: params.bankAccountId },
      data:  { currentBalance: { increment: balanceDelta } },
    });

    return {
      importId:       importRecord.id,
      nbImported:     toCreate.length,
      nbSkipped:      skipped,
      totalCredits,
      totalDebits,
      periodStart:    periodStart!,
      periodEnd:      periodEnd!,
    };
  });
}

// ── Nouveau pipeline import (DETECT → PREVIEW → CONFIRM → ROLLBACK) ───────────

export async function detectImportFormat(
  fileBuffer: Buffer,
  bankAccountId: string,
  filename: string,
  encodingHint?: 'auto' | 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le'
): Promise<DetectedFormat & { fileFormat: FileFormat; confidenceScore: number; needsMapping: boolean }> {
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const content    = decodeBuffer(fileBuffer, encodingHint ?? 'auto');
  const fileFormat = detectFileFormat(filename, content);

  // OFX / MT940 : format auto-descriptif, pas besoin de mapping de colonnes
  if (fileFormat === 'ofx' || fileFormat === 'mt940') {
    return {
      profileId:        fileFormat,
      profileName:      fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
      delimiter:        ',',
      encoding:         encodingHint ?? 'auto',
      dateFormat:       'YYYY-MM-DD',
      numberFormat:     { thousands: '', decimal: '.' },
      columnMapping:    { date: 'auto', label: 'auto' },
      confidence:       95,
      confidenceScore:  95,
      needsMapping:     false,
      source:           'verified' as const,
      verificationNote: `Format ${fileFormat.toUpperCase()} — structure auto-interprétée`,
      headerRow:        0,
      fileFormat,
    };
  }

  // Charger l'override par compte + les profils DB personnalisés
  const [override, dbProfiles] = await Promise.all([
    prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
    prisma.bankImportProfile.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, bankName: true, country: true, source: true,
        fileFormat: true, encoding: true, delimiter: true, dateFormat: true,
        numberFormat: true, columnMapping: true, directionValues: true,
        amountSign: true, skipRowsContaining: true, skipFirstRows: true,
      },
    }),
  ]);

  // Convertir les profils DB au format BankProfile pour le scoring
  const extraProfiles = dbProfiles.map(p => ({
    _dbId:              p.id,
    id:                 p.id,
    name:               p.name,
    country:            p.country,
    source:             p.source as any,
    fileFormat:         p.fileFormat as any,
    encoding:           p.encoding as any,
    delimiter:          p.delimiter as any,
    dateFormat:         p.dateFormat,
    numberFormat:       p.numberFormat as any,
    columns:            p.columnMapping as any,
    directionValues:    p.directionValues as any,
    amountSign:         p.amountSign as any,
    skipRowsContaining: p.skipRowsContaining as any,
    skipFirstRows:      p.skipFirstRows,
  }));

  const fmt = autoDetectFormat(content, override?.profileData ?? undefined, extraProfiles);
  const confidenceScore = fmt.confidence;
  const needsMapping    = confidenceScore < 80 && !override;

  return { ...fmt, fileFormat, confidenceScore, needsMapping };
}

export async function previewImport(
  fileBuffer: Buffer,
  bankAccountId: string,
  filename: string,
  encodingHint?: 'auto' | 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le',
  formatOverride?: DetectedFormat
): Promise<{ importId: string; preview: ImportPreview }> {
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const [dbOverride, existingHashes] = await Promise.all([
    prisma.bankProfileOverride.findUnique({ where: { bankAccountId } }),
    prisma.bankTransaction.findMany({
      where:  { bankAccountId, contentHash: { not: null } },
      select: { contentHash: true },
    }),
  ]);
  const hashSet = new Set(existingHashes.map(h => h.contentHash!));

  // Parser CSV / OFX / MT940 via le dispatcher universel
  const result = parseStatementFile(
    fileBuffer,
    filename,
    bankAccountId,
    formatOverride ?? dbOverride?.profileData ?? undefined,
    encodingHint ?? 'auto'
  );

  // Séparer doublons et transactions valides
  const uniqueTxns    = result.transactions.filter(t => !hashSet.has(t.contentHash));
  const duplicateRows = result.transactions.length - uniqueTxns.length;

  // Pour CSV, utiliser le format détecté ; pour OFX/MT940 construire un format descriptif
  const detectedFormat: DetectedFormat = formatOverride ?? result.detectedFormat ?? {
    profileId:    result.fileFormat,
    profileName:  result.fileFormat === 'ofx' ? 'OFX / QFX' : 'MT940 SWIFT',
    delimiter:    ',',
    encoding:     encodingHint ?? 'auto',
    dateFormat:   'YYYY-MM-DD',
    numberFormat: { thousands: '', decimal: '.' },
    columnMapping: { date: 'auto', label: 'auto' },
    confidence:   95,
    source:       'verified' as const,
    headerRow:    0,
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

  const importRecord = await prisma.bankStatementImport.create({
    data: {
      bankAccountId,
      filename,
      fileFormat:     result.fileFormat === 'unknown' ? 'csv' : result.fileFormat,
      periodStart,
      periodEnd,
      totalCredits:   preview.totalCredits,
      totalDebits:    preview.totalDebits,
      nbTransactions: preview.validRows,
      status:         'pending',
      previewData:    preview as any,
      detectedFormat: detectedFormat as any,
    },
  });

  return { importId: importRecord.id, preview };
}

export async function confirmImport(
  importId: string,
  userId: string,
  formatOverride?: DetectedFormat
): Promise<{ nbImported: number; nbSkipped: number; nbDuplicates: number; status: string; jobId?: string }> {
  const importRecord = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
  if (!importRecord) throw AppError.notFound('Import introuvable');
  if (importRecord.status !== 'pending') throw AppError.conflict('Cet import a déjà été traité');

  const preview = importRecord.previewData as unknown as ImportPreview;
  if (!preview) throw AppError.badRequest('Données de prévisualisation manquantes — relancez la phase PREVIEW');

  const existingHashes = await prisma.bankTransaction.findMany({
    where: { bankAccountId: importRecord.bankAccountId, contentHash: { not: null } },
    select: { contentHash: true },
  });
  const hashSet = new Set(existingHashes.map(h => h.contentHash!));
  const transactions = preview.sampleTransactions.filter(t => !hashSet.has(t.contentHash));
  const nbDuplicates = preview.duplicateRows;

  if (transactions.length === 0) {
    await prisma.bankStatementImport.update({
      where: { id: importId },
      data:  { status: 'completed', processedAt: new Date(), importedById: userId, nbTransactions: 0 },
    });
    return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
  }

  // Async si >200 lignes
  if (transactions.length > 200) {
    const lines = transactions.map(t => ({
      bankAccountId:   importRecord.bankAccountId,
      transactionDate: t.transactionDate.toISOString(),
      valueDate:       t.valueDate?.toISOString(),
      label:           t.label,
      amount:          t.amount,
      type:            t.type,
      reference:       t.reference,
      balanceAfter:    t.balanceAfter,
      contentHash:     t.contentHash,
      source:          'csv_import',
      importId:        importId,
      createdById:     userId,
    }));

    const job = await bankImportQueue.add('process', {
      importId,
      bankAccountId: importRecord.bankAccountId,
      lines,
    });

    await prisma.bankStatementImport.update({
      where: { id: importId },
      data:  { status: 'processing', jobId: job.id ?? null, importedById: userId },
    });

    return { nbImported: 0, nbSkipped: preview.errorRows, nbDuplicates, status: 'processing', jobId: job.id };
  }

  // Sync si ≤200 lignes
  return prisma.$transaction(async (tx) => {
    const created = await tx.bankTransaction.createMany({
      data: transactions.map(t => ({
        bankAccountId:   importRecord.bankAccountId,
        transactionDate: t.transactionDate,
        valueDate:       t.valueDate ?? undefined,
        label:           t.label,
        amount:          t.amount,
        type:            t.type,
        reference:       t.reference ?? undefined,
        balanceAfter:    t.balanceAfter ?? undefined,
        contentHash:     t.contentHash,
        source:          'csv_import',
        importId:        importId,
        createdById:     userId,
      })),
      skipDuplicates: true,
    });

    const delta = transactions.reduce((acc, t) =>
      acc + (t.type === 'credit' ? t.amount : -t.amount), 0);

    await Promise.all([
      tx.bankAccount.update({
        where: { id: importRecord.bankAccountId },
        data:  { currentBalance: { increment: delta } },
      }),
      tx.bankStatementImport.update({
        where: { id: importId },
        data: { status: 'completed', processedAt: new Date(), importedById: userId, nbTransactions: created.count, nbUnmatched: created.count },
      }),
    ]);

    await prisma.bankProfileOverride.updateMany({
      where: { bankAccountId: importRecord.bankAccountId },
      data:  { verifiedCount: { increment: 1 }, isVerified: true },
    });

    return { nbImported: created.count, nbSkipped: preview.errorRows, nbDuplicates, status: 'completed' };
  });
}

export async function rollbackImport(importId: string): Promise<{ deleted: number }> {
  const importRecord = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
  if (!importRecord) throw AppError.notFound('Import introuvable');
  if (importRecord.status === 'pending') {
    // Pas encore traité, juste supprimer l'enregistrement
    await prisma.bankStatementImport.delete({ where: { id: importId } });
    return { deleted: 0 };
  }
  if (importRecord.status !== 'completed') {
    throw AppError.conflict('Seul un import complété peut être annulé');
  }

  return prisma.$transaction(async (tx) => {
    // Récupérer les transactions importées
    const txns = await tx.bankTransaction.findMany({
      where: { importId, reconciliationStatus: 'pending' },
      select: { id: true, type: true, amount: true },
    });

    if (txns.length > 0) {
      const balanceDelta = txns.reduce((acc, t) => {
        return acc + (t.type === 'credit' ? -Number(t.amount) : Number(t.amount));
      }, 0);
      await tx.bankAccount.update({
        where: { id: importRecord.bankAccountId },
        data:  { currentBalance: { increment: balanceDelta } },
      });
    }

    const deleted = await tx.bankTransaction.deleteMany({ where: { importId, reconciliationStatus: 'pending' } });
    await tx.bankStatementImport.update({
      where: { id: importId },
      data:  { status: 'cancelled' },
    });

    return { deleted: deleted.count };
  });
}

export async function getImportStatus(importId: string) {
  const record = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
  if (!record) throw AppError.notFound('Import introuvable');

  let progress = 100;
  if (record.status === 'processing' && record.jobId) {
    try {
      const job = await bankImportQueue.getJob(record.jobId);
      if (job) progress = (job.progress as number) ?? 0;
    } catch { /* job non trouvé → terminé */ }
  }

  return {
    importId:       record.id,
    status:         record.status,
    progress,
    nbTransactions: record.nbTransactions,
    nbMatched:      record.nbMatched,
    nbUnmatched:    record.nbUnmatched,
    processedAt:    record.processedAt,
    errorMessage:   record.errorMessage,
  };
}

export async function getImportConfig(accountId: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id: accountId, deletedAt: null } });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const override = await prisma.bankProfileOverride.findUnique({ where: { bankAccountId: accountId } });

  return {
    accountId,
    hasOverride:   !!override,
    isVerified:    override?.isVerified ?? false,
    verifiedCount: override?.verifiedCount ?? 0,
    profileData:   override?.profileData ?? null,
  };
}

export async function saveProfileOverride(
  bankAccountId: string,
  profileData: DetectedFormat,
  userId: string
) {
  return prisma.bankProfileOverride.upsert({
    where:  { bankAccountId },
    create: { bankAccountId, profileData: profileData as any, createdById: userId, verifiedCount: 1, isVerified: false },
    update: { profileData: profileData as any, verifiedCount: { increment: 1 } },
  });
}

// ── Subset Sum : 1 transaction → N paiements ─────────────────────────────────

export async function findSubsetMatches(transactionId: string) {
  const t = await prisma.bankTransaction.findUnique({ where: { id: transactionId } });
  if (!t) throw AppError.notFound('Transaction introuvable');

  const amount    = Number(t.amount);
  const tolerance = Math.max(1, amount * 0.001);
  const dateFrom  = new Date(t.transactionDate); dateFrom.setDate(dateFrom.getDate() - 10);
  const dateTo    = new Date(t.transactionDate); dateTo.setDate(dateTo.getDate() + 10);

  const [payments, supplierPayments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
      select: { id: true, amount: true, paymentDate: true, reference: true },
      take: 20,
    }),
    prisma.supplierPayment.findMany({
      where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } },
      select: { id: true, amount: true, paymentDate: true, reference: true },
      take: 20,
    }),
    prisma.expense.findMany({
      where: { deletedAt: null, bankTransactionId: null, expenseDate: { gte: dateFrom, lte: dateTo } },
      select: { id: true, amountTtc: true, expenseDate: true, title: true },
      take: 20,
    }),
  ]);

  const candidates: SubsetCandidate[] = [
    ...payments.map(p => ({ id: `payment:${p.id}`, amount: Number(p.amount), label: p.reference ?? '', date: p.paymentDate })),
    ...supplierPayments.map(s => ({ id: `supplier_payment:${s.id}`, amount: Number(s.amount), label: s.reference ?? '', date: s.paymentDate })),
    ...expenses.map(e => ({ id: `expense:${e.id}`, amount: Number(e.amountTtc), label: e.title, date: e.expenseDate })),
  ];

  const matches = subsetSum(candidates, amount, tolerance, 6, 5);
  return { transaction: t, candidates: candidates.length, matches };
}

// ── Hungarian : affectation optimale globale (batch) ─────────────────────────

export async function getAutoMatchBatch(reconciliationId: string, applyHighConfidence: boolean) {
  const r = await prisma.bankReconciliation.findUnique({ where: { id: reconciliationId } });
  if (!r) throw AppError.notFound('Session de rapprochement introuvable');

  const pendingTxns = await prisma.bankTransaction.findMany({
    where: { bankAccountId: r.bankAccountId, reconciliationStatus: 'pending', transactionDate: { gte: r.periodStart, lte: r.periodEnd } },
  });

  if (pendingTxns.length === 0) return { applied: 0, suggestions: [] };

  const dateFrom = r.periodStart;
  const dateTo   = r.periodEnd;

  const [payments, supplierPayments, expenses] = await Promise.all([
    prisma.payment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } }, take: 100 }),
    prisma.supplierPayment.findMany({ where: { deletedAt: null, bankTransactionId: null, paymentDate: { gte: dateFrom, lte: dateTo } }, take: 100 }),
    prisma.expense.findMany({ where: { deletedAt: null, bankTransactionId: null, expenseDate: { gte: dateFrom, lte: dateTo } }, take: 100 }),
  ]);

  type Candidate = { entityType: string; entityId: string; amount: number; date: Date; label: string };
  const candidates: Candidate[] = [
    ...payments.map(p => ({ entityType: 'payment', entityId: p.id, amount: Number(p.amount), date: p.paymentDate, label: '' })),
    ...supplierPayments.map(s => ({ entityType: 'supplier_payment', entityId: s.id, amount: Number(s.amount), date: s.paymentDate, label: '' })),
    ...expenses.map(e => ({ entityType: 'expense', entityId: e.id, amount: Number(e.amountTtc), date: e.expenseDate, label: e.title })),
  ];

  if (candidates.length === 0) return { applied: 0, suggestions: [] };

  // Construire la matrice de coût (on maximise le score → on minimise 100-score)
  const costMatrix = pendingTxns.map(tx =>
    candidates.map(c => {
      const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label, txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
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
    const detail = computeScore({ entityAmount: c.amount, entityDate: c.date, entityLabel: c.label, txAmount: Number(tx.amount), txDate: tx.transactionDate, txLabel: tx.label });
    if (detail.total >= 80) high.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
    else if (detail.total >= 50) medium.push({ txId: tx.id, entityType: c.entityType, entityId: c.entityId, score: detail.total });
  }

  let applied = 0;
  if (applyHighConfidence && high.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const m of high) {
        await tx.bankTransaction.update({
          where: { id: m.txId },
          data:  { reconciliationStatus: 'reconciled', reconciledAt: new Date(), matchedEntityType: m.entityType, matchedEntityId: m.entityId },
        });
      }
    });
    applied = high.length;
  }

  return { applied, high, medium };
}

export async function learnMatchingRule(
  transactionId: string,
  entityType:    string,
  entityId:      string,
  userId:        string,
) {
  const t = await prisma.bankTransaction.findUnique({ where: { id: transactionId } });
  if (!t) return;

  // Extraire les tokens significatifs du libellé (mots >3 lettres, non numériques)
  const tokens = t.label
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !/^\d+$/.test(w));
  if (tokens.length === 0) return;

  // Utiliser le token le plus long comme pattern principal
  const labelContains = tokens.sort((a, b) => b.length - a.length)[0]!.slice(0, 255);

  // Chercher une règle existante similaire
  const existing = await prisma.bankMatchingRule.findFirst({
    where: { bankAccountId: t.bankAccountId, labelContains, entityType },
  });

  if (existing) {
    await prisma.bankMatchingRule.update({
      where: { id: existing.id },
      data:  { confidence: { increment: 1 }, entityId, amountMin: Number(t.amount) * 0.9, amountMax: Number(t.amount) * 1.1 },
    });
  } else {
    await prisma.bankMatchingRule.create({
      data: {
        bankAccountId: t.bankAccountId,
        labelContains,
        entityType,
        entityId,
        amountMin:   Number(t.amount) * 0.9,
        amountMax:   Number(t.amount) * 1.1,
        confidence:  1,
        isActive:    true,
        isAutoApply: false,
        createdById: userId,
      },
    });
  }
}

// ── CRUD Règles de matching ───────────────────────────────────────────────────

export async function listMatchingRules(bankAccountId?: string) {
  return prisma.bankMatchingRule.findMany({
    where:   { ...(bankAccountId ? { bankAccountId } : {}), isActive: true },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createMatchingRule(data: {
  bankAccountId?: string; labelContains: string; entityType: string;
  entityId?: string; category?: string; amountMin?: number; amountMax?: number;
  isAutoApply?: boolean;
}, userId: string) {
  return prisma.bankMatchingRule.create({
    data: {
      bankAccountId: data.bankAccountId ?? undefined,
      labelContains: data.labelContains,
      entityType:    data.entityType,
      entityId:      data.entityId ?? undefined,
      category:      data.category ?? undefined,
      amountMin:     data.amountMin ?? undefined,
      amountMax:     data.amountMax ?? undefined,
      isAutoApply:   data.isAutoApply ?? false,
      confidence:    1,
      createdById:   userId,
    },
  });
}

export async function updateMatchingRule(id: string, data: {
  labelContains?: string; isActive?: boolean; isAutoApply?: boolean;
  amountMin?: number; amountMax?: number;
}) {
  return prisma.bankMatchingRule.update({ where: { id }, data });
}

export async function deleteMatchingRule(id: string) {
  return prisma.bankMatchingRule.update({ where: { id }, data: { isActive: false } });
}

// ── Profils d'import bancaire ─────────────────────────────────────────────────

export async function listImportProfiles() {
  return prisma.bankImportProfile.findMany({
    where:   { deletedAt: null },
    orderBy: [{ source: 'asc' }, { usageCount: 'desc' }, { name: 'asc' }],
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function getImportProfileById(id: string) {
  const p = await prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw AppError.notFound('Profil introuvable');
  return p;
}

export async function createImportProfile(data: {
  name: string; bankName?: string; country?: string;
  encoding?: string; delimiter?: string; dateFormat?: string;
  numberFormat: { thousands: string; decimal: string };
  columnMapping: Record<string, string>;
  directionValues?: { debit: string[]; credit: string[] };
  amountSign?: string;
  skipRowsContaining?: string[];
  skipFirstRows?: number;
  isPublic?: boolean;
  notes?: string;
}, userId: string) {
  return prisma.bankImportProfile.create({
    data: {
      name:               data.name,
      bankName:           data.bankName ?? undefined,
      country:            data.country ?? 'CM',
      source:             'user',
      fileFormat:         'csv',
      encoding:           data.encoding ?? 'utf-8',
      delimiter:          data.delimiter ?? ';',
      dateFormat:         data.dateFormat ?? 'DD/MM/YYYY',
      numberFormat:       data.numberFormat,
      columnMapping:      data.columnMapping,
      directionValues:    data.directionValues ?? undefined,
      amountSign:         data.amountSign ?? undefined,
      skipRowsContaining: data.skipRowsContaining ?? undefined,
      skipFirstRows:      data.skipFirstRows ?? 1,
      isPublic:           data.isPublic ?? false,
      notes:              data.notes ?? undefined,
      createdById:        userId,
    },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function updateImportProfile(id: string, data: {
  name?: string; bankName?: string; country?: string;
  encoding?: string; delimiter?: string; dateFormat?: string;
  numberFormat?: { thousands: string; decimal: string };
  columnMapping?: Record<string, string>;
  directionValues?: { debit: string[]; credit: string[] };
  amountSign?: string;
  skipRowsContaining?: string[];
  skipFirstRows?: number;
  isPublic?: boolean;
  notes?: string;
}) {
  const existing = await prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound('Profil introuvable');
  if (existing.source !== 'user') throw AppError.forbidden('Seuls les profils utilisateur sont modifiables');

  return prisma.bankImportProfile.update({
    where: { id },
    data:  {
      ...(data.name               !== undefined && { name: data.name }),
      ...(data.bankName           !== undefined && { bankName: data.bankName }),
      ...(data.country            !== undefined && { country: data.country }),
      ...(data.encoding           !== undefined && { encoding: data.encoding }),
      ...(data.delimiter          !== undefined && { delimiter: data.delimiter }),
      ...(data.dateFormat         !== undefined && { dateFormat: data.dateFormat }),
      ...(data.numberFormat       !== undefined && { numberFormat: data.numberFormat }),
      ...(data.columnMapping      !== undefined && { columnMapping: data.columnMapping }),
      ...(data.directionValues    !== undefined && { directionValues: data.directionValues }),
      ...(data.amountSign         !== undefined && { amountSign: data.amountSign }),
      ...(data.skipRowsContaining !== undefined && { skipRowsContaining: data.skipRowsContaining }),
      ...(data.skipFirstRows      !== undefined && { skipFirstRows: data.skipFirstRows }),
      ...(data.isPublic           !== undefined && { isPublic: data.isPublic }),
      ...(data.notes              !== undefined && { notes: data.notes }),
    },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function deleteImportProfile(id: string) {
  const existing = await prisma.bankImportProfile.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound('Profil introuvable');
  if (existing.source !== 'user') throw AppError.forbidden('Les profils système ne peuvent pas être supprimés');
  return prisma.bankImportProfile.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function incrementProfileUsage(id: string) {
  return prisma.bankImportProfile.update({
    where: { id },
    data:  { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}
