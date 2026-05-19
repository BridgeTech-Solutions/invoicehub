import { JournalType } from '@prisma/client';
import { prisma } from '../config/database';

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

async function getDefaultJournal(tx: Tx, type: JournalType) {
  const j = await tx.accountingJournal.findFirst({ where: { type, isActive: true } });
  if (!j) throw new Error(`Journal comptable "${type}" introuvable`);
  return j;
}

async function getOpenPeriod(tx: Tx, date: Date) {
  const p = await tx.fiscalPeriod.findFirst({
    where: { status: 'open', startDate: { lte: date }, endDate: { gte: date } },
  });
  if (!p) throw new Error(`Aucune période fiscale ouverte pour le ${date.toLocaleDateString('fr-FR')}`);
  return p;
}

// ── Étape 1 — nextLetteringCode : A → B → ... → Z → AA → AB ... (style colonnes Excel)
async function nextLetteringCode(tx: Tx, accountNumber: string): Promise<string> {
  const last = await tx.journalEntryLine.findFirst({
    where: { accountNumber, letteringCode: { not: null } },
    orderBy: { letteredAt: 'desc' },
    select: { letteringCode: true },
  });

  if (!last?.letteringCode) return 'A';

  const chars = last.letteringCode.split('');
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

// ── nextEntryNumber atomique (findFirst + orderBy desc, sans race condition)
async function nextEntryNumber(tx: Tx, journalCode: string, date: Date): Promise<string> {
  const year   = date.getFullYear();
  const prefix = `${journalCode}-${year}-`;

  const last = await tx.journalEntry.findFirst({
    where: {
      journal:   { code: journalCode },
      entryDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
    orderBy: { entryNumber: 'desc' },
    select:  { entryNumber: true },
  });

  let next = 1;
  if (last?.entryNumber) {
    const lastNum = parseInt(last.entryNumber.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) next = lastNum + 1;
  }

  return `${prefix}${String(next).padStart(5, '0')}`;
}

// ── Helper Étape 2 — décompose les lignes de facture en lignes d'écriture ──────

interface JournalLineData {
  sortOrder: number;
  accountNumber: string;
  label: string;
  debit: number;
  credit: number;
}

function buildSalesBreakdown(lines: Array<{
  netHt: any; taxRate: any; taxAmount: any; product?: { type?: string } | null;
}>): { salesLines: JournalLineData[]; taxLines: JournalLineData[] } {
  const salesMap = new Map<string, number>();
  const taxMap   = new Map<string, number>();

  for (const l of lines) {
    const salesAccount = l.product?.type === 'product' ? '701000' : '706000';
    salesMap.set(salesAccount, (salesMap.get(salesAccount) ?? 0) + Number(l.netHt));

    const rate = Number(l.taxRate);
    if (rate > 0) {
      taxMap.set('447200', (taxMap.get('447200') ?? 0) + Number(l.taxAmount));
    }
  }

  const salesLines: JournalLineData[] = [];
  let sortOrder = 1;
  for (const [accountNumber, amount] of salesMap) {
    if (amount > 0) {
      const label = accountNumber === '701000' ? 'Ventes de marchandises' : 'Prestations de services';
      salesLines.push({ sortOrder: sortOrder++, accountNumber, label, debit: 0, credit: amount });
    }
  }

  const taxLines: JournalLineData[] = [];
  for (const [accountNumber, amount] of taxMap) {
    if (amount > 0) {
      taxLines.push({ sortOrder: sortOrder++, accountNumber, label: 'TVA collectée', debit: 0, credit: amount });
    }
  }

  return { salesLines, taxLines };
}

// ── Étape 2.1 — onInvoiceIssued : compte client dynamique + TVA par taux ───────

/**
 * Écriture automatique lors de l'émission d'une facture client.
 * Débit 411xxx (client auxiliaire), Crédit 70xxxx (ventes) + 447200 (TVA collectée)
 */
export async function onInvoiceIssued(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        lines: { include: { product: { select: { type: true } } } },
      },
    });
    if (!invoice) return;

    const clientAccount = (invoice.client as any)?.accountingAccount ?? '411000';
    const { salesLines, taxLines } = buildSalesBreakdown(invoice.lines);

    const entryDate   = new Date(invoice.issueDate ?? new Date());
    const journal     = await getDefaultJournal(tx, JournalType.sales);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    const lineItems: JournalLineData[] = [
      { sortOrder: 0, accountNumber: clientAccount, label: `Client ${invoice.client?.name ?? ''}`, debit: Number(invoice.totalTtc), credit: 0 },
      ...salesLines,
      ...taxLines,
    ];

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FAC ${invoice.number} — ${invoice.client?.name ?? 'Client'}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        totalDebit:  Number(invoice.totalTtc),
        totalCredit: Number(invoice.totalTtc),
        status:      'draft',
        lines: { create: lineItems },
      },
    });
  } catch {
    // Silencieux — ne bloque pas l'émission
  }
}

