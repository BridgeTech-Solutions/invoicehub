/**
 * @module lib/statement-rubriques
 * Modèle « façon Sage » du BILAN : chaque poste (rubrique) est défini par des
 * **sources** = fourchettes de comptes + règle d'agrégation. Données éditables
 * (Phase 2/3), seedées à l'identique depuis le calcul historique en dur.
 *
 * Le moteur `computeBilanFromRubriques` reproduit EXACTEMENT `computeBilan`
 * (lib/syscohada-statements) tant que le seed n'est pas modifié — c'est vérifié
 * par un test d'équivalence avant toute bascule.
 */
import {
  type AccountBalances, type Bilan, type BilanActifMasse, type BilanPassifMasse,
  type BilanActifLine, type BilanPassifLine, type BilanLineAccount,
  computeResultatNet,
} from './syscohada-statements';

// ── Modèle ──────────────────────────────────────────────────────────────────────

/**
 * Mode d'agrégation d'une source (= règle de signe « façon Sage ») :
 *   debitRaw  = Σ solde (débit−crédit) brut         → débit "naturel" (immo, stocks)
 *   creditRaw = −Σ solde                            → crédit "naturel" (capitaux, amort)
 *   debitSign = Σ soldes débiteurs uniquement       → bifonctionnel côté Actif
 *   creditSign = Σ (−soldes créditeurs) uniquement  → bifonctionnel côté Passif
 */
export type RubriqueMode = 'debitRaw' | 'creditRaw' | 'debitSign' | 'creditSign';

export interface RubriqueSource {
  column: 'brut' | 'amort';   // 'amort' réservé à l'actif (colonne Amort./Dépréc.)
  prefixes: string[];
  mode: RubriqueMode;
  exclude?: string[];
}

export interface RubriqueDef {
  side: 'actif' | 'passif';
  masseCode: string; masseLabel: string; masseOrder: number;
  code: string; label: string; lineOrder: number;
  isResult?: boolean;          // CH : résultat net (calculé, sans comptes)
  sources: RubriqueSource[];
}

// ── Helpers d'agrégation ────────────────────────────────────────────────────────

function startsWithAny(account: string, prefixes: string[]): boolean {
  return prefixes.some((p) => account.startsWith(p));
}

/** Contribution d'un compte (solde `bal`) selon le mode. */
function contribution(bal: number, mode: RubriqueMode): number {
  switch (mode) {
    case 'debitRaw':   return bal;
    case 'creditRaw':  return -bal;
    case 'debitSign':  return bal > 0 ? bal : 0;
    case 'creditSign': return bal < 0 ? -bal : 0;
  }
}

/** Valeur agrégée d'une source sur l'ensemble des soldes. */
function sourceValue(b: AccountBalances, src: RubriqueSource): number {
  let total = 0;
  for (const [account, bal] of b) {
    if (!startsWithAny(account, src.prefixes)) continue;
    if (src.exclude && startsWithAny(account, src.exclude)) continue;
    total += contribution(bal, src.mode);
  }
  return total;
}

/** Brut / Amort / Net d'une rubrique pour un jeu de soldes donné. */
function rubriqueAmounts(b: AccountBalances, def: RubriqueDef): { brut: number; amort: number; net: number } {
  if (def.isResult) {
    const net = computeResultatNet(b);
    return { brut: net, amort: 0, net };
  }
  let brut = 0, amort = 0;
  for (const src of def.sources) {
    const v = sourceValue(b, src);
    if (src.column === 'amort') amort += v; else brut += v;
  }
  return { brut, amort, net: brut - amort };
}

/** Détail par compte d'une rubrique (contribution au NET, amort. en négatif). */
function rubriqueAccounts(b: AccountBalances, names: Map<string, string>, def: RubriqueDef): BilanLineAccount[] {
  if (def.isResult) return [];
  const out: BilanLineAccount[] = [];
  for (const src of def.sources) {
    const sign = src.column === 'amort' ? -1 : 1;
    for (const [account, bal] of b) {
      if (!startsWithAny(account, src.prefixes)) continue;
      if (src.exclude && startsWithAny(account, src.exclude)) continue;
      const amount = sign * contribution(bal, src.mode);
      if (Math.abs(amount) < 0.5) continue;
      out.push({ accountNumber: account, label: names.get(account) ?? account, amount });
    }
  }
  return out.sort((x, y) => x.accountNumber.localeCompare(y.accountNumber));
}

