/**
 * @module lib/syscohada-statements
 * Bilan & Compte de résultat SYSCOHADA révisé (Système Normal) calculés depuis la
 * balance (soldes par compte).
 *
 * Convention : `balances` = Map<numéroCompte, solde> avec solde = débit − crédit
 * (positif = solde débiteur). Rapprochement des comptes par PRÉFIXE.
 *
 * ⚠️ Comptes BIFONCTIONNELS (tiers classe 4, banques 52…) : on ne somme PAS le
 * préfixe des deux côtés (ça déséquilibre le bilan). Chaque compte est classé
 * selon le signe de SON solde : débiteur → Actif, créditeur → Passif.
 *
 * ⚠️ Conformité : structure conforme au modèle SN. Les CODES de postes
 * (AD, BI, DJ…) doivent être validés contre le formulaire DSF officiel de la
 * DGI Cameroun par un expert-comptable. Tout est centralisé ici.
 */

export type AccountBalances = Map<string, number>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function startsWithAny(account: string, prefixes: string[]): boolean {
  return prefixes.some((p) => account.startsWith(p));
}

/** Somme des soldes (débit − crédit) des comptes commençant par l'un des préfixes. */
function netSum(b: AccountBalances, prefixes: string[]): number {
  let total = 0;
  for (const [account, bal] of b) {
    if (startsWithAny(account, prefixes)) total += bal;
  }
  return total;
}

const debitAmount  = (b: AccountBalances, p: string[]): number => netSum(b, p);
const creditAmount = (b: AccountBalances, p: string[]): number => -netSum(b, p);

/**
 * Classe les comptes bifonctionnels par le SIGNE de leur solde individuel :
 * `debit` = total des comptes à solde débiteur (→ Actif),
 * `credit` = total des comptes à solde créditeur (→ Passif).
 * `exclude` permet d'isoler certains sous-comptes (ex. écarts de conversion).
 */
function splitBySign(
  b: AccountBalances,
  prefixes: string[],
  exclude: string[] = [],
): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const [account, bal] of b) {
    if (!startsWithAny(account, prefixes)) continue;
    if (exclude.length && startsWithAny(account, exclude)) continue;
    if (bal > 0) debit += bal;
    else if (bal < 0) credit += -bal;
  }
  return { debit, credit };
}

// ── BILAN — postes MONOFONCTIONNELS ────────────────────────────────────────────
// (immobilisations, stocks : valeur brute débitrice, amortissements créditeurs)

interface ActifMonoDef { code: string; label: string; brut: string[]; amort?: string[]; }

const ACTIF_IMMOBILISE: ActifMonoDef[] = [
  { code: 'AX', label: 'Charges immobilisées',                   brut: ['20'],             amort: ['280'] },
  { code: 'AD', label: 'Immobilisations incorporelles',          brut: ['21'],             amort: ['281', '291'] },
  { code: 'AF', label: 'Immobilisations corporelles',            brut: ['22', '23', '24'], amort: ['282', '283', '284', '292', '293', '294', '295'] },
  { code: 'AG', label: 'Avances & acomptes sur immobilisations', brut: ['25'] },
  { code: 'AH', label: 'Immobilisations financières',            brut: ['26', '27'],       amort: ['296', '297'] },
];

const ACTIF_STOCKS: ActifMonoDef = {
  code: 'BA', label: 'Stocks et en-cours',
  brut: ['31', '32', '33', '34', '35', '36', '37', '38'], amort: ['39'],
};

// Capitaux propres & dettes financières (monofonctionnels, soldes créditeurs)
interface PassifMonoDef { code: string; label: string; accounts: string[]; }

