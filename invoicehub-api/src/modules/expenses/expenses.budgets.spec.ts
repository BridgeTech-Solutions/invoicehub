/**
 * Fenêtres de période budgétaire et périodicité des dépenses récurrentes.
 *
 * Ces helpers sont des fonctions PURES (statiques privées) : aucun accès base, on les
 * appelle directement. Le point sensible est l'UTC — `expenseDate`/`entryDate` sont des
 * colonnes `@db.Date` (minuit UTC) ; construire les bornes en heure locale décalerait la
 * fenêtre d'une heure sur un serveur à l'est de UTC (Cameroun, UTC+1) et ferait sortir de
 * la période les dépenses du premier ou du dernier jour.
 *
 * NB : l'ancien test de `checkBudgetAlerts` (alertes par catégorie, logique de
 * « franchissement ») a été retiré — cette méthode n'existe plus, le contrôle budgétaire
 * passe désormais par compte comptable via `evaluateBudgetForExpense` à l'approbation.
 */
import { ExpensesService } from './expenses.service';

const budgetWindow = (b: { periodType: string; year: number; quarter: number | null; month: number | null }) =>
  (ExpensesService as any)['budgetWindow'](b) as { gte: Date; lte: Date };

const addFrequency = (date: Date, freq: string) =>
  (ExpensesService as any)['addFrequency'](date, freq) as Date;

const day = (d: Date) => d.toISOString().slice(0, 10);

describe('budgetWindow — bornes de période en UTC', () => {
  it('mensuel : premier au dernier jour du mois (février non bissextile)', () => {
    const w = budgetWindow({ periodType: 'monthly', year: 2026, quarter: null, month: 2 });
    expect(w.gte.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(day(w.lte)).toBe('2026-02-28');
  });

  it('trimestriel : T1 = janvier → mars', () => {
    const w = budgetWindow({ periodType: 'quarterly', year: 2026, quarter: 1, month: null });
    expect(day(w.gte)).toBe('2026-01-01');
    expect(day(w.lte)).toBe('2026-03-31');
  });

  it('trimestriel : T4 = octobre → décembre', () => {
    const w = budgetWindow({ periodType: 'quarterly', year: 2026, quarter: 4, month: null });
    expect(day(w.gte)).toBe('2026-10-01');
    expect(day(w.lte)).toBe('2026-12-31');
  });

  it('annuel : année civile entière', () => {
    const w = budgetWindow({ periodType: 'annual', year: 2026, quarter: null, month: null });
    expect(w.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(day(w.lte)).toBe('2026-12-31');
  });
});

describe('addFrequency — prochaine échéance récurrente (UTC)', () => {
  const base = new Date(Date.UTC(2026, 0, 15)); // 15 janvier 2026

  it('hebdomadaire : +7 jours', () => {
    expect(day(addFrequency(base, 'weekly'))).toBe('2026-01-22');
  });
  it('mensuel : +1 mois', () => {
    expect(day(addFrequency(base, 'monthly'))).toBe('2026-02-15');
  });
  it('trimestriel : +3 mois', () => {
    expect(day(addFrequency(base, 'quarterly'))).toBe('2026-04-15');
  });
  it('annuel : +1 an', () => {
    expect(day(addFrequency(base, 'annual'))).toBe('2027-01-15');
  });
});
