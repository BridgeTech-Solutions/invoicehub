import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import {
  CreateChartAccountInput, CreateFiscalPeriodInput,
  CreateJournalInput, CreateJournalEntryInput, CreateTaxDeclarationInput,
  UpdateJournalEntryInput, ManualLetteringInput, UnletteredLinesInput,
} from './accounting.schema';

// ── Plan comptable ─────────────────────────────────────────────────────────────

export async function getChartOfAccounts(params: { search?: string; accountClass?: string; isActive?: boolean }) {
  const where: Record<string, unknown> = {};
  if (params.isActive !== undefined) where['isActive'] = params.isActive;
  if (params.accountClass) where['accountClass'] = params.accountClass;
  if (params.search) {
    where['OR'] = [
      { accountNumber: { contains: params.search, mode: 'insensitive' } },
      { name: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  return prisma.chartOfAccount.findMany({ where, orderBy: { accountNumber: 'asc' } });
}

export async function createChartAccount(data: CreateChartAccountInput) {
  const existing = await prisma.chartOfAccount.findUnique({ where: { accountNumber: data.accountNumber } });
  if (existing) throw AppError.conflict(`Le compte ${data.accountNumber} existe déjà`);
  return prisma.chartOfAccount.create({
    data: {
      accountNumber:      data.accountNumber,
      name:               data.name,
      parentAccountNumber: data.parentAccountNumber ?? undefined,
      accountClass:       data.accountClass as never ?? undefined,
      isDetailAccount:    data.isDetailAccount,
      notes:              data.notes ?? undefined,
    },
  });
}

export async function updateChartAccount(accountNumber: string, data: { name?: string; notes?: string | null; isActive?: boolean }) {
  const account = await prisma.chartOfAccount.findUnique({ where: { accountNumber } });
  if (!account) throw AppError.notFound('Compte comptable introuvable');
  if (account.isSystem) throw AppError.forbidden('Les comptes système SYSCOHADA ne peuvent pas être modifiés');
  return prisma.chartOfAccount.update({ where: { accountNumber }, data });
}

// ── Périodes fiscales ──────────────────────────────────────────────────────────

export async function listFiscalPeriods() {
  return prisma.fiscalPeriod.findMany({ orderBy: [{ fiscalYear: 'desc' }, { startDate: 'asc' }] });
}

export async function getFiscalPeriodById(id: string) {
  const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
  if (!period) throw AppError.notFound('Période introuvable');
  return period;
}

export async function createFiscalPeriod(data: CreateFiscalPeriodInput) {
  if (data.endDate <= data.startDate) throw AppError.badRequest('La date de fin doit être après la date de début');
  return prisma.fiscalPeriod.create({ data: { ...data, status: 'open' } });
}

export async function closeFiscalPeriod(id: string) {
  const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
  if (!period) throw AppError.notFound('Période introuvable');
  if (period.status !== 'open') throw AppError.badRequest('La période n\'est pas ouverte');
  return prisma.fiscalPeriod.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
}

export async function lockFiscalPeriod(id: string) {
  const period = await prisma.fiscalPeriod.findUnique({ where: { id } });
  if (!period) throw AppError.notFound('Période introuvable');
  if (period.status === 'locked') throw AppError.badRequest('Période déjà verrouillée');
  return prisma.fiscalPeriod.update({ where: { id }, data: { status: 'locked', lockedAt: new Date() } });
}

// ── Journaux ──────────────────────────────────────────────────────────────────

export async function listJournals() {
  return prisma.accountingJournal.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    include: { _count: { select: { journalEntries: true } } },
  });
}

export async function getJournalById(id: string) {
  const journal = await prisma.accountingJournal.findUnique({
    where: { id },
    include: { _count: { select: { journalEntries: true } } },
  });
  if (!journal) throw AppError.notFound('Journal introuvable');
  return journal;
}

export async function createJournal(data: CreateJournalInput) {
  const existing = await prisma.accountingJournal.findFirst({ where: { code: data.code } });
  if (existing) throw AppError.conflict(`Le journal ${data.code} existe déjà`);
  return prisma.accountingJournal.create({ data: { ...data, isActive: true } });
}

// ── Écritures comptables ───────────────────────────────────────────────────────

export async function listEntries(params: {
  page: number; limit: number;
  journalId?: string; fiscalPeriodId?: string;
  status?: string; search?: string;
  dateFrom?: string; dateTo?: string;
}) {
  const { page, limit, journalId, fiscalPeriodId, status, search, dateFrom, dateTo } = params;
  const where: Record<string, unknown> = {};
  if (journalId) where['journalId'] = journalId;
  if (fiscalPeriodId) where['fiscalPeriodId'] = fiscalPeriodId;
  if (status) where['status'] = status;
  if (search) where['OR'] = [
    { entryNumber: { contains: search, mode: 'insensitive' } },
    { label:       { contains: search, mode: 'insensitive' } },
  ];
  if (dateFrom || dateTo) {
    where['entryDate'] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { entryDate: 'desc' },
      include: {
        journal:      { select: { id: true, code: true, name: true } },
        fiscalPeriod: { select: { id: true, name: true } },
        _count:       { select: { lines: true } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);
  return { data, total };
}

export async function getEntryById(id: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
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

export async function createJournalEntry(data: CreateJournalEntryInput, userId: string) {
  const period = await prisma.fiscalPeriod.findUnique({ where: { id: data.fiscalPeriodId } });
  if (!period) throw AppError.notFound('Période introuvable');
  if (period.status === 'locked') throw AppError.forbidden('Impossible d\'écrire dans une période verrouillée');
  if (period.status === 'closed') throw AppError.forbidden('Impossible d\'écrire dans une période clôturée');

  const totalDebit  = data.lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) >= 0.01) throw AppError.badRequest('Écriture non équilibrée : débit ≠ crédit');

  const [seqRow] = await prisma.$queryRaw<[{ nextval: string }]>`
    SELECT nextval('journal_entry_seq') AS nextval
  `.catch(() =>
    prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`
  );

  const entryDate     = data.entryDate;
  const entryNumber   = `JNL-${entryDate.getFullYear()}-${String(seqRow.nextval).slice(-6).padStart(6, '0')}`;
  const accountingDate = data.accountingDate ?? entryDate;

  return prisma.$transaction(async (tx) => {
    return tx.journalEntry.create({
      data: {
        journalId:      data.journalId,
        fiscalPeriodId: data.fiscalPeriodId,
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

export async function validateEntry(id: string, userId: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound('Écriture introuvable');
  if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être validés');
  return prisma.journalEntry.update({
    where: { id },
    data: { status: 'validated', validatedById: userId, validatedAt: new Date() },
  });
}

export async function lockEntry(id: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound('Écriture introuvable');
  if (entry.status !== 'validated') throw AppError.badRequest('Seules les écritures validées peuvent être verrouillées');
  return prisma.journalEntry.update({ where: { id }, data: { status: 'locked', lockedAt: new Date() } });
}

export async function updateJournalEntry(id: string, data: UpdateJournalEntryInput) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound('Écriture introuvable');
  if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

  return prisma.$transaction(async (tx) => {
    if (data.lines) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: id } });
    }

    const updateData: Parameters<typeof tx.journalEntry.update>[0]['data'] = {};
    if (data.label     !== undefined) updateData.label     = data.label;
    if (data.entryDate !== undefined) updateData.entryDate = data.entryDate;
    if (data.accountingDate !== undefined) {
      updateData.accountingDate = data.accountingDate ?? undefined;
    }
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

export async function deleteJournalEntry(id: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw AppError.notFound('Écriture introuvable');
  if (entry.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
  await prisma.journalEntry.delete({ where: { id } });
}

export async function reverseEntry(id: string, userId: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!entry) throw AppError.notFound('Écriture introuvable');
  if (!['validated', 'locked'].includes(entry.status)) {
    throw AppError.badRequest('Seules les écritures validées ou verrouillées peuvent être extournées');
  }

  const period = await prisma.fiscalPeriod.findUnique({ where: { id: entry.fiscalPeriodId } });
  if (period?.status === 'locked') {
    throw AppError.forbidden('Période verrouillée — créez une nouvelle période ouverte pour l\'extourne');
  }

  const [seqRow] = await prisma.$queryRaw<[{ nextval: string }]>`
    SELECT nextval('journal_entry_seq') AS nextval
  `.catch(() =>
    prisma.$queryRaw<[{ nextval: string }]>`SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint AS nextval`
  );

  const today = new Date();
  const entryNumber = `JNL-${today.getFullYear()}-${String(seqRow.nextval).slice(-6).padStart(6, '0')}`;

  return prisma.$transaction(async (tx) => {
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

export async function exportBalancePdf(fiscalPeriodId?: string): Promise<Buffer> {
  const balanceLines = await getAccountBalance({ fiscalPeriodId });

  let periodLabel = 'Toutes périodes';
  if (fiscalPeriodId) {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: fiscalPeriodId } });
    periodLabel = period?.name ?? fiscalPeriodId;
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));

  const totalDebit  = balanceLines.reduce((s, l) => s + l.totalDebit, 0);
  const totalCredit = balanceLines.reduce((s, l) => s + l.totalCredit, 0);
  const BLUE = '#2196F3';
  const TAN  = '#C8B87A';

  const rows = balanceLines.map(l => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;">${l.accountNumber}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${fmt(l.totalDebit)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${fmt(l.totalCredit)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;${l.balance < 0 ? 'color:#e53e3e;' : ''}">${fmt(Math.abs(l.balance))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#333;width:210mm; }
  .page-content { padding:10mm 14mm; }
  h1 { font-size:15px;font-weight:bold;text-align:center;margin:18px 0 6px; }
  h2 { font-size:11px;text-align:center;color:#666;margin-bottom:16px; }
  table { width:100%;border-collapse:collapse; }
  thead th { background:${BLUE};color:#fff;padding:6px 8px;border:1px solid #ddd;text-align:right; }
  thead th:first-child { text-align:left; }
  tfoot td { background:${TAN};font-weight:bold;padding:6px 8px;border:1px solid #ddd;text-align:right; }
  tfoot td:first-child { text-align:left; }
</style>
</head>
<body>
<div class="page-content">
  <h1>BALANCE DES COMPTES</h1>
  <h2>Période : ${periodLabel} — Édité le ${new Date().toLocaleDateString('fr-FR')}</h2>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Compte</th>
        <th>Débit</th>
        <th>Crédit</th>
        <th>Solde</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td>${fmt(totalDebit)}</td>
        <td>${fmt(totalCredit)}</td>
        <td>${fmt(Math.abs(totalDebit - totalCredit))}</td>
      </tr>
    </tfoot>
  </table>
</div>
</body>
</html>`;

  const { generatePdf } = await import('../../lib/pdf');
  return generatePdf(html);
}

// ── Grand livre / Balance ──────────────────────────────────────────────────────

export async function getAccountBalance(params: { fiscalPeriodId?: string; accountClass?: string }) {
  const entryWhere: Record<string, unknown> = { status: { in: ['validated', 'locked'] } };
  if (params.fiscalPeriodId) entryWhere['fiscalPeriodId'] = params.fiscalPeriodId;

  const lines = await prisma.journalEntryLine.groupBy({
    by: ['accountNumber'],
    where: { journalEntry: entryWhere as never },
    _sum: { debit: true, credit: true },
    orderBy: { accountNumber: 'asc' },
  });

  return lines.map((l) => ({
    accountNumber: l.accountNumber,
    totalDebit:    Number(l._sum?.debit  ?? 0),
    totalCredit:   Number(l._sum?.credit ?? 0),
    balance:       Number(l._sum?.debit  ?? 0) - Number(l._sum?.credit ?? 0),
  }));
}

export async function getAccountLedger(accountNumber: string, params: { page: number; limit: number; fiscalPeriodId?: string }) {
  const account = await prisma.chartOfAccount.findUnique({ where: { accountNumber } });
  if (!account) throw AppError.notFound('Compte introuvable');

  const where: Record<string, unknown> = { accountNumber };
  if (params.fiscalPeriodId) where['journalEntry'] = { fiscalPeriodId: params.fiscalPeriodId };

  const [lines, total] = await Promise.all([
    prisma.journalEntryLine.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { journalEntry: { entryDate: 'asc' } },
      include: { journalEntry: { select: { entryNumber: true, entryDate: true, label: true, journal: { select: { code: true } } } } },
    }),
    prisma.journalEntryLine.count({ where }),
  ]);
  return { account, lines, total };
}

export async function exportSageCsv(fiscalPeriodId?: string): Promise<string> {
  const where: Record<string, unknown> = { status: { in: ['validated', 'locked'] } };
  if (fiscalPeriodId) where['fiscalPeriodId'] = fiscalPeriodId;

  const entries = await prisma.journalEntry.findMany({
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

// ── Déclarations fiscales ──────────────────────────────────────────────────────

export async function listTaxDeclarations(params: { page: number; limit: number; declarationType?: string }) {
  const where: Record<string, unknown> = {};
  if (params.declarationType) where['declarationType'] = params.declarationType;
  const [data, total] = await Promise.all([
    prisma.taxDeclaration.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.taxDeclaration.count({ where }),
  ]);
  return { data, total };
}

export async function createTaxDeclaration(data: CreateTaxDeclarationInput, userId: string) {
  return prisma.taxDeclaration.create({
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

export async function getTaxDeclarationById(id: string) {
  const d = await prisma.taxDeclaration.findUnique({ where: { id } });
  if (!d) throw AppError.notFound('Déclaration introuvable');
  return d;
}

export async function submitTaxDeclaration(id: string, userId: string) {
  const d = await prisma.taxDeclaration.findUnique({ where: { id } });
  if (!d) throw AppError.notFound('Déclaration introuvable');
  if (d.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être soumis');
  return prisma.taxDeclaration.update({
    where: { id },
    data: { status: 'submitted', submittedAt: new Date(), submittedById: userId },
  });
}

// ── Lettrage manuel ────────────────────────────────────────────────────────────

function generateNextCode(lastCode: string | null): string {
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

export async function letterLines(input: ManualLetteringInput, userId: string): Promise<void> {
  const { lineIds, accountNumber } = input;

  const lines = await prisma.journalEntryLine.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, accountNumber: true, debit: true, credit: true, letteringCode: true },
  });

  if (lines.length !== lineIds.length) {
    throw AppError.notFound('Une ou plusieurs lignes introuvables');
  }

  const wrongAccount = lines.find(l => l.accountNumber !== accountNumber);
  if (wrongAccount) {
    throw AppError.badRequest(
      `La ligne ${wrongAccount.id} appartient au compte ${wrongAccount.accountNumber}, pas ${accountNumber}`,
    );
  }

  const alreadyLettered = lines.find(l => l.letteringCode);
  if (alreadyLettered) {
    throw AppError.conflict(
      `La ligne ${alreadyLettered.id} est déjà lettrée (${alreadyLettered.letteringCode})`,
    );
  }

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw AppError.badRequest(
      `Lettrage non équilibré : débit ${totalDebit} ≠ crédit ${totalCredit} (écart ${Math.abs(totalDebit - totalCredit).toFixed(2)})`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const last = await tx.journalEntryLine.findFirst({
      where: { accountNumber, letteringCode: { not: null } },
      orderBy: { letteredAt: 'desc' },
      select: { letteringCode: true },
    });
    const code = generateNextCode(last?.letteringCode ?? null);
    await tx.journalEntryLine.updateMany({
      where: { id: { in: lineIds } },
      data:  { letteringCode: code, letteredAt: new Date(), letteredById: userId },
    });
  });
}

export async function deleteLettering(code: string, accountNumber: string): Promise<void> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { letteringCode: code, accountNumber },
    select: { id: true },
  });
  if (lines.length === 0) {
    throw AppError.notFound(`Aucune ligne lettrée avec le code "${code}" sur le compte ${accountNumber}`);
  }
  await prisma.journalEntryLine.updateMany({
    where: { letteringCode: code, accountNumber },
    data:  { letteringCode: null, letteredAt: null, letteredById: null },
  });
}

export async function getUnletteredLines(input: UnletteredLinesInput) {
  const { accountNumber, dateFrom, dateTo, page, limit } = input;
  const skip = (page - 1) * limit;

  const where: Prisma.JournalEntryLineWhereInput = {
    accountNumber,
    letteringCode: null,
    ...(dateFrom || dateTo ? {
      journalEntry: {
        entryDate: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
        },
      },
    } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.journalEntryLine.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        journalEntry: {
          select: { entryNumber: true, entryDate: true, label: true, sourceType: true, sourceId: true },
        },
      },
    }),
    prisma.journalEntryLine.count({ where }),
  ]);

  const totalDebit  = data.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = data.reduce((s, l) => s + Number(l.credit), 0);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalDebit,
    totalCredit,
    balance: totalDebit - totalCredit,
  };
}