const PASSIF_CAPITAUX: PassifMonoDef[] = [
  { code: 'CA', label: 'Capital',                            accounts: ['101', '102', '103', '104'] },
  { code: 'CD', label: 'Primes & écarts de réévaluation',   accounts: ['105', '106'] },
  { code: 'CF', label: 'Réserves',                          accounts: ['11'] },
  { code: 'CG', label: 'Report à nouveau',                  accounts: ['12'] },   // bifonctionnel : créditeur=bénéfice, débiteur=perte
  // CH = Résultat net (injecté dynamiquement)
  { code: 'CL', label: "Subventions d'investissement",      accounts: ['14'] },
  { code: 'CM', label: 'Provisions réglementées',           accounts: ['15'] },
];

const PASSIF_DETTES_FIN: PassifMonoDef[] = [
  { code: 'DA', label: 'Emprunts & dettes financières',          accounts: ['16', '17', '18'] },
  { code: 'DB', label: 'Provisions pour risques & charges',      accounts: ['19'] },
];

// ── Masses du bilan (regroupements normalisés + codes de sous-total) ────────────

interface MasseDef { key: string; code: string; label: string; }

const ACTIF_MASSES: MasseDef[] = [
  { key: 'immobilise', code: 'AZ', label: 'ACTIF IMMOBILISÉ' },
  { key: 'circulant',  code: 'BK', label: 'ACTIF CIRCULANT' },
  { key: 'tresorerie', code: 'BT', label: 'TRÉSORERIE-ACTIF' },
  { key: 'ecart',      code: 'BU', label: 'ÉCART DE CONVERSION-ACTIF' },
];
const PASSIF_MASSES: MasseDef[] = [
  { key: 'cp',    code: 'CP', label: 'CAPITAUX PROPRES' },
  { key: 'dd',    code: 'DD', label: 'DETTES FINANCIÈRES' },
  { key: 'dp',    code: 'DP', label: 'PASSIF CIRCULANT' },
  { key: 'dt',    code: 'DT', label: 'TRÉSORERIE-PASSIF' },
  { key: 'ecart', code: 'BX', label: 'ÉCART DE CONVERSION-PASSIF' },
];

// ── Types de sortie ────────────────────────────────────────────────────────────

/** Détail d'un compte contribuant à une ligne de poste (vue « bilan détaillé »). */
export interface BilanLineAccount { accountNumber: string; label: string; amount: number; }

export interface BilanActifLine  { code: string; label: string; brut: number; amortissements: number; net: number; netN1: number; accounts?: BilanLineAccount[]; }
export interface BilanPassifLine { code: string; label: string; net: number; netN1: number; accounts?: BilanLineAccount[]; }

export interface BilanActifMasse {
  code: string; label: string; lines: BilanActifLine[];
  totalBrut: number; totalAmort: number; totalNet: number; totalNetN1: number;
}
export interface BilanPassifMasse {
  code: string; label: string; lines: BilanPassifLine[];
  totalNet: number; totalNetN1: number;
}

export interface Bilan {
  actifMasses:  BilanActifMasse[];
  passifMasses: BilanPassifMasse[];
  totalActif: number;   totalActifN1: number;
  totalPassif: number;  totalPassifN1: number;
  resultatNet: number;
  equilibre: boolean;
  ecart: number;
  /** Comptes classes 1-5 non rattachés à un poste (doit être 0) — diagnostic. */
  comptesNonVentiles: number;
}

/** Résultat net de l'exercice = produits (cl. 7 + HAO) − charges (cl. 6 + HAO + impôt). */
export function computeResultatNet(b: AccountBalances): number {
  const produits = creditAmount(b, ['7', '82', '84', '86', '88']);
  const charges  = debitAmount(b, ['6', '81', '83', '85', '87', '89']);
  return produits - charges;
}