// ── Moteur : Bilan depuis les rubriques ─────────────────────────────────────────

/**
 * Calcule le bilan SYSCOHADA à partir des rubriques (modèle éditable).
 * Sortie strictement compatible avec `computeBilan`. `names` (optionnel) attache
 * le détail des comptes par poste (vue « détaillé »).
 */
export function computeBilanFromRubriques(
  defs: RubriqueDef[],
  b: AccountBalances,
  bN1?: AccountBalances,
  names?: Map<string, string>,
): Bilan {
  const sorted = [...defs].sort((a, c) => a.masseOrder - c.masseOrder || a.lineOrder - c.lineOrder);

  const buildSide = (side: 'actif' | 'passif') => {
    const lines = sorted.filter((d) => d.side === side);
    // Regroupe par masse (en conservant l'ordre)
    const masseOrder: string[] = [];
    const byMasse = new Map<string, { label: string; defs: RubriqueDef[] }>();
    for (const d of lines) {
      if (!byMasse.has(d.masseCode)) { byMasse.set(d.masseCode, { label: d.masseLabel, defs: [] }); masseOrder.push(d.masseCode); }
      byMasse.get(d.masseCode)!.defs.push(d);
    }
    return masseOrder.map((code) => ({ code, ...byMasse.get(code)! }));
  };

  const actifMasses: BilanActifMasse[] = buildSide('actif').map((m) => {
    const lines: BilanActifLine[] = m.defs.map((d) => {
      const a = rubriqueAmounts(b, d);
      const n1 = bN1 ? rubriqueAmounts(bN1, d).net : 0;
      const line: BilanActifLine = { code: d.code, label: d.label, brut: a.brut, amortissements: a.amort, net: a.net, netN1: n1 };
      if (names) line.accounts = rubriqueAccounts(b, names, d);
      return line;
    });
    return {
      code: m.code, label: m.label, lines,
      totalBrut: lines.reduce((s, l) => s + l.brut, 0),
      totalAmort: lines.reduce((s, l) => s + l.amortissements, 0),
      totalNet: lines.reduce((s, l) => s + l.net, 0),
      totalNetN1: lines.reduce((s, l) => s + l.netN1, 0),
    };
  }).filter((m) => m.lines.length > 0);

  const passifMasses: BilanPassifMasse[] = buildSide('passif').map((m) => {
    const lines: BilanPassifLine[] = m.defs.map((d) => {
      const a = rubriqueAmounts(b, d);
      const n1 = bN1 ? rubriqueAmounts(bN1, d).net : 0;
      const line: BilanPassifLine = { code: d.code, label: d.label, net: a.net, netN1: n1 };
      if (names) line.accounts = rubriqueAccounts(b, names, d);
      return line;
    });
    return {
      code: m.code, label: m.label, lines,
      totalNet: lines.reduce((s, l) => s + l.net, 0),
      totalNetN1: lines.reduce((s, l) => s + l.netN1, 0),
    };
  }).filter((m) => m.lines.length > 0);

  const totalActif    = actifMasses.reduce((s, m) => s + m.totalNet, 0);
  const totalActifN1  = actifMasses.reduce((s, m) => s + m.totalNetN1, 0);
  const totalPassif   = passifMasses.reduce((s, m) => s + m.totalNet, 0);
  const totalPassifN1 = passifMasses.reduce((s, m) => s + m.totalNetN1, 0);
  const resultatNet   = computeResultatNet(b);
  const ecart = totalActif - totalPassif;

  // Contrôle de complétude identique à computeBilan
  let netCl15 = 0;
  for (const [account, bal] of b) if (startsWithAny(account, ['1', '2', '3', '4', '5'])) netCl15 += bal;
  const ventileNet = totalActif - (totalPassif - resultatNet);
  const comptesNonVentiles = netCl15 - ventileNet;

  return {
    actifMasses, passifMasses,
    totalActif, totalActifN1, totalPassif, totalPassifN1,
    resultatNet, equilibre: Math.abs(ecart) < 1, ecart, comptesNonVentiles,
  };
}
