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
  // Sélection DÉTERMINISTE : si plusieurs journaux actifs partagent le même type,
  // on prend celui marqué par défaut, sinon le plus petit code (ordre stable) —
  // jamais un findFirst dépendant de l'ordre physique des lignes.
  const j = await tx.accountingJournal.findFirst({
    where:   { type, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
  });
  if (!j) throw new Error(`Journal comptable "${type}" introuvable`);
  return j;
}

async function getOpenPeriod(tx: Tx, date: Date) {
  // Comparaison par DATE CALENDAIRE : startDate/endDate sont des @db.Date (minuit
  // UTC). Les hooks d'extourne construisent `new Date()` (avec heure) ; comparer tel
  // quel à endDate (minuit) échouait le DERNIER jour de la période (ex. le 31 à 14h :
  // endDate 31 00:00 < date 31 14:00) → « aucune période ouverte » → contre-passation
  // silencieusement omise. On tronque donc la date à minuit UTC avant de comparer.
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const p = await tx.fiscalPeriod.findFirst({
    where: { status: 'open', startDate: { lte: day }, endDate: { gte: day } },
  });
  if (!p) throw new Error(`Aucune période fiscale ouverte pour le ${date.toLocaleDateString('fr-FR')}`);

  // Verrou de ligne : empêche une clôture de période de s'intercaler entre cette
  // lecture et le commit de l'écriture. Une clôture UPDATE le statut de la période →
  // elle bloque sur ce verrou jusqu'à notre commit (et inversement). Après l'avoir
  // obtenu, on RE-VÉRIFIE que la période est toujours ouverte : si une clôture a
  // commité juste avant, on refuse l'écriture plutôt que de l'insérer dans une
  // période fermée.
  await tx.$executeRaw`SELECT id FROM fiscal_periods WHERE id = ${p.id}::uuid FOR UPDATE`;
  const fresh = await tx.fiscalPeriod.findUnique({ where: { id: p.id }, select: { status: true } });
  if (fresh?.status !== 'open') {
    throw new Error(`La période fiscale du ${date.toLocaleDateString('fr-FR')} a été clôturée entre-temps`);
  }
  return p;
}

// ── Étape 1 — nextLetteringCode : A → B → ... → Z → AA → AB ... (style colonnes Excel)
async function nextLetteringCode(tx: Tx, accountNumber: string): Promise<string> {
  // Verrou par compte : deux lettrages concurrents sur le même compte pourraient
  // lire le même « dernier code » et générer le même code de lettrage. Sérialisé ici.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lettering:${accountNumber}`}))`;
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
  // Année/bornes en UTC : entryDate est une date CALENDAIRE (@db.Date). En heure
  // locale, getFullYear()/new Date(year,…) décalent l'année et les bornes selon le
  // fuseau du serveur (ex. un 01/01 00:00 local vu la veille en UTC) → mauvaise
  // séquence en tout début/fin d'exercice. On raisonne donc en UTC de bout en bout.
  const year   = date.getUTCFullYear();
  const prefix = `${journalCode}-${year}-`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`jentry:${journalCode}:${year}`}))`;

  const last = await tx.journalEntry.findFirst({
    where: {
      journal:     { code: journalCode },
      // On borne au PRÉFIXE exact (JOURNAL-ANNÉE-) : sans ce filtre, une donnée
      // héritée mal préfixée dans le même journal (ex. import avec « JNL-… ») serait
      // lexicalement > au préfixe courant, ferait échouer le parseInt → reset à 1 →
      // collision d'entry_number. On ne compare donc que notre propre famille.
      entryNumber: { startsWith: prefix },
      entryDate:   { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) },
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

// ── Verrou consultatif par source métier ───────────────────────────────────────
// Sérialise les appels concurrents qui comptabilisent LA MÊME pièce (facture,
// paiement…). Sans lui, le garde d'idempotence `_dupe` (une simple lecture) est
// « check-then-act » : deux transactions concurrentes (retry, double-déclenchement,
// job rejoué) passent toutes deux le test « aucune écriture » et en créent deux —
// et il n'existe pas de contrainte unique (source_type, source_id) qui l'empêche
// (elle serait d'ailleurs erronée : un paiement porte légitimement plusieurs
// écritures « payment » — règlement + escompte + retenue). Le verrou est libéré au
// commit/rollback de la transaction englobante.
async function lockSource(tx: Tx, sourceType: string, sourceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`jentry-src:${sourceType}:${sourceId}`}))`;
}