// Lignes d'actif (à plat, étiquetées par masse) pour un jeu de soldes donné.
interface ActifRaw { masse: string; code: string; label: string; brut: number; amortissements: number; net: number; }
function actifLinesFor(b: AccountBalances): ActifRaw[] {
  const out: ActifRaw[] = [];
  const cna = debitAmount(b, ['109']);
  out.push({ masse: 'immobilise', code: 'AA', label: 'Capital souscrit non appelé', brut: cna, amortissements: 0, net: cna });
  for (const p of ACTIF_IMMOBILISE) {
    const brut = debitAmount(b, p.brut);
    const amort = p.amort ? creditAmount(b, p.amort) : 0;
    out.push({ masse: 'immobilise', code: p.code, label: p.label, brut, amortissements: amort, net: brut - amort });
  }
  // Stocks → actif circulant
  {
    const brut = debitAmount(b, ACTIF_STOCKS.brut);
    const amort = ACTIF_STOCKS.amort ? creditAmount(b, ACTIF_STOCKS.amort) : 0;
    out.push({ masse: 'circulant', code: ACTIF_STOCKS.code, label: ACTIF_STOCKS.label, brut, amortissements: amort, net: brut - amort });
  }
  const clients = splitBySign(b, ['41']);
  const fourn   = splitBySign(b, ['40']);
  const fisc    = splitBySign(b, ['42', '43', '44'], ['478', '479']);
  const autres  = splitBySign(b, ['45', '46', '47'], ['476', '477', '478', '479']);
  const hao     = splitBySign(b, ['48']);
  const deprecClients  = creditAmount(b, ['491']);
  const deprecAutres   = creditAmount(b, ['492', '493', '494', '495', '496', '497']);
  const chargesCAvance = debitAmount(b, ['476']);
  // Ordre liasse : actif circulant HAO avant exploitation
  out.push({ masse: 'circulant', code: 'BG', label: 'Créances HAO', brut: hao.debit, amortissements: 0, net: hao.debit });
  out.push({ masse: 'circulant', code: 'BH', label: 'Fournisseurs, avances versées', brut: fourn.debit, amortissements: 0, net: fourn.debit });
  out.push({ masse: 'circulant', code: 'BI', label: 'Clients', brut: clients.debit, amortissements: deprecClients, net: clients.debit - deprecClients });
  const acb = fisc.debit + autres.debit;
  out.push({ masse: 'circulant', code: 'BJ', label: 'Autres créances', brut: acb, amortissements: deprecAutres, net: acb - deprecAutres });
  out.push({ masse: 'circulant', code: 'BR', label: "Charges constatées d'avance", brut: chargesCAvance, amortissements: 0, net: chargesCAvance });
  const treso = splitBySign(b, ['50', '51', '52', '53', '54', '55', '57', '58'], ['590', '591', '592', '593', '594']);
  const deprecTreso = creditAmount(b, ['59']);
  out.push({ masse: 'tresorerie', code: 'BS', label: 'Trésorerie-Actif (banques, caisse)', brut: treso.debit, amortissements: deprecTreso, net: treso.debit - deprecTreso });
  const ecA = debitAmount(b, ['478']);
  out.push({ masse: 'ecart', code: 'BU', label: 'Écart de conversion-Actif', brut: ecA, amortissements: 0, net: ecA });
  return out;
}

interface PassifRaw { masse: string; code: string; label: string; net: number; }
function passifLinesFor(b: AccountBalances): PassifRaw[] {
  const out: PassifRaw[] = [];
  for (const p of PASSIF_CAPITAUX) out.push({ masse: 'cp', code: p.code, label: p.label, net: creditAmount(b, p.accounts) });
  out.push({ masse: 'cp', code: 'CH', label: "Résultat net de l'exercice", net: computeResultatNet(b) });
  for (const p of PASSIF_DETTES_FIN) out.push({ masse: 'dd', code: p.code, label: p.label, net: creditAmount(b, p.accounts) });
  const clients = splitBySign(b, ['41']);
  const fourn   = splitBySign(b, ['40']);
  const fisc    = splitBySign(b, ['42', '43', '44'], ['478', '479']);
  const autres  = splitBySign(b, ['45', '46', '47'], ['476', '477', '478', '479']);
  const hao     = splitBySign(b, ['48']);
  out.push({ masse: 'dp', code: 'DG', label: 'Dettes circulantes HAO', net: hao.credit });
  out.push({ masse: 'dp', code: 'DI', label: "Fournisseurs d'exploitation", net: fourn.credit });
  out.push({ masse: 'dp', code: 'DH', label: 'Clients, avances reçues', net: clients.credit });
  out.push({ masse: 'dp', code: 'DJ', label: 'Dettes fiscales & sociales', net: fisc.credit });
  out.push({ masse: 'dp', code: 'DM', label: 'Autres dettes', net: autres.credit });
  out.push({ masse: 'dp', code: 'DV', label: "Produits constatés d'avance", net: creditAmount(b, ['477']) });
  const treso = splitBySign(b, ['50', '51', '52', '53', '54', '55', '57', '58'], ['590', '591', '592', '593', '594']);
  const creditsTreso = creditAmount(b, ['561', '564', '565', '566']);
  out.push({ masse: 'dt', code: 'DR', label: 'Banques, découverts & crédits de trésorerie', net: treso.credit + creditsTreso });
  out.push({ masse: 'ecart', code: 'BX', label: 'Écart de conversion-Passif', net: creditAmount(b, ['479']) });
  return out;
}

