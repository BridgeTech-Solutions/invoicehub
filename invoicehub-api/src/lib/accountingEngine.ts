import { JournalType, PrismaClient } from '@prisma/client';

// ── Observateur d'échec (Option B : non bloquant mais visible) ─────────────────
// Les écritures auto côté client/stock n'interrompent pas l'opération métier ;
// en cas d'échec, on prévient les responsables (in-app + email) au lieu de perdre
// l'information silencieusement. Le handler est branché au démarrage par
// AccountingNotifierService. Toute erreur DANS le handler est ignorée pour ne
// jamais casser le flux comptable.
export interface AccountingFailure {
  fn:          string;
  sourceType?: string;
  sourceId?:   string;
  error:       string;
}
type FailureHandler = (f: AccountingFailure) => void;
let _onFailure: FailureHandler | null = null;
export function setAccountingFailureHandler(h: FailureHandler | null): void {
  _onFailure = h;
}

const logErr = (fn: string, err: unknown, ctx?: { sourceType?: string; sourceId?: string }) => {
  const error = err instanceof Error ? err.message : String(err);
  console.error(`[accountingEngine.${fn}]`, error);
  try { _onFailure?.({ fn, error, sourceType: ctx?.sourceType, sourceId: ctx?.sourceId }); }
  catch { /* la notification ne doit jamais casser le flux */ }
};

// Abandon non-erreur : aucune écriture créée parce qu'une config comptable manque
// (paramètres entreprise absents, compte de stock non renseigné…). Ce n'est pas une
// exception, donc on prévient explicitement via le même canal pour ne rien laisser
// passer en silence.
const logSkip = (fn: string, reason: string, ctx?: { sourceType?: string; sourceId?: string }) => {
  console.warn(`[accountingEngine.${fn}] écriture ignorée : ${reason}`);
  try { _onFailure?.({ fn, error: reason, sourceType: ctx?.sourceType, sourceId: ctx?.sourceId }); }
  catch { /* la notification ne doit jamais casser le flux */ }
};

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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