// ── Étape 2.3 — onPaymentReceived : banque dynamique + compte client dynamique ──

/**
 * Écriture automatique lors d'un paiement client reçu.
 * Débit 521xxx (banque configurée), Crédit 411xxx (client auxiliaire)
 */
export async function onPaymentReceived(paymentId: string, tx: Tx): Promise<void> {
  try {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice:     { include: { client: true } },
        bankAccount: true,
      },
    });
    if (!payment) return;

    const bankAccountNum = (payment.bankAccount as any)?.accountingAccount ?? '521000';
    const bankLabel      = (payment.bankAccount as any)?.name ?? 'Banque';
    const clientAccount  = (payment.invoice?.client as any)?.accountingAccount ?? '411000';

    const entryDate   = new Date(payment.paymentDate);
    const journal     = await getDefaultJournal(tx, JournalType.bank);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `Règlement FAC ${payment.invoice?.number ?? ''} — ${payment.invoice?.client?.name ?? ''}`,
        sourceType:  'payment',
        sourceId:    payment.id,
        totalDebit:  Number(payment.amount),
        totalCredit: Number(payment.amount),
        status:      'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber: bankAccountNum, label: `Encaissement ${bankLabel}`,                          debit: Number(payment.amount), credit: 0 },
            { sortOrder: 1, accountNumber: clientAccount,  label: `Client ${payment.invoice?.client?.name ?? ''}`,      debit: 0, credit: Number(payment.amount) },
          ],
        },
      },
    });

    // Lettrage auto 411 : déclenché quand la facture est soldée (balanceDue ≤ 0)
    try {
      const invoiceId = payment.invoice?.id;
      if (invoiceId) {
        // Relit la facture pour avoir le balanceDue mis à jour par le service
        const freshInvoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { balanceDue: true },
        });

        const isFullyPaid = Number(freshInvoice?.balanceDue ?? 1) <= 0;

        const invoiceEntry = await tx.journalEntry.findFirst({
          where: { sourceType: 'invoice', sourceId: invoiceId },
          include: { lines: true },
        });
        const invoiceLine = invoiceEntry?.lines.find(
          l => l.accountNumber.startsWith('411') && !l.letteringCode,
        );

        if (invoiceLine && isFullyPaid) {
          // Récupère TOUS les paiements de cette facture pour lettrer en bloc
          const allPayments = await tx.payment.findMany({
            where: { invoiceId, deletedAt: null },
            select: { id: true },
          });
          const paymentEntries = await tx.journalEntry.findMany({
            where: { sourceType: 'payment', sourceId: { in: allPayments.map(p => p.id) } },
            include: { lines: true },
          });
          const allPaymentLines411 = paymentEntries.flatMap(e =>
            e.lines.filter(l => l.accountNumber.startsWith('411') && !l.letteringCode),
          );

          const totalCredits = allPaymentLines411.reduce((s, l) => s + Number(l.credit), 0);
          if (allPaymentLines411.length > 0 && Math.abs(totalCredits - Number(invoiceLine.debit)) <= 0.01) {
            const code = await nextLetteringCode(tx, invoiceLine.accountNumber);
            const now  = new Date();
            await tx.journalEntryLine.updateMany({
              where: { id: { in: [invoiceLine.id, ...allPaymentLines411.map(l => l.id)] } },
              data:  { letteringCode: code, letteredAt: now },
            });
          }
        }
      }
    } catch {
      // Silencieux — le lettrage auto ne bloque pas l'encaissement
    }
  } catch {
    // Silencieux
  }
}

// ── Extourne paiement client supprimé ────────────────────────────────────────

/**
 * Extourne de l'écriture de règlement quand un paiement est annulé (soft-delete).
 * Inverse les lignes : Débit 411xxx / Crédit 521xxx.
 * Marque l'écriture originale en 'cancelled'.
 */
