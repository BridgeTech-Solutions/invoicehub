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

// ── Types de sortie ────────────────────────────────────────────────────────────

export interface BilanActifLine  { code: string; label: string; brut: number; amortissements: number; net: number; }
export interface BilanPassifLine { code: string; label: string; net: number; }

export interface Bilan {
  actif: BilanActifLine[];
  passif: BilanPassifLine[];
  totalActif: number;
  totalPassif: number;
  resultatNet: number;
  equilibre: boolean;
  ecart: number;
  /** Montant des comptes de classes 1-5 non rattachés à un poste (doit être 0).
   *  Diagnostic de complétude : si ≠ 0, un compte orphelin n'est pas présenté. */
  comptesNonVentiles: number;
}

/** Résultat net de l'exercice = produits (cl. 7 + HAO) − charges (cl. 6 + HAO + impôt). */
export function computeResultatNet(b: AccountBalances): number {
  const produits = creditAmount(b, ['7', '82', '84', '86', '88']);
  const charges  = debitAmount(b, ['6', '81', '83', '85', '87', '89']);
  return produits - charges;
}

export function computeBilan(b: AccountBalances): Bilan {
  const actif: BilanActifLine[]  = [];
  const passif: BilanPassifLine[] = [];

  // 0) Capital souscrit non appelé (109, débiteur) — en tête d'actif (poste AA)
  const capitalNonAppele = debitAmount(b, ['109']);
  actif.push({ code: 'AA', label: 'Capital souscrit non appelé', brut: capitalNonAppele, amortissements: 0, net: capitalNonAppele });

  // 1) ACTIF immobilisé + stocks (monofonctionnels brut/amort)
  for (const p of [...ACTIF_IMMOBILISE, ACTIF_STOCKS]) {
    const brut = debitAmount(b, p.brut);
    const amort = p.amort ? creditAmount(b, p.amort) : 0;
    actif.push({ code: p.code, label: p.label, brut, amortissements: amort, net: brut - amort });
  }

  // 2) TIERS bifonctionnels — classés au signe (fix erreurs comptes mixtes)
  const clients = splitBySign(b, ['41']);                       // 41
  const fourn   = splitBySign(b, ['40']);                       // 40 (409 avances = débit)
  const fisc    = splitBySign(b, ['42', '43', '44'], ['478', '479']); // personnel/social/État
  const autres  = splitBySign(b, ['45', '46', '47'], ['476', '477', '478', '479']); // débiteurs/créditeurs divers
  const hao     = splitBySign(b, ['48']);                       // créances/dettes HAO (481, 485, 488…)
  const ecartActif  = debitAmount(b, ['478']);                  // écarts de conversion-Actif
  const ecartPassif = creditAmount(b, ['479']);                 // écarts de conversion-Passif
  const chargesCAvance  = debitAmount(b, ['476']);              // charges constatées d'avance (Actif)
  const produitsCAvance = creditAmount(b, ['477']);            // produits constatés d'avance (Passif)
  const deprecClients = creditAmount(b, ['491']);
  const deprecAutres  = creditAmount(b, ['492', '493', '494', '495', '496', '497']);

  actif.push({ code: 'BH', label: 'Fournisseurs, avances versées', brut: fourn.debit, amortissements: 0, net: fourn.debit });
  actif.push({ code: 'BI', label: 'Clients', brut: clients.debit, amortissements: deprecClients, net: clients.debit - deprecClients });
  const autresCreancesBrut = fisc.debit + autres.debit;
  actif.push({ code: 'BJ', label: 'Autres créances', brut: autresCreancesBrut, amortissements: deprecAutres, net: autresCreancesBrut - deprecAutres });
  actif.push({ code: 'BG', label: 'Créances HAO', brut: hao.debit, amortissements: 0, net: hao.debit });
  actif.push({ code: 'BR', label: "Charges constatées d'avance", brut: chargesCAvance, amortissements: 0, net: chargesCAvance });

  // 3) TRÉSORERIE-ACTIF bifonctionnelle (banques 52 etc. au signe)
  const treso = splitBySign(b, ['50', '51', '52', '53', '54', '55', '57', '58'], ['590', '591', '592', '593', '594']);
  const deprecTreso = creditAmount(b, ['59']);
  actif.push({ code: 'BS', label: 'Trésorerie-Actif (banques, caisse)', brut: treso.debit, amortissements: deprecTreso, net: treso.debit - deprecTreso });

  // 4) ÉCART DE CONVERSION-ACTIF (isolé, exigé par la DSF)
  actif.push({ code: 'BU', label: 'Écart de conversion-Actif', brut: ecartActif, amortissements: 0, net: ecartActif });

  // ── PASSIF ──────────────────────────────────────────────────────────────────
  // Capitaux propres
  for (const p of PASSIF_CAPITAUX) passif.push({ code: p.code, label: p.label, net: creditAmount(b, p.accounts) });
  const resultatNet = computeResultatNet(b);
  passif.push({ code: 'CH', label: "Résultat net de l'exercice", net: resultatNet });
  // Dettes financières
  for (const p of PASSIF_DETTES_FIN) passif.push({ code: p.code, label: p.label, net: creditAmount(b, p.accounts) });
  // Passif circulant (tiers créditeurs)
  passif.push({ code: 'DI', label: "Fournisseurs d'exploitation", net: fourn.credit });
  passif.push({ code: 'DH', label: 'Clients, avances reçues', net: clients.credit });
  passif.push({ code: 'DJ', label: 'Dettes fiscales & sociales', net: fisc.credit });
  passif.push({ code: 'DM', label: 'Autres dettes', net: autres.credit });
  passif.push({ code: 'DG', label: 'Dettes circulantes HAO', net: hao.credit });
  passif.push({ code: 'DV', label: "Produits constatés d'avance", net: produitsCAvance });
  passif.push({ code: 'BX', label: 'Écart de conversion-Passif', net: ecartPassif });
  // Trésorerie-Passif : découverts (52 créditeur) + crédits de trésorerie (56)
  const creditsTreso = creditAmount(b, ['561', '564', '565', '566']);
  passif.push({ code: 'DR', label: 'Banques, découverts & crédits de trésorerie', net: treso.credit + creditsTreso });

  const totalActif  = actif.reduce((s, l) => s + l.net, 0);
  const totalPassif = passif.reduce((s, l) => s + l.net, 0);
  const ecart = totalActif - totalPassif;

  // Contrôle de complétude : le net réel de toute la balance classe 1-5 doit être
  // égal au net effectivement ventilé dans les postes. Tout écart = compte orphelin
  // (108, 13, 18 débiteur, dépréciation non rattachée…) non présenté → à reclasser.
  const ventileNet = totalActif - (totalPassif - resultatNet);
  const comptesNonVentiles = netSum(b, ['1', '2', '3', '4', '5']) - ventileNet;

  return {
    actif, passif, totalActif, totalPassif, resultatNet,
    equilibre: Math.abs(ecart) < 1, ecart, comptesNonVentiles,
  };
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