// ── nextEntryNumber : numérotation séquentielle par (journal, année), atomique
// Un verrou transactionnel Postgres sérialise les appels concurrents sur la même
// clé (journal+année). Libéré automatiquement au commit/rollback de la
// transaction englobante → plus de collision de entry_number (contrainte @unique)
// qui ferait silencieusement échouer l'écriture sous charge concurrente.
async function nextEntryNumber(tx: Tx, journalCode: string, date: Date): Promise<string> {
  const year   = date.getFullYear();
  const prefix = `${journalCode}-${year}-`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`jentry:${journalCode}:${year}`}))`;

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

interface SalesBreakdownLine {
  netHt:    any;
  taxRate:  any;
  taxAmount: any;
  product?: {
    type?:                  string | null;
    salesAccountingAccount?: string | null;
    category?: {
      salesAccountingAccount?: string | null;
    } | null;
  } | null;
  taxRateCollectedAccount?: string | null;
}

function buildSalesBreakdown(
  lines:               SalesBreakdownLine[],
  defaultTaxAccount:   string,
  salesGoodsAccount:   string,
  salesServiceAccount: string,
): { salesLines: JournalLineData[]; taxLines: JournalLineData[] } {
  const salesMap = new Map<string, number>();
  const taxMap   = new Map<string, number>();
  // Libellé par compte, déduit du TYPE de produit (marchandise/service) et non du
  // numéro de compte → indépendant du plan comptable (OHADA, PCG, ou autre zone).
  const salesLabelMap = new Map<string, string>();

  for (const l of lines) {
    // Compte ventes : produit → catégorie → défaut entreprise selon le type
    const isGoods       = l.product?.type === 'product';
    const fallbackSales = isGoods ? salesGoodsAccount : salesServiceAccount;
    const salesAccount  = l.product?.salesAccountingAccount
      ?? l.product?.category?.salesAccountingAccount
      ?? fallbackSales;

    if (!salesLabelMap.has(salesAccount)) {
      salesLabelMap.set(salesAccount, isGoods ? 'Ventes de marchandises' : 'Prestations de services');
    }
    salesMap.set(salesAccount, (salesMap.get(salesAccount) ?? 0) + Number(l.netHt));

    const rate = Number(l.taxRate);
    if (rate > 0) {
      // Compte TVA : depuis le taux de TVA de la ligne, sinon compte global company settings
      const taxAccount = l.taxRateCollectedAccount ?? defaultTaxAccount;
      taxMap.set(taxAccount, (taxMap.get(taxAccount) ?? 0) + Number(l.taxAmount));
    }
  }

  const salesLines: JournalLineData[] = [];
  let sortOrder = 1;
  for (const [accountNumber, amount] of salesMap) {
    if (amount > 0) {
      const label = salesLabelMap.get(accountNumber) ?? 'Ventes';
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Mise au prorata d'une ventilation ventes/TVA vers un TTC cible ─────────────
// Les lignes d'une facture d'acompte (et la part déjà vendue d'un solde) sont
// stockées au montant PLEIN de la commande, alors que le document ne porte qu'une
// fraction. On ramène ventes + TVA au TTC réellement comptabilisé, et on corrige
// le résidu d'arrondi sur la plus grosse ligne de ventes (la TVA reste au ratio
// exact) pour que la somme des crédits égale précisément le TTC cible.
function scaleBreakdownTo(
  salesLines: JournalLineData[],
  taxLines:   JournalLineData[],
  targetTtc:  number,
): { salesLines: JournalLineData[]; taxLines: JournalLineData[] } {
  const fullTtc = [...salesLines, ...taxLines].reduce((s, l) => s + l.credit, 0);
  if (fullTtc <= 0) return { salesLines, taxLines };

  const ratio  = targetTtc / fullTtc;
  const sLines = salesLines.map(l => ({ ...l, credit: round2(l.credit * ratio) }));
  const tLines = taxLines.map(l   => ({ ...l, credit: round2(l.credit * ratio) }));

  const sum      = [...sLines, ...tLines].reduce((s, l) => s + l.credit, 0);
  const residual = round2(targetTtc - sum);
  if (residual !== 0) {
    const pool = sLines.length ? sLines : tLines;
    const idx  = pool.reduce((mi, l, i, arr) => (l.credit > arr[mi]!.credit ? i : mi), 0);
    pool[idx]!.credit = round2(pool[idx]!.credit + residual);
  }
  return { salesLines: sLines, taxLines: tLines };
}

// ── Montant de vente réellement comptabilisable pour une facture ───────────────
// - standard / avoir : le TTC plein de la facture (lignes inchangées).
// - acompte : seulement la part de l'acompte (invoice.totalTtc), lignes mises au
//   prorata — sinon l'écriture serait déséquilibrée (Dr partiel / Cr plein).
// - solde : le NET non encore vendu = TTC plein − Σ acomptes déjà ÉMIS (donc déjà
//   comptabilisés en vente). Évite de compter deux fois le chiffre d'affaires.
async function resolveBookableSale(
  invoice:    { type: string; totalTtc: any; parentInvoiceId: string | null },
  salesLines: JournalLineData[],
  taxLines:   JournalLineData[],
  tx:         Tx,
): Promise<{ saleTtc: number; salesLines: JournalLineData[]; taxLines: JournalLineData[] }> {
  if (invoice.type === 'acompte') {
    const target = round2(Number(invoice.totalTtc));
    const scaled = scaleBreakdownTo(salesLines, taxLines, target);
    return { saleTtc: target, ...scaled };
  }

  if (invoice.type === 'solde' && invoice.parentInvoiceId) {
    const booked = await sumIssuedAcomptes(invoice.parentInvoiceId, tx);
    const target = round2(Number(invoice.totalTtc) - booked);
    const scaled = scaleBreakdownTo(salesLines, taxLines, target);
    return { saleTtc: target, ...scaled };
  }

  // standard / avoir / autres : aucune mise au prorata
  return { saleTtc: round2(Number(invoice.totalTtc)), salesLines, taxLines };
}

// ── Somme des acomptes DÉJÀ ÉMIS d'un groupe (donc déjà comptabilisés) ─────────
// rootId = facture parente du cycle. Les acomptes ont soit id = rootId, soit
// parentInvoiceId = rootId (cf. soldePrefill). On exclut draft/cancelled : un
// acompte non émis n'a aucune écriture, un acompte annulé a été contre-passé.
async function sumIssuedAcomptes(rootId: string | null, tx: Tx): Promise<number> {
  if (!rootId) return 0;
  const acomptes = await tx.invoice.findMany({
    where: {
      type:      'acompte',
      deletedAt: null,
      status:    { notIn: ['draft', 'cancelled'] },
      OR:        [{ id: rootId }, { parentInvoiceId: rootId }],
    },
    select: { totalTtc: true },
  });
  return round2(acomptes.reduce((s, a) => s + Number(a.totalTtc), 0));
}

// ── Construction des lignes d'écriture d'émission d'une facture ────────────────
// Source unique de vérité partagée par l'émission ET l'annulation (qui inverse
// exactement ces lignes). Trois régimes :
//
//  • Option 4191 ACTIVÉE (use_advance_account) :
//      - acompte → AVANCE REÇUE : Dr 411 / Cr 4191 (TTC). Aucun produit ni TVA
//        reconnu : ils le seront à la livraison. (Variante TVA-sur-acompte à
//        valider avec l'expert avant activation — voir add_advance_account_4191.sql.)
//      - solde   → vente PLEINE (Dr 411 / Cr 70+443) + reprise de l'avance
//        (Dr 4191 / Cr 411) pour solder le 4191 et reconnaître le CA total.
//
//  • Option DÉSACTIVÉE (défaut) : vente immédiate au prorata
//      - acompte → la part de l'acompte ; solde → le net non encore vendu.
//
// Renvoie null quand il n'y a rien à comptabiliser (montant nul).
async function buildInvoiceIssuanceLines(
  invoice:        { number: string; type: string; totalTtc: any; parentInvoiceId: string | null; client?: { name?: string | null } | null },
  clientAccount:  string,
  advanceAccount: string,
  useAdvance:     boolean,
  breakdown:      { salesLines: JournalLineData[]; taxLines: JournalLineData[] },
  tx:             Tx,
): Promise<{ total: number; lines: JournalLineData[] } | null> {
  const clientName = invoice.client?.name ?? '';

  // ── Acompte + option 4191 : avance reçue (ni produit ni TVA reconnus) ──
  if (useAdvance && invoice.type === 'acompte') {
    const advanceTtc = round2(Number(invoice.totalTtc));
    if (advanceTtc <= 0.005) return null;
    return {
      total: advanceTtc,
      lines: [
        { sortOrder: 0, accountNumber: clientAccount,  label: `Client ${clientName}`,                          debit: advanceTtc, credit: 0 },
        { sortOrder: 1, accountNumber: advanceAccount, label: `Avance reçue — acompte FAC ${invoice.number}`, debit: 0, credit: advanceTtc },
      ],
    };
  }

  // ── Solde + option 4191 : vente pleine + reprise de l'avance ──
  if (useAdvance && invoice.type === 'solde') {
    const fullTtc = round2(Number(invoice.totalTtc));
    if (fullTtc <= 0.005) return null;
    const lines: JournalLineData[] = [
      { sortOrder: 0, accountNumber: clientAccount, label: `Client ${clientName}`, debit: fullTtc, credit: 0 },
      ...breakdown.salesLines,
      ...breakdown.taxLines,
    ];
    let total = fullTtc;
    const advance = await sumIssuedAcomptes(invoice.parentInvoiceId, tx);
    if (advance > 0.005) {
      const so = lines.length;
      lines.push(
        { sortOrder: so,     accountNumber: advanceAccount, label: `Reprise avance — FAC ${invoice.number}`,    debit: advance, credit: 0 },
        { sortOrder: so + 1, accountNumber: clientAccount,  label: `Imputation acompte — FAC ${invoice.number}`, debit: 0, credit: advance },
      );
      total = round2(fullTtc + advance);
    }
    return { total, lines };
  }

  // ── Cas général (option désactivée) : vente au prorata ──
  const { saleTtc, salesLines, taxLines } = await resolveBookableSale(invoice as any, breakdown.salesLines, breakdown.taxLines, tx);
  if (saleTtc <= 0.005) return null;
  return {
    total: saleTtc,
    lines: [
      { sortOrder: 0, accountNumber: clientAccount, label: `Client ${clientName}`, debit: saleTtc, credit: 0 },
      ...salesLines,
      ...taxLines,
    ],
  };
}

// ── Helper : comptes globaux depuis company_settings ───────────────────────────
// Toutes les valeurs viennent de company_settings (colonnes non-null avec défauts
// OHADA en base). Plus aucun numéro de compte codé en dur dans la logique.
async function getCompanyAccounts(tx: Tx) {
  const s = await tx.companySettings.findFirst({
    select: {
      collectedTaxAccount:        true,
      deductibleTaxAccount:       true,
      initialStockAccount:        true,
      escompteAccountingAccount:  true,
      defaultClientAccount:       true,
      defaultSupplierAccount:     true,
      defaultBankAccount:         true,
      defaultSalesGoodsAccount:   true,
      defaultSalesServiceAccount: true,
      defaultPurchaseAccount:     true,
      defaultExpenseAccount:      true,
      useAdvanceAccount:          true,
      advanceAccount:             true,
    },
  });
  // Pas de paramètres entreprise → pas d'imputation possible (les appelants
  // ignorent alors l'écriture plutôt que d'utiliser un compte codé en dur).
  if (!s) return null;
  return {
    collectedTaxAccount:        s.collectedTaxAccount,
    deductibleTaxAccount:       s.deductibleTaxAccount,
    initialStockAccount:        s.initialStockAccount,
    escompteAccountingAccount:  s.escompteAccountingAccount,
    defaultClientAccount:       s.defaultClientAccount,
    defaultSupplierAccount:     s.defaultSupplierAccount,
    defaultBankAccount:         s.defaultBankAccount,
    defaultSalesGoodsAccount:   s.defaultSalesGoodsAccount,
    defaultSalesServiceAccount: s.defaultSalesServiceAccount,
    defaultPurchaseAccount:     s.defaultPurchaseAccount,
    defaultExpenseAccount:      s.defaultExpenseAccount,
    useAdvanceAccount:          s.useAdvanceAccount,
    advanceAccount:             s.advanceAccount,
  };
}

// ── Étape 2.1 — onInvoiceIssued : compte client dynamique + TVA par taux ───────

/**
 * Écriture automatique lors de l'émission d'une facture client.
 * Débit 411xxx (client auxiliaire), Crédit 70xxxx (ventes) + 447200 (TVA collectée)
 */
export async function onInvoiceIssued(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const [invoice, accounts] = await Promise.all([
      tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          client: { select: { id: true, name: true, accountingAccount: true } },
          lines: {
            include: {
              product: {
                select: {
                  type: true,
                  salesAccountingAccount: true,
                  category: { select: { salesAccountingAccount: true } },
                },
              },
            },
          },
        },
      }),
      getCompanyAccounts(tx),
    ]);
    if (!invoice) return;
    if (!accounts) {
      logSkip('onInvoiceIssued', 'paramètres comptables entreprise non configurés', { sourceType: 'invoice', sourceId: invoiceId });
      return;
    }

    const clientAccount = (invoice.client as any)?.accountingAccount ?? accounts.defaultClientAccount;
    const linesWithTax  = (invoice.lines as any).map((l: any) => ({
      ...l,
      taxRateCollectedAccount: accounts.collectedTaxAccount,
    }));
    const breakdown = buildSalesBreakdown(
      linesWithTax, accounts.collectedTaxAccount,
      accounts.defaultSalesGoodsAccount, accounts.defaultSalesServiceAccount,
    );

    // Lignes d'écriture selon le régime (prorata par défaut ; avance 4191 si activé).
    // null → rien à comptabiliser (montant nul, solde couvert par les acomptes…).
    const built = await buildInvoiceIssuanceLines(
      invoice as any, clientAccount, accounts.advanceAccount, accounts.useAdvanceAccount, breakdown, tx,
    );
    if (!built) return;

    const entryDate   = new Date(invoice.issueDate ?? new Date());
    const journal     = await getDefaultJournal(tx, JournalType.sales);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FAC ${invoice.number} — ${invoice.client?.name ?? ''}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        totalDebit:  built.total,
        totalCredit: built.total,
        status:      'draft',
        lines: { create: built.lines },
      },
    });
  } catch (e) { logErr('onInvoiceIssued', e, { sourceType: 'invoice', sourceId: invoiceId }); }
}

// ── Étape 2.3 — onPaymentReceived : banque dynamique + compte client dynamique ──

/**
 * Écriture automatique lors d'un paiement client reçu.
 * Débit 521xxx (banque configurée), Crédit 411xxx (client auxiliaire)
 */
export async function onPaymentReceived(paymentId: string, tx: Tx): Promise<void> {
  try {
    const [payment, accounts] = await Promise.all([
      tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          invoice:     { include: { client: true } },
          bankAccount: true,
        },
      }),
      getCompanyAccounts(tx),
    ]);
    if (!payment) return;
    if (!accounts) {
      logSkip('onPaymentReceived', 'paramètres comptables entreprise non configurés', { sourceType: 'payment', sourceId: paymentId });
      return;
    }

    const bankAccountNum = (payment.bankAccount as any)?.accountingAccount ?? accounts.defaultBankAccount;
    const bankLabel      = (payment.bankAccount as any)?.name ?? 'Banque';
    const clientAccount  = (payment.invoice?.client as any)?.accountingAccount ?? accounts.defaultClientAccount;

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
          l => l.accountNumber === clientAccount && !l.letteringCode,
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
            e.lines.filter(l => l.accountNumber === clientAccount && !l.letteringCode),
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
    } catch (e) { console.error('[accountingEngine.onPaymentReceived.lettering]', e instanceof Error ? e.message : e); }
  } catch (e) { logErr('onPaymentReceived', e, { sourceType: 'payment', sourceId: paymentId }); }
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
  } catch (e) { logErr('onPaymentDeleted', e, { sourceType: 'payment_reversal', sourceId: paymentId }); }
}

// ── Étape 3.1 — onSupplierInvoiceValidated : fournisseur + compte achat dynamiques

/**
 * Écriture automatique lors de la validation d'une facture fournisseur.
 * Débit 60xxxx (achats) + 447100 (TVA déductible), Crédit 401xxx (fournisseur auxiliaire)
 */
export async function onSupplierInvoiceValidated(supplierInvoiceId: string, tx: Tx): Promise<void> {
  // NB : pas de try/catch silencieux ici — cette fonction est appelée DANS la
  // transaction de validation. Toute erreur doit remonter pour annuler la
  // validation : on n'autorise pas une FF validée sans écriture comptable.
  const [inv, accounts] = await Promise.all([
    tx.supplierInvoice.findUnique({
      where: { id: supplierInvoiceId },
      include: { supplier: true },
    }),
    getCompanyAccounts(tx),
  ]);
  if (!inv) throw new Error(`Facture fournisseur ${supplierInvoiceId} introuvable`);
  if (!accounts) throw new Error('Paramètres comptables entreprise introuvables — impossible de comptabiliser la FF');
  {

    const supplierAccount = (inv.supplier as any)?.accountingAccount ?? accounts.defaultSupplierAccount;
    if (!supplierAccount) {
      throw new Error(
        `Compte fournisseur introuvable pour la FF ${supplierInvoiceId} — ` +
        `vérifiez le compte comptable du fournisseur ou configurez defaultSupplierAccount dans les paramètres.`,
      );
    }
    const invAccount      = (inv as any).accountingAccount;
    const purchaseAccount = invAccount && invAccount !== supplierAccount ? invAccount : accounts.defaultPurchaseAccount;
    const taxAccount      = accounts.deductibleTaxAccount;

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
            { sortOrder: 0, accountNumber: purchaseAccount, label: `Achats — ${inv.supplierInvoiceNumber}`,      debit: Number(inv.totalHt),  credit: 0 },
            { sortOrder: 1, accountNumber: taxAccount,       label: `TVA déductible`,                            debit: Number(inv.totalTax), credit: 0 },
            { sortOrder: 2, accountNumber: supplierAccount,  label: `Fournisseur ${inv.supplier?.name ?? ''}`,   debit: 0, credit: Number(inv.totalTtc) },
          ],
        },
      },
    });
  }
}

// ── Étape 3.2 — onSupplierPaymentMade : banque + fournisseur dynamiques ──────────

/**
 * Écriture automatique lors d'un paiement fournisseur.
 * Débit 401xxx (fournisseur auxiliaire), Crédit 521xxx (banque configurée)
 */
export async function onSupplierPaymentMade(supplierPaymentId: string, tx: Tx): Promise<void> {
  // NB : appelée DANS la transaction de paiement → toute erreur doit remonter
  // pour annuler le paiement plutôt que de laisser une FF payée sans écriture.
  const [payment, accounts] = await Promise.all([
    tx.supplierPayment.findUnique({
      where: { id: supplierPaymentId },
      include: {
        supplier:    true,
        bankAccount: true,
      },
    }),
    getCompanyAccounts(tx),
  ]);
  if (!payment) throw new Error(`Paiement fournisseur ${supplierPaymentId} introuvable`);
  if (!accounts) throw new Error('Paramètres comptables entreprise introuvables — impossible de comptabiliser le paiement');
  {

    const supplierAccount = (payment.supplier as any)?.accountingAccount ?? accounts.defaultSupplierAccount;
    if (!supplierAccount) {
      // Fournisseur supprimé ou company_settings.defaultSupplierAccount absent :
      // on ne peut pas créer une écriture avec un compte null. On lève une erreur
      // explicite pour que le paiement soit refusé proprement plutôt que de
      // créer une écriture corrompue silencieusement.
      throw new Error(
        `Compte fournisseur introuvable pour le paiement ${payment.id} — ` +
        `vérifiez le compte comptable du fournisseur ou configurez defaultSupplierAccount dans les paramètres.`,
      );
    }
    const bankAccountNum  = (payment.bankAccount as any)?.accountingAccount ?? accounts.defaultBankAccount;
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
          l => l.accountNumber === supplierAccount && !l.letteringCode,
        );

        const payEntry = await tx.journalEntry.findFirst({
          where: { sourceType: 'supplier_payment', sourceId: payment.id },
          include: { lines: true },
        });
        const payLine = payEntry?.lines.find(
          l => l.accountNumber === supplierAccount && !l.letteringCode,
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
    } catch (e) { console.error('[accountingEngine.onSupplierPaymentMade.lettering]', e instanceof Error ? e.message : e); }
  }
}

// ── Extourne facture fournisseur contestée ───────────────────────────────────

/**
 * Contre-passation de l'écriture de FF quand une facture fournisseur déjà validée
 * (donc comptabilisée : Dr 60x/447100, Cr 401xxx) est contestée.
 * Inverse exactement les lignes de l'écriture d'origine (même style que
 * onPaymentDeleted) et marque l'écriture originale en 'cancelled' afin que la
 * dette fournisseur 401 ne reste pas inscrite.
 *
 * Appelée DANS la transaction de contestation → toute erreur remonte.
 */
export async function onSupplierInvoiceDisputed(supplierInvoiceId: string, tx: Tx): Promise<void> {
  const original = await tx.journalEntry.findFirst({
    where:   { sourceType: 'supplier_invoice', sourceId: supplierInvoiceId, status: { not: 'cancelled' } },
    include: { lines: true },
  });
  // Pas d'écriture d'origine (ex : FF jamais validée) → rien à extourner.
  if (!original) return;

  const entryDate   = new Date();
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
      label:       `Extourne — ${original.label}`,
      sourceType:  'supplier_invoice_reversal',
      sourceId:    supplierInvoiceId,
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
}

// ── Étape 4 — onInvoiceCancelled : contre-passation avoir ───────────────────────

/**
 * Contre-passation lors de l'annulation d'une facture et génération d'un avoir.
 * Annule exactement l'écriture d'émission (Journal OD ou Ventes).
 * Débit 70xxxx (Ventes), Débit 447200 (TVA), Crédit 411xxx (Client)
 */
export async function onInvoiceCancelled(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const [invoice, accounts] = await Promise.all([
      tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          client: { select: { id: true, name: true, accountingAccount: true } },
          lines: {
            include: {
              product: {
                select: {
                  type: true,
                  salesAccountingAccount: true,
                  category: { select: { salesAccountingAccount: true } },
                },
              },
            },
          },
        },
      }),
      getCompanyAccounts(tx),
    ]);
    if (!invoice) return;
    if (!accounts) {
      logSkip('onInvoiceCancelled', 'paramètres comptables entreprise non configurés', { sourceType: 'invoice_reversal', sourceId: invoiceId });
      return;
    }

    const clientAccount = (invoice.client as any)?.accountingAccount ?? accounts.defaultClientAccount;
    const linesWithTax  = (invoice.lines as any).map((l: any) => ({
      ...l,
      taxRateCollectedAccount: accounts.collectedTaxAccount,
    }));
    // Garde anti-double-contre-passation : si une extourne d'annulation a déjà été
    // passée pour cette facture (précédente annulation, ou extourne enregistrée sous
    // ce type), on n'en crée pas une seconde — sinon l'émission serait inversée deux
    // fois et le compte 411 client se déséquilibrerait.
    const existingReversal = await tx.journalEntry.findFirst({
      where: { sourceType: 'invoice_reversal', sourceId: invoiceId, status: { not: 'cancelled' } },
      select: { id: true },
    });
    if (existingReversal) return;

    const breakdown = buildSalesBreakdown(
      linesWithTax, accounts.collectedTaxAccount,
      accounts.defaultSalesGoodsAccount, accounts.defaultSalesServiceAccount,
    );

    // On reconstruit les lignes d'émission (même régime : prorata ou avance 4191)
    // puis on les inverse exactement → contre-passation fidèle quel que soit le type.
    const built = await buildInvoiceIssuanceLines(
      invoice as any, clientAccount, accounts.advanceAccount, accounts.useAdvanceAccount, breakdown, tx,
    );
    if (!built) return;

    const entryDate = new Date();
    let journal = await tx.accountingJournal.findFirst({ where: { type: JournalType.operations, isActive: true } });
    if (!journal) journal = await getDefaultJournal(tx, JournalType.sales);

    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    // Contre-passation = inversion exacte de l'écriture d'émission (débit ↔ crédit)
    const counterLines: JournalLineData[] = built.lines.map((l, i) => ({
      sortOrder:     i,
      accountNumber: l.accountNumber,
      label:         `Avoir — ${l.label}`,
      debit:         l.credit,
      credit:        l.debit,
    }));

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `AVOIR sur FAC ${invoice.number} — ${invoice.client?.name ?? ''}`,
        sourceType:  'invoice_reversal',
        sourceId:    invoice.id,
        totalDebit:  built.total,
        totalCredit: built.total,
        status:      'draft',
        lines: { create: counterLines },
      },
    });
  } catch (e) { logErr('onInvoiceCancelled', e, { sourceType: 'invoice_reversal', sourceId: invoiceId }); }
}

// ── onExpensePaid — inchangé sauf nextEntryNumber atomique ──────────────────────

/**
 * Écriture automatique lors du paiement d'une dépense.
 * Débit 6xxxxx (charge — compte défini sur la dépense ou catégorie), Crédit 521xxx (banque)
 */
export async function onExpensePaid(expenseId: string, tx: Tx): Promise<void> {
  try {
    const [expense, accounts] = await Promise.all([
      tx.expense.findUnique({
        where:   { id: expenseId },
        include: {
          category: { select: { id: true, accountingAccount: true } },
        },
      }),
      getCompanyAccounts(tx),
    ]);
    if (!expense) return;
    if (!accounts) {
      logSkip('onExpensePaid', 'paramètres comptables entreprise non configurés', { sourceType: 'expense', sourceId: expenseId });
      return;
    }

    // Compte bancaire réellement utilisé pour la dépense (et non l'id de la
    // dépense — bug corrigé) : sinon repli sur la banque par défaut.
    const bankAccountInfo = expense.bankAccountId
      ? await tx.bankAccount.findUnique({
          where:  { id: expense.bankAccountId },
          select: { accountingAccount: true, name: true },
        })
      : null;

    const chargeAccount = expense.accountingAccount ?? expense.category?.accountingAccount ?? accounts.defaultExpenseAccount;
    const bankAccount   = bankAccountInfo?.accountingAccount ?? accounts.defaultBankAccount;
    const bankLabel     = bankAccountInfo?.name ?? 'Banque';
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
            { sortOrder: 0, accountNumber: chargeAccount, label: expense.title,           debit: Number(expense.amountTtc), credit: 0 },
            { sortOrder: 1, accountNumber: bankAccount,   label: `Paiement — ${bankLabel}`, debit: 0, credit: Number(expense.amountTtc) },
          ],
        },
      },
    });
  } catch (e) { logErr('onExpensePaid', e, { sourceType: 'expense', sourceId: expenseId }); }
}

// ── onStockMovement — SYSCOHADA : écriture mouvements de stock ────────────────

/**
 * Écriture comptable automatique pour tout mouvement de stock.
 * Les comptes de stock (311xxx), de coût (6031xx) et de perte (6032xx)
 * sont lus dynamiquement depuis le produit ou la catégorie — jamais en dur.
 *
 * Correspondances SYSCOHADA :
 *   purchase_receipt  → Dr stockAccount / Cr supplierAccount (401xxx)
 *   initial_stock     → Dr stockAccount / Cr 108000 (Compte de l'exploitant)
 *   adjustment_in     → Dr stockAccount / Cr cogsAccount
 *   return_customer   → Dr stockAccount / Cr cogsAccount (annulation sortie)
 *   sale              → Dr cogsAccount  / Cr stockAccount
 *   adjustment_out    → Dr lossAccount  / Cr stockAccount
 *   write_off         → Dr lossAccount  / Cr stockAccount
 *   return_supplier   → Dr supplierAccount / Cr stockAccount
 */
export async function onStockMovement(params: {
  movementId:          string;
  productId:           string;
  productName:         string;
  movementType:        string;
  signedQty:           number;
  totalCostHt:         number;
  stockAccount:        string | null;
  cogsAccount:         string | null;
  lossAccount:         string | null;
  supplierAccount:     string | null;
  initialStockAccount: string | null;
  sourceLabel:         string | null;
}, tx: Tx): Promise<void> {
  try {
    if (params.totalCostHt <= 0) return;

    const {
      movementType, totalCostHt, stockAccount, cogsAccount,
      lossAccount, supplierAccount, initialStockAccount, productName, sourceLabel,
    } = params;

    const entryDate   = new Date();
    const journal     = await getDefaultJournal(tx, JournalType.operations);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);
    const label       = sourceLabel
      ? `Stock ${productName} — ${sourceLabel}`
      : `Mouvement stock — ${productName}`;

    let debitAccount: string | null;
    let creditAccount: string | null;

    switch (movementType) {
      case 'purchase_receipt':
        // SYSCOHADA inventaire permanent : l'entrée en stock a pour contrepartie
        // le compte de variation des stocks (603x), PAS le fournisseur (401).
        // La dette fournisseur est enregistrée séparément à la validation de la
        // facture fournisseur (Dr 601 / Cr 401). Créditer 401 ici doublerait la dette.
        debitAccount  = stockAccount;
        creditAccount = cogsAccount;
        break;
      case 'initial_stock':
        debitAccount  = stockAccount;
        creditAccount = initialStockAccount;
        break;
      case 'adjustment_in':
      case 'return_customer':
        debitAccount  = stockAccount;
        creditAccount = cogsAccount;
        break;
      case 'sale':
        debitAccount  = cogsAccount;
        creditAccount = stockAccount;
        break;
      case 'adjustment_out':
      case 'write_off':
        debitAccount  = lossAccount;
        creditAccount = stockAccount;
        break;
      case 'return_supplier':
        debitAccount  = supplierAccount;
        creditAccount = stockAccount;
        break;
      default:
        return; // transfer_in / transfer_out → pas d'écriture comptable simple
    }

    // Comptes non configurés → on enregistre le mouvement physique sans écriture
    // comptable (plutôt qu'une violation de clé étrangère), mais on prévient pour
    // que la DAF configure les comptes de stock du produit/catégorie.
    if (!debitAccount || !creditAccount) {
      logSkip(
        'onStockMovement',
        `compte de stock non configuré pour le mouvement « ${movementType} » du produit ${productName}`,
        { sourceType: 'stock_movement', sourceId: params.movementId },
      );
      return;
    }

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label,
        sourceType:  'stock_movement',
        sourceId:    params.movementId,
        totalDebit:  totalCostHt,
        totalCredit: totalCostHt,
        status:      'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber: debitAccount,  label, debit: totalCostHt, credit: 0 },
            { sortOrder: 1, accountNumber: creditAccount, label, debit: 0, credit: totalCostHt },
          ],
        },
      },
    });
  } catch (e) { logErr('onStockMovement', e, { sourceType: 'stock_movement', sourceId: params.movementId }); }
}

// ── onEscompteAccorde — escompte de règlement accordé (compte 673) ─────────────

/**
 * Écriture comptable lors de l'application d'un escompte de règlement.
 * SYSCOHADA : charge financière — pas de retraitement TVA.
 *
 * Dr 673000 Escomptes de règlement accordés
 * Cr 411xxx Client auxiliaire
 */
export async function onEscompteAccorde(params: {
  paymentId:     string;
  invoiceId:     string;
  clientAccount: string | null;
  escompteAmount: number;
  invoiceNumber:  string;
  clientName:     string;
  paymentDate:    Date;
}, tx: Tx): Promise<void> {
  try {
    const { paymentId, clientAccount, escompteAmount, invoiceNumber, clientName, paymentDate } = params;

    const [journal, period, accounts] = await Promise.all([
      getDefaultJournal(tx, JournalType.operations),
      getOpenPeriod(tx, paymentDate),
      getCompanyAccounts(tx),
    ]);
    if (!accounts) {
      logSkip('onEscompteAccorde', 'paramètres comptables entreprise non configurés', { sourceType: 'payment', sourceId: params.paymentId });
      return;
    }
    // Repli sur le compte client par défaut configuré (jamais de numéro en dur).
    const resolvedClientAccount = clientAccount ?? accounts.defaultClientAccount;
    const entryNumber = await nextEntryNumber(tx, journal.code, paymentDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate:      paymentDate,
        accountingDate: paymentDate,
        entryNumber,
        label:       `Escompte accordé FAC ${invoiceNumber} — ${clientName}`,
        sourceType:  'payment',
        sourceId:    paymentId,
        totalDebit:  escompteAmount,
        totalCredit: escompteAmount,
        status:      'draft',
        lines: {
          create: [
            {
              sortOrder:     0,
              accountNumber: accounts.escompteAccountingAccount,
              label:         `Escompte de règlement FAC ${invoiceNumber}`,
              debit:         escompteAmount,
              credit:        0,
            },
            {
              sortOrder:     1,
              accountNumber: resolvedClientAccount,
              label:         `Client ${clientName} — escompte FAC ${invoiceNumber}`,
              debit:         0,
              credit:        escompteAmount,
            },
          ],
        },
      },
    });
  } catch (e) { logErr('onEscompteAccorde', e, { sourceType: 'payment', sourceId: params.paymentId }); }
}