export async function onPaymentDeleted(paymentId: string, tx: Tx): Promise<void> {
  try {
    const original = await tx.journalEntry.findFirst({
      where:   { sourceType: 'payment', sourceId: paymentId },
      include: { lines: true },
    });
    if (!original) return;

    const entryDate   = new Date();
    const journal     = await getDefaultJournal(tx, JournalType.bank);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `Extourne — ${original.label}`,
        sourceType:  'payment_reversal',
        sourceId:    paymentId,
        totalDebit:  original.totalCredit,
        totalCredit: original.totalDebit,
        status:      'draft',
        lines: {
          create: original.lines.map((l, i) => ({
            sortOrder:     i,
            accountNumber: l.accountNumber,
            label:         `Extourne — ${l.label}`,
            debit:         Number(l.credit),
            credit:        Number(l.debit),
          })),
        },
      },
    });

    await tx.journalEntry.update({
      where: { id: original.id },
      data:  { status: 'cancelled' },
    });
  } catch {
    // Silencieux — ne bloque pas la suppression
  }
}

// ── Étape 3.1 — onSupplierInvoiceValidated : fournisseur + compte achat dynamiques

/**
 * Écriture automatique lors de la validation d'une facture fournisseur.
 * Débit 60xxxx (achats) + 447100 (TVA déductible), Crédit 401xxx (fournisseur auxiliaire)
 */
export async function onSupplierInvoiceValidated(supplierInvoiceId: string, tx: Tx): Promise<void> {
  try {
    const inv = await tx.supplierInvoice.findUnique({
      where: { id: supplierInvoiceId },
      include: { supplier: true },
    });
    if (!inv) return;

    // Compte fournisseur : auxiliaire si défini sur le fournisseur, sinon collectif
    const supplierAccount = (inv.supplier as any)?.accountingAccount ?? '401000';

    // Compte d'achat : celui défini sur la facture elle-même si différent de 401000, sinon 607000
    const invAccount = (inv as any).accountingAccount;
    const purchaseAccount = invAccount && invAccount !== '401000' ? invAccount : '607000';

    const entryDate   = new Date(inv.invoiceDate);
    const journal     = await getDefaultJournal(tx, JournalType.purchases);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FF ${inv.supplierInvoiceNumber} — ${inv.supplier?.name ?? 'Fournisseur'}`,
        sourceType:  'supplier_invoice',
        sourceId:    inv.id,
        totalDebit:  Number(inv.totalTtc),
        totalCredit: Number(inv.totalTtc),
        status:      'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber: purchaseAccount, label: `Achats — ${inv.supplierInvoiceNumber}`,       debit: Number(inv.totalHt),  credit: 0 },
            { sortOrder: 1, accountNumber: '447100',         label: `TVA déductible`,                            debit: Number(inv.totalTax), credit: 0 },
            { sortOrder: 2, accountNumber: supplierAccount,  label: `Fournisseur ${inv.supplier?.name ?? ''}`,   debit: 0, credit: Number(inv.totalTtc) },
          ],
        },
      },
    });
  } catch {
    // Silencieux
  }
}

// ── Étape 3.2 — onSupplierPaymentMade : banque + fournisseur dynamiques ──────────

/**
 * Écriture automatique lors d'un paiement fournisseur.
 * Débit 401xxx (fournisseur auxiliaire), Crédit 521xxx (banque configurée)
 */
export async function onSupplierPaymentMade(supplierPaymentId: string, tx: Tx): Promise<void> {
  try {
    const payment = await tx.supplierPayment.findUnique({
      where: { id: supplierPaymentId },
      include: {
        supplier:    true,
        bankAccount: true,
      },
    });
    if (!payment) return;

    const supplierAccount = (payment.supplier as any)?.accountingAccount ?? '401000';
    const bankAccountNum  = (payment.bankAccount as any)?.accountingAccount ?? '521000';
    const bankLabel       = (payment.bankAccount as any)?.name ?? 'Banque';

    const entryDate   = new Date(payment.paymentDate);
    const journal     = await getDefaultJournal(tx, JournalType.bank);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `Paiement fournisseur ${payment.supplier?.name ?? ''}`,
        sourceType:  'supplier_payment',
        sourceId:    payment.id,
        totalDebit:  Number(payment.amount),
        totalCredit: Number(payment.amount),
        status:      'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber: supplierAccount, label: `Fournisseur ${payment.supplier?.name ?? ''}`, debit: Number(payment.amount), credit: 0 },
            { sortOrder: 1, accountNumber: bankAccountNum,  label: `Décaissement ${bankLabel}`,                   debit: 0, credit: Number(payment.amount) },
          ],
        },
      },
    });

    // Étape 3 — Lettrage auto 401 : relier la ligne facture fournisseur et la ligne paiement
    try {
      const supplierInvoiceId = payment.supplierInvoiceId;
      if (supplierInvoiceId) {
        const invEntry = await tx.journalEntry.findFirst({
          where: { sourceType: 'supplier_invoice', sourceId: supplierInvoiceId },
          include: { lines: true },
        });
        const invLine = invEntry?.lines.find(
          l => l.accountNumber.startsWith('401') && !l.letteringCode,
        );

        const payEntry = await tx.journalEntry.findFirst({
          where: { sourceType: 'supplier_payment', sourceId: payment.id },
          include: { lines: true },
        });
        const payLine = payEntry?.lines.find(
          l => l.accountNumber.startsWith('401') && !l.letteringCode,
        );

        if (invLine && payLine) {
          const code = await nextLetteringCode(tx, invLine.accountNumber);
          const now  = new Date();
          await tx.journalEntryLine.updateMany({
            where: { id: { in: [invLine.id, payLine.id] } },
            data:  { letteringCode: code, letteredAt: now },
          });
        }
      }
    } catch {
      // Silencieux
    }
  } catch {
    // Silencieux
  }
}

// ── Étape 4 — onInvoiceCancelled : contre-passation avoir ───────────────────────

/**
 * Contre-passation lors de l'annulation d'une facture et génération d'un avoir.
 * Annule exactement l'écriture d'émission (Journal OD ou Ventes).
 * Débit 70xxxx (Ventes), Débit 447200 (TVA), Crédit 411xxx (Client)
 */
export async function onInvoiceCancelled(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        lines:  { include: { product: { select: { type: true } } } },
      },
    });
    if (!invoice) return;

    const clientAccount = (invoice.client as any)?.accountingAccount ?? '411000';
    const { salesLines, taxLines } = buildSalesBreakdown(invoice.lines);

    const entryDate = new Date();
    let journal = await tx.accountingJournal.findFirst({ where: { type: JournalType.operations, isActive: true } });
    if (!journal) journal = await getDefaultJournal(tx, JournalType.sales);

    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    // Contre-passation = inversion exacte de l'écriture d'émission
    const counterLines: JournalLineData[] = [
      { sortOrder: 0, accountNumber: clientAccount, label: `Avoir — Annulation FAC ${invoice.number}`, debit: 0, credit: Number(invoice.totalTtc) },
      ...salesLines.map((l, i) => ({ ...l, sortOrder: i + 1, debit: l.credit, credit: 0 })),
      ...taxLines.map((l, i) => ({ ...l, sortOrder: salesLines.length + i + 1, debit: l.credit, credit: 0 })),
    ];

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `AVOIR sur FAC ${invoice.number} — ${invoice.client?.name ?? 'Client'}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        totalDebit:  Number(invoice.totalTtc),
        totalCredit: Number(invoice.totalTtc),
        status:      'draft',
        lines: { create: counterLines },
      },
    });
  } catch {
    // Silencieux
  }
}

