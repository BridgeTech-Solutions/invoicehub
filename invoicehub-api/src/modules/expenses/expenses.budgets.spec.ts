/**
 * Alertes de budget de dépenses — `checkBudgetAlerts`.
 *
 * La fonction compare la consommation AVANT et APRÈS le paiement pour ne notifier
 * qu'au FRANCHISSEMENT d'un seuil (80 %, 100 %). Deux points la rendent fragile :
 *   • la période retenue doit être celle de la DÉPENSE, pas celle du jour ;
 *   • les bornes de période doivent être en UTC, car `expenseDate` est une colonne
 *     `@db.Date` (cf. le décalage d'un jour déjà corrigé sur le module bancaire).
 *
 * Prisma et la file de notification sont simulés : seule la logique est sous test.
 */
import { ExpensesService } from './expenses.service';

const CATEGORY = 'cat-1';

/**
 * Construit le service avec un budget et un total de dépenses payées donnés.
 * `aggregateByRange` reçoit les bornes calculées par le code testé, ce qui permet
 * de vérifier la PÉRIODE réellement interrogée.
 */
function makeService(opts: {
  budgets: Array<{ id: string; year: number; month: number | null; budgetAmount: number }>
  /** total des dépenses payées, en fonction des bornes demandées */
  aggregateByRange: (start: Date, end: Date) => number
}) {
  const seenRanges: Array<{ start: Date; end: Date }> = [];
  const notifications: any[] = [];

  const prisma = {
    expenseBudget: {
      // Le simulacre applique le MÊME filtre que Prisma — année ET
      // `OR: [{ month: null }, { month: m }]`. C'est ce filtre qui porte le bug :
      // si `m` vient du jour courant, le budget du mois de la dépense n'est jamais
      // retrouvé. Un simulacre qui ignorerait le mois rendrait le test aveugle.
      findMany: jest.fn(async ({ where }: any) => {
        const monthsAllowed = (where.OR ?? []).map((o: any) => o.month);
        return opts.budgets
          .filter((b) => b.year === where.year)
          .filter((b) => monthsAllowed.length === 0 || monthsAllowed.includes(b.month))
          .map((b) => ({ ...b, category: { name: 'Carburant' } }));
      }),
    },
    user: { findMany: jest.fn(async () => [{ id: 'admin-1' }]) },
    expense: {
      aggregate: jest.fn(async ({ where }: any) => {
        const start = where.expenseDate.gte as Date;
        const end   = where.expenseDate.lte as Date;
        seenRanges.push({ start, end });
        return { _sum: { amountTtc: opts.aggregateByRange(start, end) } };
      }),
    },
  };

  const notifQueue = { add: jest.fn(async (_n: string, payload: any) => { notifications.push(payload); }) };
  // (prisma, eventEmitter, approvalsService, notifQueue)
  const svc = new ExpensesService(
    prisma as any, { emit: jest.fn() } as any, {} as any, notifQueue as any,
  );
  return { svc, notifications, seenRanges };
}

/** `checkBudgetAlerts` est privée : on y accède explicitement pour la tester. */
const callCheck = (svc: any, ...args: unknown[]) => svc['checkBudgetAlerts'](...args);

