/**
 * Évaluation des déclencheurs de workflow — `evaluateWorkflowForDocument`.
 *
 * C'est la porte d'entrée de tout le module : cette fonction décide si un document
 * part en approbation. Un faux négatif laisse passer une facture sans validation ;
 * un faux positif bloque un document qui n'aurait pas dû l'être.
 *
 * Prisma est simulé : seule la logique de comparaison est sous test.
 */
import { ApprovalsService } from './approvals.service';

type Trigger = { documentType: string; field: string; operator: string; value: string };

/** Construit un service dont `approvalWorkflow.findMany` renvoie les workflows donnés. */
function serviceWith(workflows: Array<{ id: string; priority: number; triggers: Trigger[] }>) {
  const prisma = {
    approvalWorkflow: {
      findMany: jest.fn(async () =>
        [...workflows].sort((a, b) => b.priority - a.priority),
      ),
    },
  };
  // (prisma, notifQueue, emailQueue, emitter) — seul prisma est sollicité ici.
  return new ApprovalsService(prisma as any, {} as any, {} as any, {} as any);
}

const wf = (id: string, triggers: Trigger[], priority = 0) => ({ id, priority, triggers });
const t  = (field: string, operator: string, value: string, documentType = 'invoice'): Trigger =>
  ({ documentType, field, operator, value });

describe('evaluateWorkflowForDocument — comparaisons numériques', () => {
  it('déclenche au-dessus du seuil (gte)', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '1000000')])]);
    const hit = await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 1_500_000 });
    expect(hit?.id).toBe('w1');
  });

  it('ne déclenche pas sous le seuil', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '1000000')])]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 999_999 })).toBeNull();
  });

  it('gte est inclusif à la valeur exacte', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '1000000')])]);
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 1_000_000 }))?.id).toBe('w1');
  });

  it('compare bien des nombres, pas des chaînes (9 < 10)', async () => {
    // En comparaison lexicographique, "9" > "10" : le montant 9 déclencherait à tort.
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '10')])]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 9 })).toBeNull();
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 10 }))?.id).toBe('w1');
  });

  it('accepte un montant fourni sous forme de chaîne (Decimal sérialisé)', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '1000000')])]);
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: '1500000.00' }))?.id).toBe('w1');
  });

  it('gère lte, gt, lt et eq', async () => {
    const mk = (op: string, val: string) => serviceWith([wf('w1', [t('totalTtc', op, val)])]);
    expect((await mk('lte', '100').evaluateWorkflowForDocument('invoice' as any, { totalTtc: 100 }))?.id).toBe('w1');
    expect(await mk('lt',  '100').evaluateWorkflowForDocument('invoice' as any, { totalTtc: 100 })).toBeNull();
    expect((await mk('gt',  '99').evaluateWorkflowForDocument('invoice' as any, { totalTtc: 100 }))?.id).toBe('w1');
    expect((await mk('eq', '100').evaluateWorkflowForDocument('invoice' as any, { totalTtc: 100 }))?.id).toBe('w1');
  });
});

describe('evaluateWorkflowForDocument — champs non numériques', () => {
  it('compare les chaînes à l’identique (eq)', async () => {
    const svc = serviceWith([wf('w1', [t('clientType', 'eq', 'nouveau')])]);
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { clientType: 'nouveau' }))?.id).toBe('w1');
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { clientType: 'existant' })).toBeNull();
  });

  /**
   * Piège : `parseFloat('2026-01-15')` vaut 2026 — la valeur est donc traitée comme
   * NUMÉRIQUE et comparée à `parseFloat` du champ document. Une date est ainsi
   * réduite à son année, et tout déclencheur de date compare des années entre elles.
   * Ce test documente le comportement réel ; voir le rapport pour la portée.
   */
  it('DOCUMENTE : une valeur de type date est réduite à son année par parseFloat', async () => {
    const svc = serviceWith([wf('w1', [t('dueDate', 'gte', '2026-06-01')])]);
    // '2026-01-15' → 2026 ; seuil '2026-06-01' → 2026 ; donc 2026 >= 2026 → déclenche,
    // alors que le 15 janvier est ANTÉRIEUR au 1er juin.
    const hit = await svc.evaluateWorkflowForDocument('invoice' as any, { dueDate: '2026-01-15' });
    expect(hit?.id).toBe('w1'); // comportement actuel, contre-intuitif
  });

  it('un champ absent ou nul ne déclenche jamais', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '100')])]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, {})).toBeNull();
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: null })).toBeNull();
  });
});

describe('evaluateWorkflowForDocument — sélection du workflow', () => {
  it('ignore les workflows sans déclencheur pour ce type de document', async () => {
    const svc = serviceWith([wf('w1', [t('totalTtc', 'gte', '1', 'expense')])]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 999 })).toBeNull();
  });

  it('exige que TOUS les déclencheurs du workflow soient satisfaits', async () => {
    const svc = serviceWith([wf('w1', [
      t('totalTtc',  'gte', '1000000'),
      t('clientType', 'eq', 'nouveau'),
    ])]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 2_000_000, clientType: 'existant' })).toBeNull();
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 2_000_000, clientType: 'nouveau' }))?.id).toBe('w1');
  });

  it('retient le workflow de plus forte priorité quand plusieurs correspondent', async () => {
    const svc = serviceWith([
      wf('faible', [t('totalTtc', 'gte', '100')], 1),
      wf('forte',  [t('totalTtc', 'gte', '100')], 10),
    ]);
    expect((await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 500 }))?.id).toBe('forte');
  });

  it('renvoie null quand aucun workflow ne correspond', async () => {
    const svc = serviceWith([]);
    expect(await svc.evaluateWorkflowForDocument('invoice' as any, { totalTtc: 1 })).toBeNull();
  });
});