// ── Création d'écriture avec garde d'équilibre ─────────────────────────────────
// Les écritures sont équilibrées par construction, mais on refuse de créer une
// écriture dont la somme des débits ≠ somme des crédits (au centime) : garde-fou
// de dernier recours contre un futur refactor du calcul qui introduirait un
// déséquilibre silencieux (non validable, faux bilan). Dans les hooks non
// bloquants, l'erreur est captée et notifiée ; dans les bloquants, elle annule
// l'opération — dans les deux cas, jamais d'écriture fausse en base.
async function createBalancedEntry(
  tx: Tx,
  args: { data: { lines?: { create?: JournalLineData[] } } & Record<string, any> },
) {
  const lines = args.data?.lines?.create ?? [];
  const sumD  = round2(lines.reduce((s, l) => s + Number(l.debit  || 0), 0));
  const sumC  = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  if (Math.abs(sumD - sumC) > 0.01) {
    throw new Error(
      `Écriture déséquilibrée (${args.data.sourceType ?? '?'}/${args.data.sourceId ?? '?'}) : ` +
      `débit ${sumD} ≠ crédit ${sumC}`,
    );
  }
  return (tx as any).journalEntry.create(args);
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
  opts?: { tvaOnCollection?: boolean; pendingTaxAccount?: string | null },
): { salesLines: JournalLineData[]; taxLines: JournalLineData[] } {
  const salesMap = new Map<string, number>();
  const taxMap   = new Map<string, number>();
  // Libellé par compte, déduit du TYPE de produit (marchandise/service) et non du
  // numéro de compte → indépendant du plan comptable (OHADA, PCG, ou autre zone).
  const salesLabelMap = new Map<string, string>();
  const taxLabelMap   = new Map<string, string>();

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
      // Régime "TVA sur encaissement" : la TVA des PRESTATIONS DE SERVICES n'est pas
      // encore exigible à l'émission → compte "en attente". Elle sera transférée vers
      // la TVA collectée à l'encaissement (onPaymentReceived). Les biens restent
      // exigibles immédiatement (régime des débits).
      const isPending  = !!opts?.tvaOnCollection && !isGoods && !!opts?.pendingTaxAccount;
      const taxAccount = isPending
        ? opts!.pendingTaxAccount!
        : (l.taxRateCollectedAccount ?? defaultTaxAccount);
      if (!taxLabelMap.has(taxAccount)) taxLabelMap.set(taxAccount, isPending ? 'TVA en attente (services)' : 'TVA collectée');
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
      const label = taxLabelMap.get(accountNumber) ?? 'TVA collectée';
      taxLines.push({ sortOrder: sortOrder++, accountNumber, label, debit: 0, credit: amount });
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
      pendingTvaAccount:          true,
      tvaOnCollection:            true,
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
      withholdingAccount:         true,
    },
  });
  // Pas de paramètres entreprise → pas d'imputation possible (les appelants
  // ignorent alors l'écriture plutôt que d'utiliser un compte codé en dur).
  if (!s) return null;
  return {
    collectedTaxAccount:        s.collectedTaxAccount,
    deductibleTaxAccount:       s.deductibleTaxAccount,
    pendingTvaAccount:          s.pendingTvaAccount,
    tvaOnCollection:            s.tvaOnCollection,
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
    withholdingAccount:         s.withholdingAccount,
  };
}

// ── Étape 2.1 — onInvoiceIssued : compte client dynamique + TVA par taux ───────

/**
 * Écriture automatique lors de l'émission d'une facture client.
 * Débit 411xxx (client auxiliaire), Crédit 70xxxx (ventes) + 447200 (TVA collectée)
 */