describe('checkBudgetAlerts — franchissement de seuil', () => {
  const MOIS_COURANT = new Date().getMonth() + 1;
  const ANNEE        = new Date().getFullYear();

  it('notifie au franchissement des 80 %', async () => {
    const { svc, notifications } = makeService({
      budgets: [{ id: 'b1', year: ANNEE, month: MOIS_COURANT, budgetAmount: 1_000_000 }],
      aggregateByRange: () => 850_000, // après paiement
    });
    await callCheck(svc, CATEGORY, 200_000); // avant : 650 000 → 65 %

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toMatch(/80 %/);
    expect(notifications[0].type).toBe('budget_exceeded');
  });

  it('notifie au dépassement des 100 %', async () => {
    const { svc, notifications } = makeService({
      budgets: [{ id: 'b1', year: ANNEE, month: MOIS_COURANT, budgetAmount: 1_000_000 }],
      aggregateByRange: () => 1_200_000,
    });
    await callCheck(svc, CATEGORY, 400_000); // avant : 800 000 → 80 %

    expect(notifications.map((n) => n.title).join(' ')).toMatch(/dépassé/i);
  });

  it('ne notifie pas deux fois pour un seuil déjà franchi', async () => {
    const { svc, notifications } = makeService({
      budgets: [{ id: 'b1', year: ANNEE, month: MOIS_COURANT, budgetAmount: 1_000_000 }],
      aggregateByRange: () => 950_000,
    });
    await callCheck(svc, CATEGORY, 50_000); // avant : 900 000 → déjà au-delà de 80 %

    expect(notifications).toHaveLength(0);
  });

  it('ne fait rien sans catégorie ni budget', async () => {
    const { svc, notifications } = makeService({ budgets: [], aggregateByRange: () => 0 });
    await callCheck(svc, null, 100);
    await callCheck(svc, CATEGORY, 100);
    expect(notifications).toHaveLength(0);
  });

  it('ignore un budget à zéro (division impossible)', async () => {
    const { svc, notifications } = makeService({
      budgets: [{ id: 'b1', year: ANNEE, month: MOIS_COURANT, budgetAmount: 0 }],
      aggregateByRange: () => 500_000,
    });
    await callCheck(svc, CATEGORY, 500_000);
    expect(notifications).toHaveLength(0);
  });
});

describe('checkBudgetAlerts — période analysée', () => {
  /**
   * RÉGRESSION : la période était déduite de `new Date()`. Payer en juillet une
   * dépense datée de janvier interrogeait donc le budget de JUILLET, tout en
   * retranchant un montant absent de cet agrégat — d'où des alertes fantaisistes
   * sur un mois où rien n'avait bougé, et un dépassement réel de janvier ignoré.
   */
  it('retient la période de la DÉPENSE, pas celle du jour', async () => {
    const dateDepense = new Date(Date.UTC(2026, 0, 15)); // 15 janvier 2026
    const { svc, seenRanges } = makeService({
      budgets: [{ id: 'b1', year: 2026, month: 1, budgetAmount: 1_000_000 }],
      aggregateByRange: () => 500_000,
    });

    await callCheck(svc, CATEGORY, 100_000, dateDepense);

    // Le budget de janvier doit avoir été RETROUVÉ (filtre sur le mois de la dépense)
    // puis analysé sur janvier. Si la période venait du jour courant, aucun budget
    // ne serait retourné et aucune plage ne serait interrogée.
    expect(seenRanges).toHaveLength(1);
    expect(seenRanges[0]!.start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(seenRanges[0]!.end.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('borne un budget annuel sur l’année entière de la dépense', async () => {
    const dateDepense = new Date(Date.UTC(2026, 4, 20));
    const { svc, seenRanges } = makeService({
      budgets: [{ id: 'b1', year: 2026, month: null, budgetAmount: 5_000_000 }],
      aggregateByRange: () => 1_000_000,
    });

    await callCheck(svc, CATEGORY, 100_000, dateDepense);

    expect(seenRanges[0]!.start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(seenRanges[0]!.end.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  // Les bornes doivent être construites en UTC : `new Date(y, m, d)` vaut minuit
  // LOCAL et décale la fenêtre d'une heure sur un serveur à l'est de UTC, ce qui
  // fait sortir de la période les dépenses du premier ou du dernier jour du mois.
  it('construit des bornes en UTC, indépendantes du fuseau serveur', async () => {
    const dateDepense = new Date(Date.UTC(2026, 1, 10)); // février 2026
    const { svc, seenRanges } = makeService({
      budgets: [{ id: 'b1', year: 2026, month: 2, budgetAmount: 1_000_000 }],
      aggregateByRange: () => 100_000,
    });

    await callCheck(svc, CATEGORY, 10_000, dateDepense);

    expect(seenRanges[0]!.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    // Fin de journée du dernier jour de février (28 en 2026, non bissextile).
    expect(seenRanges[0]!.end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});