// ── onExpensePaid — inchangé sauf nextEntryNumber atomique ──────────────────────

/**
 * Écriture automatique lors du paiement d'une dépense.
 * Débit 6xxxxx (charge — compte défini sur la dépense ou catégorie), Crédit 521xxx (banque)
 */
export async function onExpensePaid(expenseId: string, tx: Tx): Promise<void> {
  try {
    const expense = await tx.expense.findUnique({
      where: { id: expenseId },
      include: { category: true },
    });
    if (!expense) return;

    const accountNumber = expense.accountingAccount ?? expense.category?.accountingAccount ?? '625000';
    const entryDate     = new Date(expense.expenseDate);
    const journal       = await getDefaultJournal(tx, JournalType.operations);
    const period        = await getOpenPeriod(tx, entryDate);
    const entryNumber   = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `DEP ${expense.number} — ${expense.title}`,
        sourceType:  'expense',
        sourceId:    expense.id,
        totalDebit:  Number(expense.amountTtc),
        totalCredit: Number(expense.amountTtc),
        status:      'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber,    label: expense.title,      debit: Number(expense.amountTtc), credit: 0 },
            { sortOrder: 1, accountNumber: '521000', label: `Paiement dépense`, debit: 0, credit: Number(expense.amountTtc) },
          ],
        },
      },
    });
  } catch {
    // Silencieux
  }
}