export async function onInvoiceIssued(invoiceId: string, tx: Tx): Promise<void> {
  try {
    // Verrou par source PUIS garde d'idempotence : atomique contre les appels concurrents.
    await lockSource(tx, 'invoice', invoiceId);
    const _dupe = await tx.journalEntry.findFirst({ where: { sourceType: 'invoice', sourceId: invoiceId, status: { not: 'cancelled' } }, select: { id: true } });
    if (_dupe) return;
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
      { tvaOnCollection: accounts.tvaOnCollection, pendingTaxAccount: accounts.pendingTvaAccount },
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

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FAC ${invoice.number} — ${invoice.client?.name ?? ''}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        entryKind:   'sale',
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
    // Verrou par source PUIS garde d'idempotence : atomique contre les appels concurrents.
    await lockSource(tx, 'payment', paymentId);
    const _dupe = await tx.journalEntry.findFirst({ where: { sourceType: 'payment', sourceId: paymentId, status: { not: 'cancelled' } }, select: { id: true } });
    if (_dupe) return;
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

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `Règlement FAC ${payment.invoice?.number ?? ''} — ${payment.invoice?.client?.name ?? ''}`,
        sourceType:  'payment',
        sourceId:    payment.id,
        entryKind:   'settlement',
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

    // TVA sur encaissement : rendre exigible la fraction de TVA services encaissée.
    if (accounts.tvaOnCollection && accounts.pendingTvaAccount && payment.invoice?.id) {
      try {
        await transferPendingTvaOnCollection(tx, {
          invoiceId:           payment.invoice.id,
          paymentId:           payment.id,
          paymentAmount:       Number(payment.amount),
          invoiceTtc:          Number(payment.invoice.totalTtc),
          invoiceNumber:       payment.invoice.number ?? '',
          pendingTvaAccount:   accounts.pendingTvaAccount,
          collectedTaxAccount: accounts.collectedTaxAccount,
          entryDate,
        });
      } catch (e) { console.error('[accountingEngine.onPaymentReceived.tvaCollection]', e instanceof Error ? e.message : e); }
    }

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

// ── TVA sur encaissement : transfert de la TVA en attente vers la TVA collectée ─
//
// Régime des encaissements (prestations de services) : à l'émission, la TVA des
// lignes de services est logée en 4438 « TVA en attente d'exigibilité » (voir
// buildSalesBreakdown). Elle ne devient exigible — donc déclarable — qu'au moment
// du règlement. À chaque paiement, on transfère la fraction encaissée :
//   Dr 4438 (TVA en attente) / Cr 4431 (TVA collectée)
// au prorata du montant réglé sur le TTC ; au solde, on transfère tout le reliquat
// pour absorber les résidus d'arrondi.
async function transferPendingTvaOnCollection(
  tx: Tx,
  args: {
    invoiceId: string; paymentId: string; paymentAmount: number; invoiceTtc: number;
    invoiceNumber: string; pendingTvaAccount: string; collectedTaxAccount: string;
    entryDate: Date;
  },
): Promise<void> {
  const { invoiceId, paymentId, paymentAmount, invoiceTtc, invoiceNumber,
          pendingTvaAccount, collectedTaxAccount, entryDate } = args;

  // Idempotence : une seule écriture d'exigibilité par paiement.
  const dupe = await tx.journalEntry.findFirst({
    where:  { sourceType: 'payment', sourceId: paymentId, entryKind: 'tva_collection', status: { not: 'cancelled' } },
    select: { id: true },
  });
  if (dupe) return;

  // TVA en attente initialement comptabilisée sur la facture (lignes 4438 au crédit).
  const saleEntries = await tx.journalEntry.findMany({
    where:   { sourceType: 'invoice', sourceId: invoiceId, status: { not: 'cancelled' } },
    include: { lines: true },
  });
  const pendingTvaTotal = round2(
    saleEntries
      .flatMap(e => e.lines)
      .filter(l => l.accountNumber === pendingTvaAccount)
      .reduce((s, l) => s + Number(l.credit), 0),
  );
  if (pendingTvaTotal <= 0) return; // aucune TVA services en attente sur cette facture

  // Fraction déjà rendue exigible par les règlements précédents de cette facture.
  const invoicePayments = await tx.payment.findMany({ where: { invoiceId, deletedAt: null }, select: { id: true } });
  const priorTransfers  = await tx.journalEntry.findMany({
    where: {
      sourceType: 'payment', sourceId: { in: invoicePayments.map(p => p.id) },
      entryKind:  'tva_collection', status: { not: 'cancelled' },
    },
    select: { totalCredit: true },
  });
  const alreadyTransferred = round2(priorTransfers.reduce((s, e) => s + Number(e.totalCredit), 0));
  const remaining          = round2(pendingTvaTotal - alreadyTransferred);
  if (remaining <= 0) return;

  // Facture soldée → on solde tout le reliquat ; sinon prorata montant réglé / TTC.
  const fresh        = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { balanceDue: true } });
  const isFullyPaid  = Number(fresh?.balanceDue ?? 1) <= 0;
  const prorata      = invoiceTtc > 0 ? round2(pendingTvaTotal * (paymentAmount / invoiceTtc)) : 0;
  const amount       = isFullyPaid ? remaining : Math.min(prorata, remaining);
  if (amount <= 0) return;

  const journal     = await getDefaultJournal(tx, JournalType.operations);
  const period      = await getOpenPeriod(tx, entryDate);
  const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

  await createBalancedEntry(tx, {
    data: {
      journalId:      journal.id,
      fiscalPeriodId: period.id,
      entryDate,
      accountingDate: entryDate,
      entryNumber,
      label:       `TVA exigible sur encaissement — FAC ${invoiceNumber}`,
      sourceType:  'payment',
      sourceId:    paymentId,
      entryKind:   'tva_collection',
      totalDebit:  amount,
      totalCredit: amount,
      status:      'draft',
      lines: {
        create: [
          { sortOrder: 0, accountNumber: pendingTvaAccount,   label: 'TVA en attente (services)', debit: amount, credit: 0 },
          { sortOrder: 1, accountNumber: collectedTaxAccount, label: 'TVA collectée',              debit: 0, credit: amount },
        ],
      },
    },
  });
}