/**
 * Bilan SYSCOHADA SN regroupé par grandes masses (sous-totaux codés AZ/BK/BT/BZ,
 * CP/DD/DP/DT/DZ) et colonne N-1 si `bN1` (soldes de l'exercice précédent) fourni.
 */
export function computeBilan(b: AccountBalances, bN1?: AccountBalances): Bilan {
  const actifAll  = actifLinesFor(b);
  const passifAll = passifLinesFor(b);
  const aN1 = new Map((bN1 ? actifLinesFor(bN1)  : []).map((l) => [l.code, l.net]));
  const pN1 = new Map((bN1 ? passifLinesFor(bN1) : []).map((l) => [l.code, l.net]));

  const actifMasses: BilanActifMasse[] = ACTIF_MASSES.map((m) => {
    const lines: BilanActifLine[] = actifAll.filter((l) => l.masse === m.key).map((l) => ({
      code: l.code, label: l.label, brut: l.brut, amortissements: l.amortissements, net: l.net, netN1: aN1.get(l.code) ?? 0,
    }));
    return {
      code: m.code, label: m.label, lines,
      totalBrut:  lines.reduce((s, l) => s + l.brut, 0),
      totalAmort: lines.reduce((s, l) => s + l.amortissements, 0),
      totalNet:   lines.reduce((s, l) => s + l.net, 0),
      totalNetN1: lines.reduce((s, l) => s + l.netN1, 0),
    };
  }).filter((m) => m.lines.length > 0);

  const passifMasses: BilanPassifMasse[] = PASSIF_MASSES.map((m) => {
    const lines: BilanPassifLine[] = passifAll.filter((l) => l.masse === m.key).map((l) => ({
      code: l.code, label: l.label, net: l.net, netN1: pN1.get(l.code) ?? 0,
    }));
    return {
      code: m.code, label: m.label, lines,
      totalNet:   lines.reduce((s, l) => s + l.net, 0),
      totalNetN1: lines.reduce((s, l) => s + l.netN1, 0),
    };
  }).filter((m) => m.lines.length > 0);

  const totalActif    = actifMasses.reduce((s, m) => s + m.totalNet, 0);
  const totalActifN1  = actifMasses.reduce((s, m) => s + m.totalNetN1, 0);
  const totalPassif   = passifMasses.reduce((s, m) => s + m.totalNet, 0);
  const totalPassifN1 = passifMasses.reduce((s, m) => s + m.totalNetN1, 0);
  const resultatNet   = computeResultatNet(b);
  const ecart = totalActif - totalPassif;

  // Contrôle de complétude : net réel des classes 1-5 = net ventilé dans les postes.
  const ventileNet = totalActif - (totalPassif - resultatNet);
  const comptesNonVentiles = netSum(b, ['1', '2', '3', '4', '5']) - ventileNet;

  return {
    actifMasses, passifMasses,
    totalActif, totalActifN1, totalPassif, totalPassifN1,
    resultatNet, equilibre: Math.abs(ecart) < 1, ecart, comptesNonVentiles,
  };
}

