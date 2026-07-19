/**
 * Tests d'intégration du workflow d'approbation — PostgreSQL réel.
 *
 * Cible principale : la DÉLÉGATION. `ApprovalWorkflowStep` est un TEMPLATE PARTAGÉ
 * par tous les documents d'un même workflow. Déléguer en mutant ce template
 * réaffecterait l'étape pour TOUS les documents en cours — c'est le défaut corrigé
 * précédemment, jamais couvert par un test. On vérifie ici que la délégation reste
 * confinée à sa demande.
 *
 * Files BullMQ et EventEmitter simulés : aucune notification n'est écrite en base.
 * Toutes les données créées sont préfixées et supprimées en sortie.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ApprovalsService } from './approvals.service';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const RUN = !!process.env['DATABASE_URL'];

(RUN ? describe : describe.skip)('ApprovalsService — intégration (PostgreSQL réel)', () => {
  const prisma    = new PrismaClient();
  const notifQ    = { add: jest.fn(async () => ({ id: 'job' })) };
  const emailQ    = { add: jest.fn(async () => ({ id: 'job' })) };
  const emitter   = { emitAsync: jest.fn(async () => [] as unknown[]), emit: jest.fn() };
  const service   = new ApprovalsService(prisma as any, notifQ as any, emailQ as any, emitter as any);

  const RUN_ID = randomUUID().slice(0, 8);
  const TAG    = `__TEST_APPROVALS_${RUN_ID}__`;

  const createdWorkflowIds: string[] = [];
  let approverA = '';   // approbateur désigné du template
  let delegatee = '';   // destinataire de la délégation
  let requester = '';

  beforeAll(async () => {
    await prisma.$connect();
    const users = await prisma.user.findMany({ select: { id: true }, take: 3, orderBy: { createdAt: 'asc' } });
    if (users.length < 3) throw new Error('3 utilisateurs requis en base pour ces tests');
    [approverA, delegatee, requester] = [users[0]!.id, users[1]!.id, users[2]!.id];
  });

  afterAll(async () => {
    try {
      if (createdWorkflowIds.length) {
        const reqs = await prisma.approvalRequest.findMany({
          where: { workflowId: { in: createdWorkflowIds } }, select: { id: true },
        });
        const reqIds = reqs.map((r) => r.id);
        if (reqIds.length) {
          await prisma.approvalDecision.deleteMany({ where: { requestId: { in: reqIds } } });
          await prisma.auditLog.deleteMany({ where: { entityType: 'approval_request', entityId: { in: reqIds } } });
          await prisma.approvalRequest.deleteMany({ where: { id: { in: reqIds } } });
        }
        await prisma.approvalWorkflowStep.deleteMany({ where: { workflowId: { in: createdWorkflowIds } } });
        await prisma.approvalWorkflowTrigger.deleteMany({ where: { workflowId: { in: createdWorkflowIds } } });
        await prisma.approvalWorkflow.deleteMany({ where: { id: { in: createdWorkflowIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  /** Workflow de test : `steps` niveaux, tous confiés à `approverA`, délégation permise. */
  async function makeWorkflow(name: string, steps = 1) {
    const wf = await prisma.approvalWorkflow.create({
      data: {
        name: `${TAG}${name}`, isActive: true,
        // Priorité très haute pour primer sur les workflows réels de la base :
        // sans cela, `evaluateWorkflowForDocument` pourrait retenir un autre workflow.
        priority: 9_999,
        triggers: { create: [{ documentType: 'expense', field: 'amountTtc', operator: 'gte', value: '0' }] },
        steps: {
          create: Array.from({ length: steps }, (_, i) => ({
            order: i + 1, name: `Niveau ${i + 1}`,
            approverUserId: approverA, allowDelegate: true, requireComment: false,
          })),
        },
      },
    });
    createdWorkflowIds.push(wf.id);
    return wf;
  }

  /** Demande d'approbation sur un document fictif (aucune ligne document requise). */
  async function makeRequest(label: string) {
    const documentId = randomUUID();
    const req = await service.requestApproval({
      documentType:   'expense' as any,
      documentId,
      documentNumber: `${TAG}${label}`,
      document:       { id: documentId, amountTtc: 500_000 },
      requestedById:  requester,
    });
    if (!req) throw new Error('Aucun workflow déclenché — vérifier le trigger de test');
    return req;
  }

  // ── Routage de base ───────────────────────────────────────────────────────

  it('seul l’approbateur désigné peut décider', async () => {
    await makeWorkflow('routage');
    const req = await makeRequest('R1');

    await expect(service.approve(req.id, delegatee, {} as any))
      .rejects.toThrow(/n'êtes pas l'approbateur/i);

    await expect(service.approve(req.id, approverA, {} as any)).resolves.toBeUndefined();

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe('approved');
  });

  // ── Délégation ────────────────────────────────────────────────────────────

  describe('délégation', () => {
    it('transfère le pouvoir de décision au délégataire', async () => {
      await makeWorkflow('delegation');
      const req = await makeRequest('R2');

      await service.delegate(req.id, approverA, { delegatedToId: delegatee } as any);

      // Le délégataire peut désormais approuver…
      await expect(service.approve(req.id, delegatee, {} as any)).resolves.toBeUndefined();
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('approved');
    });

    it('retire le pouvoir de décision au délégant', async () => {
      await makeWorkflow('delegation-retrait');
      const req = await makeRequest('R3');

      await service.delegate(req.id, approverA, { delegatedToId: delegatee } as any);

      await expect(service.approve(req.id, approverA, {} as any))
        .rejects.toThrow(/n'êtes pas l'approbateur/i);
    });

    /**
     * RÉGRESSION CENTRALE — le template `ApprovalWorkflowStep` est partagé. Déléguer
     * sur une demande ne doit RIEN changer pour les autres documents du même workflow.
     */
    it('ne contamine pas les autres demandes du même workflow', async () => {
      const wf  = await makeWorkflow('isolation');
      const rA  = await makeRequest('R4-A');
      const rB  = await makeRequest('R4-B');

      await service.delegate(rA.id, approverA, { delegatedToId: delegatee } as any);

      // Sur la demande B, l'approbateur d'origine doit rester compétent…
      await expect(service.approve(rB.id, approverA, {} as any)).resolves.toBeUndefined();
      // …et le délégataire de A ne doit avoir aucun pouvoir sur B.
      const rC = await makeRequest('R4-C');
      await expect(service.approve(rC.id, delegatee, {} as any))
        .rejects.toThrow(/n'êtes pas l'approbateur/i);

      // Le template lui-même n'a pas bougé.
      const steps = await prisma.approvalWorkflowStep.findMany({ where: { workflowId: wf.id } });
      expect(steps.every((s) => s.approverUserId === approverA)).toBe(true);
    });

    it('la re-délégation donne la main au dernier délégataire', async () => {
      await makeWorkflow('re-delegation');
      const req = await makeRequest('R5');

      await service.delegate(req.id, approverA, { delegatedToId: delegatee } as any);
      await service.delegate(req.id, delegatee, { delegatedToId: requester } as any);

      await expect(service.approve(req.id, delegatee, {} as any))
        .rejects.toThrow(/n'êtes pas l'approbateur/i);
      await expect(service.approve(req.id, requester, {} as any)).resolves.toBeUndefined();
    });

    it('refuse un délégataire inexistant', async () => {
      await makeWorkflow('delegataire-inconnu');
      const req = await makeRequest('R6');

      await expect(service.delegate(req.id, approverA, { delegatedToId: randomUUID() } as any))
        .rejects.toThrow(/introuvable/i);
    });
  });

  // ── Parcours multi-niveaux ────────────────────────────────────────────────

  describe('workflow à plusieurs niveaux', () => {
    it('avance d’un niveau à l’autre et ne conclut qu’au dernier', async () => {
      await makeWorkflow('multi', 2);
      const req = await makeRequest('R7');
      expect(req.totalSteps).toBe(2);
      expect(req.currentStep).toBe(1);

      await service.approve(req.id, approverA, {} as any);

      const mid = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
      expect(mid.currentStep).toBe(2);
      expect(mid.status).toBe('pending'); // toujours en cours

      await service.approve(req.id, approverA, {} as any);

      const end = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
      expect(end.status).toBe('approved');
      expect(end.resolvedAt).not.toBeNull();
    });

    it('une délégation ne vaut que pour son niveau', async () => {
      await makeWorkflow('delegation-par-niveau', 2);
      const req = await makeRequest('R8');

      await service.delegate(req.id, approverA, { delegatedToId: delegatee } as any);
      await service.approve(req.id, delegatee, {} as any); // niveau 1 délégué

      // Au niveau 2, l'approbateur du template reprend la main.
      await expect(service.approve(req.id, delegatee, {} as any))
        .rejects.toThrow(/n'êtes pas l'approbateur/i);
      await expect(service.approve(req.id, approverA, {} as any)).resolves.toBeUndefined();
    });
  });

  // ── Rejet et clôture ──────────────────────────────────────────────────────

  it('un rejet clôt la demande sans passer au niveau suivant', async () => {
    await makeWorkflow('rejet', 2);
    const req = await makeRequest('R9');

    await service.reject(req.id, approverA, { comment: 'Montant injustifié' } as any);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe('rejected');
    expect(after.currentStep).toBe(1); // pas d'avancement
  });

  it('une demande déjà résolue ne peut plus être décidée', async () => {
    await makeWorkflow('deja-resolue');
    const req = await makeRequest('R10');

    await service.approve(req.id, approverA, {} as any);
    await expect(service.approve(req.id, approverA, {} as any)).rejects.toThrow();
    await expect(service.reject(req.id, approverA, { comment: 'x' } as any)).rejects.toThrow();
  });

  it('ne crée pas de doublon si une demande est déjà en cours sur le document', async () => {
    await makeWorkflow('doublon');
    const documentId = randomUUID();
    const payload = {
      documentType: 'expense' as any, documentId, documentNumber: `${TAG}R11`,
      document: { id: documentId, amountTtc: 500_000 }, requestedById: requester,
    };

    const first  = await service.requestApproval(payload);
    const second = await service.requestApproval(payload);
    expect(second!.id).toBe(first!.id);
  });
});
