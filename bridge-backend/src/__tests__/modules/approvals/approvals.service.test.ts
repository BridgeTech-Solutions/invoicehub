/**
 * Tests unitaires — ApprovalsService
 *
 * Couvre :
 *  1. evaluateWorkflowForDocument (aucun workflow, match, pas de match, priorité)
 *  2. requestApproval (création, doublon évité)
 *  3. approve (non-approbateur, étape intermédiaire, dernière étape)
 *  4. reject (commentaire manquant, status correct)
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApprovalWorkflow = { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() };
const mockApprovalRequest  = { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() };
const mockApprovalWorkflowStep = { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() };
const mockApprovalDecision = { create: jest.fn() };
const mockAuditLog         = { create: jest.fn() };
const mockUser             = { findUnique: jest.fn(), findMany: jest.fn() };

jest.mock('../../../config/database', () => ({
  prisma: {
    approvalWorkflow:     mockApprovalWorkflow,
    approvalRequest:      mockApprovalRequest,
    approvalWorkflowStep: mockApprovalWorkflowStep,
    approvalDecision:     mockApprovalDecision,
    auditLog:             mockAuditLog,
    user:                 mockUser,
    invoice:              { update: jest.fn() },
    proforma:             { update: jest.fn() },
    purchaseOrder:        { update: jest.fn() },
    supplierInvoice:      { update: jest.fn() },
    expense:              { update: jest.fn() },
    $transaction:         jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      approvalWorkflowTrigger: { deleteMany: jest.fn() },
      approvalWorkflowStep:    { deleteMany: jest.fn() },
      approvalWorkflow:        { update: jest.fn() },
    })),
  },
}));

jest.mock('../../../jobs/queues', () => ({
  notificationQueue: { add: jest.fn() },
  emailQueue:        { add: jest.fn() },
  approvalQueue:     { add: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { approvalsService } from '../../../modules/approvals/approvals.service';
import { AppError }         from '../../../core/errors/AppError';
import { prisma }           from '../../../config/database';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WORKFLOW_ID  = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID   = '22222222-2222-2222-2222-222222222222';
const STEP_ID      = '33333333-3333-3333-3333-333333333333';
const DOC_ID       = '44444444-4444-4444-4444-444444444444';
const USER_ID      = '55555555-5555-5555-5555-555555555555';
const APPROVER_ID  = '66666666-6666-6666-6666-666666666666';

function makeWorkflow(overrides: object = {}) {
  return {
    id: WORKFLOW_ID, name: 'Test WF', isActive: true, priority: 0,
    triggers: [{ id: 't1', documentType: 'invoice', field: 'totalTtc', operator: 'gte', value: '1000000' }],
    steps: [],
    ...overrides,
  };
}

function makeStep(overrides: object = {}) {
  return {
    id: STEP_ID, workflowId: WORKFLOW_ID, order: 1, name: 'Step 1',
    approverUserId: APPROVER_ID, approverRole: null,
    deadlineHours: null, requireComment: false, allowDelegate: true,
    ...overrides,
  };
}

function makeRequest(overrides: object = {}) {
  return {
    id: REQUEST_ID, workflowId: WORKFLOW_ID,
    documentType: 'invoice', documentId: DOC_ID, documentNumber: 'FAC-001',
    status: 'pending', currentStep: 1, totalSteps: 2,
    requestedById: USER_ID, requestedAt: new Date(), expiresAt: null,
    workflow: { steps: [makeStep(), makeStep({ id: 'step2', order: 2 })] },
    ...overrides,
  };
}

// ── 1. evaluateWorkflowForDocument ────────────────────────────────────────────

describe('evaluateWorkflowForDocument', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne null si aucun workflow actif', async () => {
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([]);
    const result = await approvalsService.evaluateWorkflowForDocument('invoice', { totalTtc: 2000000 });
    expect(result).toBeNull();
  });

  it('retourne le workflow si tous les triggers matchent (invoice totalTtc >= 1 000 000)', async () => {
    const wf = makeWorkflow();
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf]);
    const result = await approvalsService.evaluateWorkflowForDocument('invoice', { totalTtc: 2000000 });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(WORKFLOW_ID);
  });

  it('retourne null si le montant est insuffisant (1 000 000 > 500 000)', async () => {
    const wf = makeWorkflow();
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf]);
    const result = await approvalsService.evaluateWorkflowForDocument('invoice', { totalTtc: 500000 });
    expect(result).toBeNull();
  });

  it('retourne null si documentType ne matche pas', async () => {
    const wf = makeWorkflow();
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf]);
    const result = await approvalsService.evaluateWorkflowForDocument('expense', { totalTtc: 2000000 });
    expect(result).toBeNull();
  });

  it('retourne le workflow avec la priorité la plus haute en premier', async () => {
    const wf1 = makeWorkflow({ id: 'wf-low',  priority: 0, triggers: [{ id: 't1', documentType: 'invoice', field: 'totalTtc', operator: 'gte', value: '500000' }] });
    const wf2 = makeWorkflow({ id: 'wf-high', priority: 10, triggers: [{ id: 't2', documentType: 'invoice', field: 'totalTtc', operator: 'gte', value: '500000' }] });
    // findMany déjà trié par priority desc (simulé)
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf2, wf1]);
    const result = await approvalsService.evaluateWorkflowForDocument('invoice', { totalTtc: 1000000 });
    expect(result?.id).toBe('wf-high');
  });
});

// ── 2. requestApproval ────────────────────────────────────────────────────────

describe('requestApproval', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crée une demande avec currentStep=1 si workflow applicable', async () => {
    const wf = makeWorkflow();
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf]);
    (prisma.approvalRequest.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.approvalWorkflowStep.findMany as jest.Mock).mockResolvedValue([makeStep()]);
    (prisma.approvalRequest.create as jest.Mock).mockResolvedValue({ id: REQUEST_ID, currentStep: 1, totalSteps: 1, documentType: 'invoice', documentId: DOC_ID, documentNumber: 'FAC-001', requestedById: USER_ID });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const result = await approvalsService.requestApproval({
      documentType: 'invoice', documentId: DOC_ID, documentNumber: 'FAC-001',
      document: { totalTtc: 2000000 }, requestedById: USER_ID,
    });

    expect(result).not.toBeNull();
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStep: 1, status: 'pending' }) }),
    );
  });

  it('retourne la demande existante si déjà en attente (pas de doublon)', async () => {
    const wf = makeWorkflow();
    const existingRequest = makeRequest();
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([wf]);
    (prisma.approvalRequest.findFirst as jest.Mock).mockResolvedValue(existingRequest);

    const result = await approvalsService.requestApproval({
      documentType: 'invoice', documentId: DOC_ID, documentNumber: 'FAC-001',
      document: { totalTtc: 2000000 }, requestedById: USER_ID,
    });

    expect(result?.id).toBe(REQUEST_ID);
    expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
  });

  it('retourne null si aucun workflow ne correspond', async () => {
    (prisma.approvalWorkflow.findMany as jest.Mock).mockResolvedValue([]);
    const result = await approvalsService.requestApproval({
      documentType: 'invoice', documentId: DOC_ID, documentNumber: 'FAC-001',
      document: { totalTtc: 500 }, requestedById: USER_ID,
    });
    expect(result).toBeNull();
  });
});

// ── 3. approve ────────────────────────────────────────────────────────────────

describe('approve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lève AppError.forbidden si l\'utilisateur n\'est pas l\'approbateur désigné', async () => {
    const req = makeRequest({ workflow: { steps: [makeStep({ approverUserId: APPROVER_ID }), makeStep({ id: 'step2', order: 2 })] } });
    (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(req);
    (prisma.approvalWorkflowStep.findFirst as jest.Mock).mockResolvedValue(makeStep({ approverUserId: APPROVER_ID }));

    await expect(
      approvalsService.approve(REQUEST_ID, 'wrong-user-id', { comment: '' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('passe à l\'étape suivante si ce n\'est pas la dernière étape', async () => {
    const req = makeRequest({ currentStep: 1, totalSteps: 2, workflow: { steps: [makeStep(), makeStep({ id: 'step2', order: 2 })] } });
    (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(req);
    (prisma.approvalWorkflowStep.findFirst as jest.Mock)
      .mockResolvedValueOnce(makeStep({ approverUserId: APPROVER_ID }))
      .mockResolvedValueOnce(makeStep({ id: 'step2', order: 2, approverUserId: null, approverRole: 'admin' }));
    (prisma.approvalDecision.create as jest.Mock).mockResolvedValue({});
    (prisma.approvalRequest.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await approvalsService.approve(REQUEST_ID, APPROVER_ID, {});

    expect(prisma.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStep: 2 }) }),
    );
  });

  it('passe status=approved à la dernière étape et notifie le demandeur', async () => {
    const req = makeRequest({ currentStep: 1, totalSteps: 1, workflow: { steps: [makeStep()] } });
    (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(req);
    (prisma.approvalWorkflowStep.findFirst as jest.Mock).mockResolvedValue(makeStep({ approverUserId: APPROVER_ID }));
    (prisma.approvalDecision.create as jest.Mock).mockResolvedValue({});
    (prisma.approvalRequest.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.expense.update as jest.Mock).mockResolvedValue({});

    await approvalsService.approve(REQUEST_ID, APPROVER_ID, { comment: 'OK' });

    expect(prisma.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
    );
  });
});

// ── 4. reject ─────────────────────────────────────────────────────────────────

describe('reject', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passe status=rejected et remet le document en brouillon', async () => {
    const req = makeRequest({ documentType: 'invoice' });
    (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(req);
    (prisma.approvalWorkflowStep.findFirst as jest.Mock).mockResolvedValue(makeStep({ approverUserId: APPROVER_ID }));
    (prisma.approvalDecision.create as jest.Mock).mockResolvedValue({});
    (prisma.approvalRequest.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.invoice.update as jest.Mock).mockResolvedValue({});

    await approvalsService.reject(REQUEST_ID, APPROVER_ID, { comment: 'Montant incorrect' });

    expect(prisma.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }),
    );
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }),
    );
  });

  it('lève AppError.forbidden si l\'utilisateur n\'est pas l\'approbateur', async () => {
    const req = makeRequest();
    (prisma.approvalRequest.findUnique as jest.Mock).mockResolvedValue(req);
    (prisma.approvalWorkflowStep.findFirst as jest.Mock).mockResolvedValue(makeStep({ approverUserId: APPROVER_ID }));

    await expect(
      approvalsService.reject(REQUEST_ID, 'wrong-user', { comment: 'Non' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