// ── Détail par compte des lignes du bilan (Phase 1 — visibilité poste→comptes) ──
// Source unique « code de poste → comptes ». Sert aussi de base au futur modèle
// éditable (Phase 2). Modes d'agrégation, choisis pour que Σ(comptes) = net du poste :
//   raw    = solde brut (débit−crédit) ; pour mono actif (brut+amort) et écarts
//   neg    = −solde ; pour postes monofonctionnels créditeurs (capitaux, dettes…)
//   debit  = solde si débiteur (comptes bifonctionnels, côté Actif)
//   credit = −solde si créditeur (comptes bifonctionnels, côté Passif)
type SrcMode = 'raw' | 'neg' | 'debit' | 'credit';
interface SrcPart { prefixes: string[]; mode: SrcMode; exclude?: string[]; }

const TRESO_PREFIXES = ['50', '51', '52', '53', '54', '55', '57', '58'];
const TRESO_EXCLUDE  = ['590', '591', '592', '593', '594'];

const BILAN_LINE_SOURCES: Record<string, SrcPart[]> = {
  // ── ACTIF ──
  AA: [{ prefixes: ['109'], mode: 'raw' }],
  AX: [{ prefixes: ['20', '280'], mode: 'raw' }],
  AD: [{ prefixes: ['21', '281', '291'], mode: 'raw' }],
  AF: [{ prefixes: ['22', '23', '24', '282', '283', '284', '292', '293', '294', '295'], mode: 'raw' }],
  AG: [{ prefixes: ['25'], mode: 'raw' }],
  AH: [{ prefixes: ['26', '27', '296', '297'], mode: 'raw' }],
  BA: [{ prefixes: ['31', '32', '33', '34', '35', '36', '37', '38', '39'], mode: 'raw' }],
  BG: [{ prefixes: ['48'], mode: 'debit' }],
  BH: [{ prefixes: ['40'], mode: 'debit' }],
  BI: [{ prefixes: ['41'], mode: 'debit' }, { prefixes: ['491'], mode: 'raw' }],
  BJ: [
    { prefixes: ['42', '43', '44'], mode: 'debit', exclude: ['478', '479'] },
    { prefixes: ['45', '46', '47'], mode: 'debit', exclude: ['476', '477', '478', '479'] },
    { prefixes: ['492', '493', '494', '495', '496', '497'], mode: 'raw' },
  ],
  BR: [{ prefixes: ['476'], mode: 'raw' }],
  BS: [{ prefixes: TRESO_PREFIXES, mode: 'debit', exclude: TRESO_EXCLUDE }, { prefixes: ['59'], mode: 'raw' }],
  BU: [{ prefixes: ['478'], mode: 'raw' }],
  // ── PASSIF ──
  CA: [{ prefixes: ['101', '102', '103', '104'], mode: 'neg' }],
  CD: [{ prefixes: ['105', '106'], mode: 'neg' }],
  CF: [{ prefixes: ['11'], mode: 'neg' }],
  CG: [{ prefixes: ['12'], mode: 'neg' }],
  CL: [{ prefixes: ['14'], mode: 'neg' }],
  CM: [{ prefixes: ['15'], mode: 'neg' }],
  DA: [{ prefixes: ['16', '17', '18'], mode: 'neg' }],
  DB: [{ prefixes: ['19'], mode: 'neg' }],
  DG: [{ prefixes: ['48'], mode: 'credit' }],
  DI: [{ prefixes: ['40'], mode: 'credit' }],
  DH: [{ prefixes: ['41'], mode: 'credit' }],
  DJ: [{ prefixes: ['42', '43', '44'], mode: 'credit', exclude: ['478', '479'] }],
  DM: [{ prefixes: ['45', '46', '47'], mode: 'credit', exclude: ['476', '477', '478', '479'] }],
  DV: [{ prefixes: ['477'], mode: 'neg' }],
  DR: [{ prefixes: TRESO_PREFIXES, mode: 'credit', exclude: TRESO_EXCLUDE }, { prefixes: ['561', '564', '565', '566'], mode: 'neg' }],
  BX: [{ prefixes: ['479'], mode: 'neg' }],
};

