// ── Levenshtein distance ──────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  // Optimisation 2-lignes : on ne garde que la ligne courante et la précédente
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]!
        : 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
    }
    prev = curr as number[];
  }
  return prev[n]!;
}

export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1.0;
  if (!al || !bl) return 0.0;   // cas chaîne vide après trim (ex: "   ")
  const maxLen = Math.max(al.length, bl.length);
  const minLen = Math.min(al.length, bl.length);
  // Bonus substring uniquement si la chaîne courte représente ≥ 60% de la longue
  if (al.includes(bl) || bl.includes(al)) {
    return 0.7 + 0.3 * (minLen / maxLen);
  }
  // Token Jaccard : compare les mots en plus de la distance caractère
  const tokensA = new Set(al.split(/\s+/).filter(Boolean));
  const tokensB = new Set(bl.split(/\s+/).filter(Boolean));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const levSim  = Math.max(0, 1 - levenshtein(al, bl) / maxLen);
  // Moyenne pondérée : Jaccard favorisé pour les libellés bancaires structurés en tokens
  return Math.max(jaccard * 0.6 + levSim * 0.4, levSim);
}

// ── Score pondéré ─────────────────────────────────────────────────────────────

export interface ScoreInput {
  entityAmount: number;
  entityDate:   Date;
  entityLabel:  string;
  entityRef?:   string | null;
  txAmount:     number;
  txDate:       Date;
  txLabel:      string;
  txRef?:       string | null;
  ruleBonus?:   number; // +15 si règle apprise active
}

export interface ScoreDetail {
  montant:   number;
  date:      number;
  label:     number;
  reference: number;
  rule:      number;
  total:     number;
}

export function computeScore(input: ScoreInput): ScoreDetail {
  const { entityAmount, entityDate, entityLabel, entityRef,
          txAmount, txDate, txLabel, txRef, ruleBonus = 0 } = input;

  // Montant — 45 pts max
  const diff    = Math.abs(entityAmount - txAmount);
  const absTx   = Math.abs(txAmount);
  const pctDiff = absTx > 0 ? diff / absTx : 1;
  const montant = diff < 0.01 ? 45
    : pctDiff < 0.001 ? 35
    : pctDiff < 0.01  ? 20
    : 0;

  // Date — 30 pts max (comparaison en jours calendaires, pas en ms)
  const daysDiff = Math.floor(Math.abs((entityDate.getTime() - txDate.getTime()) / 86_400_000));
  const date = daysDiff === 0  ? 30
    : daysDiff <= 2  ? 22
    : daysDiff <= 5  ? 14
    : daysDiff <= 10 ? 6
    : 0;

  // Libellé — 15 pts max
  const label = Math.round(textSimilarity(entityLabel, txLabel) * 15);

  // Référence — 10 pts max
  const reference = (entityRef && txRef)
    ? Math.round(textSimilarity(entityRef, txRef) * 10)
    : 0;

  // Bonus règle apprise
  const rule = Math.min(15, ruleBonus);

  const total = Math.min(100, montant + date + label + reference + rule);
  return { montant, date, label, reference, rule, total };
}

// ── Subset Sum (backtracking branch & bound) ──────────────────────────────────

export interface SubsetCandidate {
  id:     string;
  amount: number;
  label:  string;
  date:   Date;
}

export interface SubsetMatch {
  ids:    string[];
  total:  number;
  diff:   number;
}

export function subsetSum(
  candidates: SubsetCandidate[],
  target:     number,
  tolerance:  number,
  maxSize     = 6,
  maxResults  = 5,
): SubsetMatch[] {
  const sorted = [...candidates].sort((a, b) => b.amount - a.amount);
  const results: SubsetMatch[] = [];

  // Suffixe précalculé : suffixSum[i] = somme de sorted[i..end] — O(1) par nœud vs O(n)
  const suffixSum = new Array<number>(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1]! + sorted[i]!.amount;
  }

  function backtrack(start: number, current: SubsetCandidate[], sum: number): void {
    if (results.length >= maxResults) return;
    if (Math.abs(sum - target) <= tolerance) {
      results.push({ ids: current.map(c => c.id), total: sum, diff: Math.abs(sum - target) });
      return;
    }
    if (current.length >= maxSize) return;
    if (sum + suffixSum[start]! < target - tolerance) return; // impossible d'atteindre la cible
    if (sum > target + tolerance) return;                     // déjà dépassé

    for (let i = start; i < sorted.length; i++) {
      current.push(sorted[i]!);
      backtrack(i + 1, current, sum + sorted[i]!.amount);
      current.pop();
      if (results.length >= maxResults) return;
    }
  }

  backtrack(0, [], 0);
  return results.sort((a, b) => a.diff - b.diff);
}

// ── Hungarian Algorithm (Kuhn-Munkres) O(n³) ─────────────────────────────────

export function hungarian(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];

  // Convertir en matrice carrée si nécessaire (compléter avec Infinity)
  const m = Math.max(n, ...costMatrix.map(r => r.length));
  const INF = 1e9;

  const cost: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => costMatrix[i]?.[j] ?? INF)
  );

  // Potentiels de lignes et colonnes
  const u = new Array(m + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0); // p[j] = ligne assignée à colonne j
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    p[0] = i;
    let j0 = 0;
    const minDist = new Array(m + 1).fill(INF);
    const used    = new Array(m + 1).fill(false);

    do {
      used[j0] = true;
      let delta = INF;
      let j1 = -1;
      const i0 = p[j0]!;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
          if (cur < minDist[j]!) {
            minDist[j] = cur;
            way[j] = j0;
          }
          if (minDist[j]! < delta) {
            delta = minDist[j]!;
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else {
          minDist[j]! -= delta;
        }
      }
      j0 = j1!;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }

  // Construire le résultat : assignment[i] = j (0-indexed)
  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j]! >= 1 && p[j]! <= n && j <= n) {
      assignment[p[j]! - 1] = j - 1;
    }
  }
  return assignment;
}