// ── Extourne paiement client supprimé ────────────────────────────────────────

/**
 * Extourne de l'écriture de règlement quand un paiement est annulé (soft-delete).
 * Inverse les lignes : Débit 411xxx / Crédit 521xxx.
 * Marque l'écriture originale en 'cancelled'.
 */
export async function onPaymentDeleted(paymentId: string, tx: Tx): Promise<void> {
  try {
    // Un paiement peut avoir plusieurs écritures (règlement principal, escompte
    // accordé, retenue à la source) — toutes en sourceType 'payment'. On les
    // contre-passe TOUTES, sinon le compte 411 client resterait déséquilibré.
    const originals = await tx.journalEntry.findMany({
      where:   { sourceType: 'payment', sourceId: paymentId, status: { not: 'cancelled' } },
      include: { lines: true },
    });
    if (originals.length === 0) return;

    const journal = await getDefaultJournal(tx, JournalType.bank);

    for (const original of originals) {
      const entryDate   = new Date();
      const period      = await getOpenPeriod(tx, entryDate);
      const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

      await createBalancedEntry(tx, {
        data: {
          journalId:      journal.id,
          fiscalPeriodId: period.id,
          entryDate,
          accountingDate: entryDate,
          entryNumber,
          label:       `Extourne — ${original.label}`,
          sourceType:  'payment_reversal',
          sourceId:    paymentId,
          entryKind:   original.entryKind ?? undefined,
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
  // Verrou par source PUIS garde d'idempotence : atomique contre les appels concurrents.
  await lockSource(tx, 'supplier_invoice', supplierInvoiceId);
  const _dupe = await tx.journalEntry.findFirst({ where: { sourceType: 'supplier_invoice', sourceId: supplierInvoiceId, status: { not: 'cancelled' } }, select: { id: true } });
  if (_dupe) return;
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

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FF ${inv.supplierInvoiceNumber} — ${inv.supplier?.name ?? 'Fournisseur'}`,
        sourceType:  'supplier_invoice',
        sourceId:    inv.id,
        entryKind:   'purchase',
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
  // Verrou par source PUIS garde d'idempotence : atomique contre les appels concurrents.
  await lockSource(tx, 'supplier_payment', supplierPaymentId);
  const _dupe = await tx.journalEntry.findFirst({ where: { sourceType: 'supplier_payment', sourceId: supplierPaymentId, status: { not: 'cancelled' } }, select: { id: true } });
  if (_dupe) return;
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

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `Paiement fournisseur ${payment.supplier?.name ?? ''}`,
        sourceType:  'supplier_payment',
        sourceId:    payment.id,
        entryKind:   'settlement',
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

  await createBalancedEntry(tx, {
    data: {
      journalId:      journal.id,
      fiscalPeriodId: period.id,
      entryDate,
      accountingDate: entryDate,
      entryNumber,
      label:       `Extourne — ${original.label}`,
      sourceType:  'supplier_invoice_reversal',
      sourceId:    supplierInvoiceId,
      entryKind:   'reversal',
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
    await lockSource(tx, 'invoice_reversal', invoiceId);

    // Garde anti-double-contre-passation : une seule extourne active par facture.
    const existingReversal = await tx.journalEntry.findFirst({
      where:  { sourceType: 'invoice_reversal', sourceId: invoiceId, status: { not: 'cancelled' } },
      select: { id: true },
    });
    if (existingReversal) return;

    // On INVERSE l'écriture d'émission STOCKÉE (source de vérité), au lieu de la
    // reconstruire depuis la facture. Reconstruire exposait à un décalage si un
    // compte de vente produit ou un paramètre société avait changé depuis l'émission
    // → l'avoir n'annulait plus exactement l'originale (comptes 70x/443 non soldés).
    // On s'aligne ainsi sur onPaymentDeleted / onSupplierInvoiceDisputed.
    const original = await tx.journalEntry.findFirst({
      where:   { sourceType: 'invoice', sourceId: invoiceId, status: { not: 'cancelled' } },
      include: { lines: true },
    });
    if (!original) return; // facture jamais émise / sans écriture → rien à contre-passer

    const invoice = await tx.invoice.findUnique({
      where:  { id: invoiceId },
      select: { number: true, client: { select: { name: true } } },
    });

    const entryDate = new Date();
    let journal = await tx.accountingJournal.findFirst({ where: { type: JournalType.operations, isActive: true }, orderBy: [{ isDefault: 'desc' }, { code: 'asc' }] });
    if (!journal) journal = await getDefaultJournal(tx, JournalType.sales);

    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    // Contre-passation = inversion exacte des lignes de l'écriture d'émission.
    const counterLines: JournalLineData[] = original.lines.map((l, i) => ({
      sortOrder:     i,
      accountNumber: l.accountNumber,
      label:         `Avoir — ${l.label}`,
      debit:         Number(l.credit),
      credit:        Number(l.debit),
    }));

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `AVOIR sur FAC ${invoice?.number ?? ''} — ${invoice?.client?.name ?? ''}`,
        sourceType:  'invoice_reversal',
        sourceId:    invoiceId,
        entryKind:   'reversal',
        totalDebit:  Number(original.totalCredit),
        totalCredit: Number(original.totalDebit),
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
    // Verrou par source PUIS garde d'idempotence : atomique contre les appels concurrents.
    await lockSource(tx, 'expense', expenseId);
    const _dupe = await tx.journalEntry.findFirst({ where: { sourceType: 'expense', sourceId: expenseId, status: { not: 'cancelled' } }, select: { id: true } });
    if (_dupe) return;
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

    const amountTtc = round2(Number(expense.amountTtc));
    const amountHt  = round2(Number(expense.amountHt));
    const taxAmount = round2(Number(expense.taxAmount));

    // SYSCOHADA : la TVA déductible ne doit pas être noyée dans la charge (classe 6).
    // Quand la dépense porte une TVA récupérable (taxAmount > 0) et qu'un compte de
    // TVA déductible est configuré, on l'isole sur son compte 445x — exactement comme
    // pour les factures fournisseurs (onSupplierInvoiceValidated). Sinon la charge
    // serait surévaluée et le crédit de TVA perdu. À défaut de compte TVA configuré,
    // repli sur l'imputation du TTC en charge (comportement historique).
    const splitVat = taxAmount > 0.005 && !!accounts.deductibleTaxAccount;
    // Réconciliation de l'arrondi : on impute le HT comme (TTC − TVA) et non le HT
    // stocké, pour que débit = crédit AU CENTIME (sinon round2(HT)+round2(TVA) peut
    // valoir round2(TTC) ± 0,01 → lignes déséquilibrées → écriture non validable).
    const chargeHt = round2(amountTtc - taxAmount);
    const lines: JournalLineData[] = splitVat
      ? [
          { sortOrder: 0, accountNumber: chargeAccount,                  label: expense.title,                          debit: chargeHt,  credit: 0 },
          { sortOrder: 1, accountNumber: accounts.deductibleTaxAccount!, label: `TVA déductible — DEP ${expense.number}`, debit: taxAmount, credit: 0 },
          { sortOrder: 2, accountNumber: bankAccount,                    label: `Paiement — ${bankLabel}`,              debit: 0, credit: amountTtc },
        ]
      : [
          { sortOrder: 0, accountNumber: chargeAccount, label: expense.title,             debit: amountTtc, credit: 0 },
          { sortOrder: 1, accountNumber: bankAccount,   label: `Paiement — ${bankLabel}`, debit: 0, credit: amountTtc },
        ];

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `DEP ${expense.number} — ${expense.title}`,
        sourceType:  'expense',
        sourceId:    expense.id,
        entryKind:   'expense',
        totalDebit:  amountTtc,
        totalCredit: amountTtc,
        status:      'draft',
        lines: { create: lines },
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

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label,
        sourceType:  'stock_movement',
        sourceId:    params.movementId,
        entryKind:   'stock',
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
    // Idempotence (verrou + garde) : l'escompte partage sourceType='payment'/sourceId
    // avec le règlement, on l'identifie donc par son compte 673x pour ne pas le
    // recréer sur un retour arrière/retry (on ne change PAS le sourceType, sinon
    // onPaymentDeleted ne l'extournerait plus).
    await lockSource(tx, 'payment', paymentId);
    const _dupe = await tx.journalEntry.findFirst({
      where: {
        sourceType: 'payment', sourceId: paymentId, status: { not: 'cancelled' },
        lines: { some: { accountNumber: accounts.escompteAccountingAccount } },
      },
      select: { id: true },
    });
    if (_dupe) return;
    // Repli sur le compte client par défaut configuré (jamais de numéro en dur).
    const resolvedClientAccount = clientAccount ?? accounts.defaultClientAccount;
    const entryNumber = await nextEntryNumber(tx, journal.code, paymentDate);

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate:      paymentDate,
        accountingDate: paymentDate,
        entryNumber,
        label:       `Escompte accordé FAC ${invoiceNumber} — ${clientName}`,
        sourceType:  'payment',
        sourceId:    paymentId,
        entryKind:   'discount',
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

// ── onRetenueSource — retenue à la source subie (acompte IR / précompte 2,2 %) ──

/**
 * Écriture comptable lors d'une retenue à la source prélevée par le client
 * (acompte IR / précompte). Le client verse le net et reverse la retenue à
 * l'État pour le compte de l'entreprise → c'est une créance d'impôt récupérable,
 * pas une charge ni un impayé.
 *
 * Dr 4492 (État, avances et acomptes versés sur impôts — configurable)
 * Cr 411xxx Client auxiliaire
 */
export async function onRetenueSource(params: {
  paymentId:         string;
  clientAccount:     string | null;
  withholdingAmount: number;
  invoiceNumber:     string;
  clientName:        string;
  paymentDate:       Date;
}, tx: Tx): Promise<void> {
  try {
    const { paymentId, clientAccount, withholdingAmount, invoiceNumber, clientName, paymentDate } = params;
    if (withholdingAmount <= 0.005) return;

    const [journal, period, accounts] = await Promise.all([
      getDefaultJournal(tx, JournalType.operations),
      getOpenPeriod(tx, paymentDate),
      getCompanyAccounts(tx),
    ]);
    if (!accounts) {
      logSkip('onRetenueSource', 'paramètres comptables entreprise non configurés', { sourceType: 'payment', sourceId: paymentId });
      return;
    }
    // Repli sur les comptes par défaut configurés (jamais de numéro en dur).
    const resolvedClientAccount = clientAccount ?? accounts.defaultClientAccount;
    const withholdingAccount    = accounts.withholdingAccount;
    // Idempotence (verrou + garde) : identifiée par le compte de retenue (4492) car
    // elle partage sourceType='payment'/sourceId avec le règlement.
    await lockSource(tx, 'payment', paymentId);
    const _dupe = await tx.journalEntry.findFirst({
      where: {
        sourceType: 'payment', sourceId: paymentId, status: { not: 'cancelled' },
        lines: { some: { accountNumber: withholdingAccount } },
      },
      select: { id: true },
    });
    if (_dupe) return;
    const entryNumber = await nextEntryNumber(tx, journal.code, paymentDate);

    await createBalancedEntry(tx, {
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate:      paymentDate,
        accountingDate: paymentDate,
        entryNumber,
        label:       `Retenue à la source FAC ${invoiceNumber} — ${clientName}`,
        sourceType:  'payment',
        sourceId:    paymentId,
        entryKind:   'withholding',
        totalDebit:  withholdingAmount,
        totalCredit: withholdingAmount,
        status:      'draft',
        lines: {
          create: [
            {
              sortOrder:     0,
              accountNumber: withholdingAccount,
              label:         `Retenue à la source (acompte IR) FAC ${invoiceNumber}`,
              debit:         withholdingAmount,
              credit:        0,
            },
            {
              sortOrder:     1,
              accountNumber: resolvedClientAccount,
              label:         `Client ${clientName} — retenue FAC ${invoiceNumber}`,
              debit:         0,
              credit:        withholdingAmount,
            },
          ],
        },
      },
    });
  } catch (e) { logErr('onRetenueSource', e, { sourceType: 'payment', sourceId: params.paymentId }); }
}