function applyMode(bal: number, mode: SrcMode): number {
  switch (mode) {
    case 'raw':    return bal;
    case 'neg':    return -bal;
    case 'debit':  return bal > 0 ? bal : 0;
    case 'credit': return bal < 0 ? -bal : 0;
  }
}

/**
 * Détail par compte de chaque ligne de poste du bilan, à partir de la même source
 * que le calcul. `names` = Map<numéroCompte, intitulé>. Retourne Map<codePoste, comptes[]>.
 */
export function bilanLineAccounts(b: AccountBalances, names: Map<string, string>): Map<string, BilanLineAccount[]> {
  const result = new Map<string, BilanLineAccount[]>();
  for (const [code, parts] of Object.entries(BILAN_LINE_SOURCES)) {
    const accs: BilanLineAccount[] = [];
    for (const part of parts) {
      for (const [account, bal] of b) {
        if (!startsWithAny(account, part.prefixes)) continue;
        if (part.exclude && startsWithAny(account, part.exclude)) continue;
        const amount = applyMode(bal, part.mode);
        if (Math.abs(amount) < 0.5) continue;
        accs.push({ accountNumber: account, label: names.get(account) ?? account, amount });
      }
    }
    if (accs.length) result.set(code, accs.sort((x, y) => x.accountNumber.localeCompare(y.accountNumber)));
  }
  return result;
}

/** Attache à chaque ligne du bilan le détail des comptes (mutation en place). */
export function attachBilanAccounts(bilan: Bilan, b: AccountBalances, names: Map<string, string>): Bilan {
  const detail = bilanLineAccounts(b, names);
  for (const m of bilan.actifMasses)  for (const l of m.lines) l.accounts = detail.get(l.code) ?? [];
  for (const m of bilan.passifMasses) for (const l of m.lines) l.accounts = detail.get(l.code) ?? [];
  return bilan;
}

// ── COMPTE DE RÉSULTAT — Soldes Intermédiaires de Gestion ──────────────────────

export interface SIGLine { code: string; label: string; amount: number; kind: 'produit' | 'charge' | 'solde'; }

export interface CompteResultat {
  lines: SIGLine[];
  resultatNet: number;
  coherent: boolean;
}

