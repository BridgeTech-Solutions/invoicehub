/**
 * Tests unitaires — PaymentsService.create + softDelete
 *
 * Vérifie les transitions de statut (issued → partially_paid → paid),
 * le rejet des paiements excessifs, et la restauration du statut après suppression.
 * Prisma est entièrement mocké — pas de DB nécessaire.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../jobs/queues', () => ({
  notificationQueue: { add: jest.fn() },
  emailQueue: { add: jest.fn() },
}));

jest.mock('../../../lib/broadcast', () => ({
  broadcastNotification: jest.fn(),
}));

jest.mock('../../../modules/dashboard/dashboard.service', () => ({
  DashboardService: { invalidateCache: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../lib/pdf', () => ({
  generatePdf: jest.fn(),
  buildReceiptHtml: jest.fn().mockReturnValue('<html/>'),
  imgToBase64: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { PaymentsService } from '../../../modules/payments/payments.service';
import { prisma } from '../../../config/database';

const paymentsService = new PaymentsService();

const mockInvoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const mockInvoiceUpdate    = prisma.invoice.update as jest.Mock;
const mockPaymentCreate    = prisma.payment.create as jest.Mock;
const mockPaymentFindFirst = prisma.payment.findFirst as jest.Mock;
const mockPaymentAggregate = prisma.payment.aggregate as jest.Mock;
const mockPaymentUpdate    = prisma.payment.update as jest.Mock;
const mockTransaction      = prisma.$transaction as jest.Mock;

const USER_ID = 'creator-uuid';

// Simule prisma.$transaction en appelant le callback avec prisma lui-même
function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
    return fn(prisma);
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-uuid',
    number: 'BTS/DC/2026/01/FAC001',
    status: 'issued',
    amountDue: 100_000,
    amountPaid: 0,
    balanceDue: 100_000,
    currency: 'XAF',
    clientId: 'client-uuid',
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-uuid',
    invoiceId: 'invoice-uuid',
    amount: 100_000,
    method: 'virement',
    paymentDate: new Date(),
    ...overrides,
  };
}

// ── Tests : PaymentsService.create ────────────────────────────────────────────

describe('PaymentsService.create', () => {

  beforeEach(() => {
    setupTransaction();
    mockInvoiceUpdate.mockResolvedValue({});
  });

  describe('facture introuvable / statut non payable', () => {
    it('lève 404 si la facture n\'existe pas', async () => {
      mockInvoiceFindFirst.mockResolvedValue(null);
      await expect(
        paymentsService.create('inexistant', { amount: 1000, method: 'especes', paymentDate: new Date() }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lève 400 si la facture est en statut draft', async () => {
      mockInvoiceFindFirst.mockResolvedValue(makeInvoice({ status: 'draft' }));
      await expect(
        paymentsService.create('invoice-uuid', { amount: 1000, method: 'especes', paymentDate: new Date() }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lève 400 si la facture est annulée', async () => {
      mockInvoiceFindFirst.mockResolvedValue(makeInvoice({ status: 'cancelled' }));
      await expect(
        paymentsService.create('invoice-uuid', { amount: 1000, method: 'especes', paymentDate: new Date() }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lève 400 si la facture est déjà payée', async () => {
      mockInvoiceFindFirst.mockResolvedValue(makeInvoice({ status: 'paid' }));
      await expect(
        paymentsService.create('invoice-uuid', { amount: 1000, method: 'especes', paymentDate: new Date() }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('montant excessif', () => {
    it('lève 400 si le montant dépasse le solde dû', async () => {
      mockInvoiceFindFirst.mockResolvedValue(makeInvoice({ balanceDue: 50_000 }));
      await expect(
        paymentsService.create('invoice-uuid', { amount: 99_999, method: 'especes', paymentDate: new Date() }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('paiement total → statut paid', () => {
    it('passe la facture à "paid" après paiement intégral', async () => {
      const invoice = makeInvoice({ status: 'issued', amountDue: 100_000, amountPaid: 0, balanceDue: 100_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 100_000 }));

      await paymentsService.create('invoice-uuid', { amount: 100_000, method: 'virement', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'paid', balanceDue: 0 }),
        }),
      );
    });

    it('remet reminderEscalationLevel à 0 quand payée', async () => {
      const invoice = makeInvoice({ status: 'overdue', amountDue: 100_000, amountPaid: 0, balanceDue: 100_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 100_000 }));

      await paymentsService.create('invoice-uuid', { amount: 100_000, method: 'especes', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reminderEscalationLevel: 0 }),
        }),
      );
    });
  });

  describe('paiement partiel → statut partially_paid', () => {
    it('passe la facture à "partially_paid" après paiement partiel', async () => {
      const invoice = makeInvoice({ status: 'issued', amountDue: 100_000, amountPaid: 0, balanceDue: 100_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 40_000 }));

      await paymentsService.create('invoice-uuid', { amount: 40_000, method: 'especes', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'partially_paid',
            amountPaid: 40_000,
            balanceDue: 60_000,
          }),
        }),
      );
    });

    it('une facture overdue reste "overdue" après paiement partiel', async () => {
      const invoice = makeInvoice({ status: 'overdue', amountDue: 100_000, amountPaid: 0, balanceDue: 100_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 40_000 }));

      await paymentsService.create('invoice-uuid', { amount: 40_000, method: 'especes', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'overdue' }),
        }),
      );
    });

    it('une facture overdue passe à "paid" après paiement total', async () => {
      const invoice = makeInvoice({ status: 'overdue', amountDue: 100_000, amountPaid: 0, balanceDue: 100_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 100_000 }));

      await paymentsService.create('invoice-uuid', { amount: 100_000, method: 'especes', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'paid' }),
        }),
      );
    });
  });

  describe('factures partiellement payées', () => {
    it('cumule correctement les paiements successifs', async () => {
      const invoice = makeInvoice({ status: 'partially_paid', amountDue: 100_000, amountPaid: 40_000, balanceDue: 60_000 });
      mockInvoiceFindFirst.mockResolvedValue(invoice);
      mockPaymentCreate.mockResolvedValue(makePayment({ amount: 60_000 }));

      await paymentsService.create('invoice-uuid', { amount: 60_000, method: 'especes', paymentDate: new Date() }, USER_ID);

      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'paid', amountPaid: 100_000, balanceDue: 0 }),
        }),
      );
    });
  });
});

// ── Tests : PaymentsService.softDelete ────────────────────────────────────────

describe('PaymentsService.softDelete', () => {
  beforeEach(() => {
    setupTransaction();
    mockInvoiceUpdate.mockResolvedValue({});
    mockPaymentUpdate.mockResolvedValue({});
  });

  it('lève 404 si le paiement n\'existe pas', async () => {
    mockPaymentFindFirst.mockResolvedValue(null);
    await expect(paymentsService.softDelete('inexistant')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('repasse à "issued" si tous les paiements sont supprimés (amountPaid = 0)', async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: 'payment-uuid', invoiceId: 'invoice-uuid', amount: 100_000,
      invoice: makeInvoice({ status: 'paid', amountDue: 100_000 }),
    });
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: null } }); // Plus aucun paiement

    await paymentsService.softDelete('payment-uuid');

    expect(mockInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'issued', amountPaid: 0 }),
      }),
    );
  });

  it('repasse à "partially_paid" s\'il reste un solde après suppression', async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: 'payment-uuid', invoiceId: 'invoice-uuid', amount: 60_000,
      invoice: makeInvoice({ status: 'paid', amountDue: 100_000 }),
    });
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: 40_000 } }); // Reste 40 000

    await paymentsService.softDelete('payment-uuid');

    expect(mockInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'partially_paid', amountPaid: 40_000 }),
      }),
    );
  });
});
