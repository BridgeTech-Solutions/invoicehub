import {
  levenshtein, textSimilarity, computeScore,
  subsetSum, hungarian, SubsetCandidate,
} from './bank.matching';

// Helpers
const d = (s: string) => new Date(s + 'T00:00:00');

describe('bank.matching — levenshtein', () => {
  it('distance nulle pour chaînes identiques', () => {
    expect(levenshtein('virement', 'virement')).toBe(0);
  });
  it('compte les substitutions/insertions/suppressions', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('bank.matching — textSimilarity', () => {
  it('renvoie 1.0 pour égalité (insensible casse/espaces)', () => {
    expect(textSimilarity('VIREMENT SARL', 'virement sarl')).toBe(1.0);
    expect(textSimilarity('  Paie  ', 'Paie')).toBe(1.0);
  });
  it('renvoie 0 si une chaîne est vide', () => {
    expect(textSimilarity('', 'abc')).toBe(0);
    expect(textSimilarity('   ', 'abc')).toBe(0);
  });
  it('bonus substring élevé quand la courte couvre ≥60% de la longue', () => {
    // "client sarl" ⊂ "virement client sarl" -> substring rule
    const s = textSimilarity('client sarl', 'virement client sarl');
    expect(s).toBeGreaterThan(0.7);
    expect(s).toBeLessThanOrEqual(1);
  });
  it('libellés totalement différents → similarité faible', () => {
    expect(textSimilarity('salaire mars', 'achat gasoil')).toBeLessThan(0.4);
  });
  it('tokens partagés relèvent le score (Jaccard)', () => {
    const shared  = textSimilarity('virement client bts', 'virement fournisseur bts');
    const nothing = textSimilarity('virement client bts', 'aaaa bbbb cccc');
    expect(shared).toBeGreaterThan(nothing);
  });
});

describe('bank.matching — computeScore', () => {
  const base = {
    txAmount: 1_000_000, txDate: d('2026-03-15'),
    txLabel: 'VIREMENT CLIENT SARL', txRef: 'REF123',
  };

  it('score parfait: même montant, même jour, même libellé, même réf', () => {
    const r = computeScore({
      entityAmount: 1_000_000, entityDate: d('2026-03-15'),
      entityLabel: 'VIREMENT CLIENT SARL', entityRef: 'REF123',
      ...base,
    });
    expect(r.montant).toBe(45);
    expect(r.date).toBe(30);
    expect(r.label).toBe(15);
    expect(r.reference).toBe(10);
    expect(r.total).toBe(100);
  });

  it('montant exact = 45 pts même si signe des cents diffère (<0.01)', () => {
    const r = computeScore({
      entityAmount: 1_000_000.004, entityDate: d('2026-03-15'),
      entityLabel: 'x', ...base,
    });
    expect(r.montant).toBe(45);
  });

  it('écart de montant > 1% → 0 pt montant', () => {
    const r = computeScore({
      entityAmount: 1_100_000, entityDate: d('2026-03-15'),
      entityLabel: 'x', ...base,
    });
    expect(r.montant).toBe(0);
  });

  it('paliers de date: 0j=30, ≤2j=22, ≤5j=14, ≤10j=6, au-delà=0', () => {
    const mk = (date: Date) => computeScore({
      entityAmount: 1_000_000, entityDate: date, entityLabel: 'x', ...base,
    }).date;
    expect(mk(d('2026-03-15'))).toBe(30);
    expect(mk(d('2026-03-17'))).toBe(22);
    expect(mk(d('2026-03-20'))).toBe(14);
    expect(mk(d('2026-03-25'))).toBe(6);
    expect(mk(d('2026-04-15'))).toBe(0);
  });

  it('bonus règle plafonné à 15', () => {
    const r = computeScore({
      entityAmount: 1_000_000, entityDate: d('2026-03-15'),
      entityLabel: 'x', ...base, ruleBonus: 999,
    });
    expect(r.rule).toBe(15);
  });

  it('total plafonné à 100', () => {
    const r = computeScore({
      entityAmount: 1_000_000, entityDate: d('2026-03-15'),
      entityLabel: 'VIREMENT CLIENT SARL', entityRef: 'REF123',
      ...base, ruleBonus: 15,
    });
    expect(r.total).toBe(100);
  });

  it('référence ignorée si absente d’un côté', () => {
    const r = computeScore({
      entityAmount: 1_000_000, entityDate: d('2026-03-15'),
      entityLabel: 'x', entityRef: null, ...base,
    });
    expect(r.reference).toBe(0);
  });
});

describe('bank.matching — subsetSum', () => {
  const cand = (id: string, amount: number): SubsetCandidate =>
    ({ id, amount, label: id, date: d('2026-03-15') });

  it('trouve le sous-ensemble qui somme la cible (à la tolérance près)', () => {
    const matches = subsetSum(
      [cand('a', 100), cand('b', 200), cand('c', 300)],
      500, 1,
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const best = matches[0]!;
    expect(best.ids.sort()).toEqual(['b', 'c']);
    expect(best.diff).toBeLessThanOrEqual(1);
  });

  it('respecte la tolérance (aucun match si trop loin)', () => {
    const matches = subsetSum([cand('a', 100), cand('b', 200)], 999, 1);
    expect(matches).toHaveLength(0);
  });

  it('trie les résultats par écart croissant', () => {
    const matches = subsetSum(
      [cand('a', 100), cand('b', 300), cand('c', 401)],
      400, 5,
    );
    // {a,b}=400 (diff 0) doit précéder {c}=401 (diff 1)
    expect(matches[0]!.diff).toBeLessThanOrEqual(matches[matches.length - 1]!.diff);
  });

  it('borne le nombre de résultats à maxResults', () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(`x${i}`, 100));
    const matches = subsetSum(many, 100, 0.01, 6, 3);
    expect(matches.length).toBeLessThanOrEqual(3);
  });
});

describe('bank.matching — hungarian', () => {
  it('affectation optimale sur matrice carrée 2×2', () => {
    // coût min: row0→col1 (1) + row1→col0 (2) = 3
    expect(hungarian([[4, 1], [2, 3]])).toEqual([1, 0]);
  });

  it('affectation optimale 3×3', () => {
    const assignment = hungarian([
      [9, 2, 7],
      [6, 4, 3],
      [5, 8, 1],
    ]);
    // Vérifie que c’est bien une permutation et que le coût est minimal (10 : 2+3+? )
    expect(new Set(assignment).size).toBe(3);
    const cost = [[9, 2, 7], [6, 4, 3], [5, 8, 1]];
    const total = assignment.reduce((s, j, i) => s + cost[i]![j]!, 0);
    // meilleur: row0→c1(2), row1→c0(6), row2→c2(1) = 9
    expect(total).toBe(9);
  });

  it('matrice rectangulaire (plus de colonnes que de lignes)', () => {
    const assignment = hungarian([[5, 2, 8]]);
    expect(assignment).toHaveLength(1);
    expect(assignment[0]).toBe(1); // colonne la moins chère
  });

  // Régression : cas normal de getAutoMatchBatch — beaucoup plus de candidats
  // (paiements/dépenses) que de transactions bancaires à rapprocher.
  it('plus de candidats que de transactions : affecte de façon optimale sans planter', () => {
    const cost = [
      [10, 90, 90, 90, 90, 90],
      [90, 90, 20, 90, 90, 90],
      [90, 90, 90, 90, 30, 90],
    ];
    const assignment = hungarian(cost);
    expect(assignment).toEqual([0, 2, 4]);
    const total = assignment.reduce((s, j, i) => s + cost[i]![j]!, 0);
    expect(total).toBe(60); // 10 + 20 + 30
  });

  it('plus de transactions que de candidats : les lignes en trop sont non affectées', () => {
    const assignment = hungarian([[5, 9], [9, 4], [7, 7]]);
    expect(assignment).toHaveLength(3);
    // exactement une ligne non affectée, et pas de colonne réutilisée
    const assigned = assignment.filter(j => j >= 0);
    expect(assigned).toHaveLength(2);
    expect(new Set(assigned).size).toBe(2);
    expect(assignment.filter(j => j === -1)).toHaveLength(1);
  });

  it('matrice vide → tableau vide', () => {
    expect(hungarian([])).toEqual([]);
  });
});