export function computeCompteResultat(b: AccountBalances): CompteResultat {
  // Variations de stocks (603) — robuste : si la balance détaille au 4e chiffre
  // (6031/6032/6033) on répartit, sinon on prend la racine 603 globalement.
  const hasVarDetail = [...b.keys()].some((a) => a.length > 3 && a.startsWith('603'));
  const varStockMarch = hasVarDetail ? netSum(b, ['6031']) : 0;
  const varStockMat   = hasVarDetail ? netSum(b, ['6032']) : 0;
  const varStockOther = hasVarDetail ? netSum(b, ['6033', '6038']) : netSum(b, ['603']);

  // Marge commerciale
  const ventesMarch = creditAmount(b, ['701']);
  const achatsMarch = debitAmount(b, ['601']);
  const margeComm   = ventesMarch - achatsMarch - varStockMarch;

  // Production de l'exercice (707 « Produits accessoires » exclu → autres produits)
  const ventesProduits = creditAmount(b, ['702', '703', '704', '705', '706']);
  const prodStockee    = creditAmount(b, ['73']);
  const prodImmob      = creditAmount(b, ['72']);
  const production     = ventesProduits + prodStockee + prodImmob;

  // Consommations intermédiaires
  const achatsMat     = debitAmount(b, ['602']) + varStockMat;
  // En SYSCOHADA, l'eau/énergie et fournitures non stockables sont en 605
  // (6051-6053) — le 606 n'existe pas (c'est du PCG français).
  const autresAchats  = debitAmount(b, ['604', '605', '608']) + varStockOther;
  const transports    = debitAmount(b, ['61']);
  const servicesExt   = debitAmount(b, ['62', '63']);
  const consommations = achatsMat + autresAchats + transports + servicesExt;

  const valeurAjoutee = margeComm + production - consommations;

  // EBE
  const subventions  = creditAmount(b, ['71']);
  const impotsTaxes  = debitAmount(b, ['64']);
  const chargesPerso = debitAmount(b, ['66']);
  const ebe          = valeurAjoutee + subventions - impotsTaxes - chargesPerso;

  // Résultat d'exploitation (707 produits accessoires reclassé ici, hors production)
  const autresProduits = creditAmount(b, ['75', '707']);
  // 781 transferts charges expl. + 791 reprises provisions + 798 reprises amort. + 799 reprises subv. invest.
  const reprisesExpl   = creditAmount(b, ['781', '791', '798', '799']);
  const autresCharges  = debitAmount(b, ['65']);
  const dotationsExpl  = debitAmount(b, ['681', '691']);
  const resultatExpl   = ebe + autresProduits + reprisesExpl - autresCharges - dotationsExpl;

  // Résultat financier (SYSCOHADA : 77 revenus, 787 transferts, 797 reprises)
  const revenusFin  = creditAmount(b, ['77', '787', '797']);
  const fraisFin    = debitAmount(b, ['67', '687', '697']);
  const resultatFin = revenusFin - fraisFin;

  const resultatAO = resultatExpl + resultatFin;

  // Hors activités ordinaires
  const produitsHAO = creditAmount(b, ['82', '84', '86', '88']);
  const chargesHAO  = debitAmount(b, ['81', '83', '85']);
  const resultatHAO = produitsHAO - chargesHAO;

  const participation = debitAmount(b, ['87']);
  const impotResultat = debitAmount(b, ['89']);
  const resultatNetCascade = resultatAO + resultatHAO - participation - impotResultat;
  // On expose le résultat EXHAUSTIF (toutes classes 6/7/8) = celui injecté au bilan
  // → RN compte de résultat = RN bilan en toutes circonstances. La cascade sert
  // aux SIG intermédiaires ; `coherent` signale si un compte échappe à la cascade.
  const resultatNet = computeResultatNet(b);

  const lines: SIGLine[] = [
    { code: 'TA', label: 'Ventes de marchandises',                amount: ventesMarch,    kind: 'produit' },
    { code: 'RA', label: 'Achats de marchandises (var. incluse)', amount: achatsMarch + varStockMarch, kind: 'charge' },
    { code: 'XA', label: 'MARGE COMMERCIALE',                     amount: margeComm,      kind: 'solde' },
    { code: 'TB', label: "Production de l'exercice",              amount: production,     kind: 'produit' },
    { code: 'RB', label: 'Consommations intermédiaires',          amount: consommations,  kind: 'charge' },
    { code: 'XB', label: 'VALEUR AJOUTÉE',                        amount: valeurAjoutee,  kind: 'solde' },
    { code: 'RC', label: 'Charges de personnel',                  amount: chargesPerso,   kind: 'charge' },
    { code: 'XC', label: "EXCÉDENT BRUT D'EXPLOITATION",          amount: ebe,            kind: 'solde' },
    { code: 'XD', label: "RÉSULTAT D'EXPLOITATION",               amount: resultatExpl,   kind: 'solde' },
    { code: 'XE', label: 'RÉSULTAT FINANCIER',                    amount: resultatFin,    kind: 'solde' },
    { code: 'XF', label: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES',     amount: resultatAO,     kind: 'solde' },
    { code: 'XG', label: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES',    amount: resultatHAO,    kind: 'solde' },
    { code: 'XH', label: 'RÉSULTAT NET',                          amount: resultatNet,    kind: 'solde' },
  ];

  return { lines, resultatNet, coherent: Math.abs(resultatNetCascade - resultatNet) < 1 };
}
