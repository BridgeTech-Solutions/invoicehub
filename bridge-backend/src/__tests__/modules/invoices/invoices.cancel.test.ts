/**
 * Tests unitaires — InvoicesService.cancel + avoir auto
 *
 * Vérifie que l'annulation d'une facture émise crée automatiquement
 * un avoir (note de crédit) avec le bon montant, et que les statuts
 * non-annulables sont rejetés.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../jobs/queues', () => ({
  emailQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
}));

jest.mock('../../../lib/broadcast', () => ({
  broadcastNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../modules/dashboard/dashboard.service', () => ({
  DashboardService: { invalidateCache: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../lib/documentNumber', () => ({
  generateDocumentNumber: jest.fn().mockResolvedValue('BTS/DC/2026/01/FAC002'),
  getDefaultOfficeId: jest.fn().mockResolvedValue('office-uuid'),
}));

jest.mock('../../../lib/pdf', () => ({
  generatePdf: jest.fn(),
  buildDocumentHtml: jest.fn().mockReturnValue('<html/>'),
  imgToBase64: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { InvoicesService } from '../../../modules/invoices/invoices.service';
import { prisma } from '../../../config/database';

const invoicesService = new InvoicesService();

const mockInvoiceFindFirst  = prisma.invoice.findFirst as jest.Mock;
const mockInvoiceUpdate     = prisma.invoice.update as jest.Mock;
const mockInvoiceCreate     = prisma.invoice.create as jest.Mock;
const mockTransaction       = prisma.$transaction as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INVOICE = {
  id: 'invoice-uuid-001',
  number: 'BTS/DC/2026/01/FAC001',
  status: 'issued',
  type: 'standard',
  officeId: 'office-uuid',
  clientId: 'client-uuid',
  currency: 'XAF',
  subtotalHt: 100_000,
  globalDiscountType: 'none',
  globalDiscountValue: 0,
  globalDiscountAmount: 0,
  totalHt: 100_000,
  totalTax: 19_250,
  totalTtc: 119_250,
  amountDue: 119_250,
  amountPaid: 0,
  balanceDue: 119_250,
  deletedAt: null,
  assignedTo: null,
  lines: [],
  payments: [],
  statusHistory: [],
  client: { id: 'client-uuid', name: 'Camtel' },
};

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
}

// ── Tests : cancel → avoir auto ───────────────────────────────────────────────

describe('InvoicesService.cancel', () => {

  beforeEach(() => {
    setupTransaction();
    mockInvoiceFindFirst.mockResolvedValue(BASE_INVOICE);
    mockInvoiceUpdate.mockResolvedValue({ ...BASE_INVOICE, status: 'cancelled' });
    mockInvoiceCreate.mockResolvedValue({ id: 'avoir-uuid', type: 'avoir' });
  });

  describe('statuts annulables', () => {
    it('annule une facture "issued" et crée un avoir', async () => {
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
      );
      expect(mockInvoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'avoir' }) }),
      );
    });

    it('annule une facture "partially_paid" et crée un avoir', async () => {
      mockInvoiceFindFirst.mockResolvedValue({ ...BASE_INVOICE, status: 'partially_paid' });
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
      );
      expect(mockInvoiceCreate).toHaveBeenCalled();
    });

    it('annule une facture "overdue" et crée un avoir', async () => {
      mockInvoiceFindFirst.mockResolvedValue({ ...BASE_INVOICE, status: 'overdue' });
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceCreate).toHaveBeenCalled();
    });
  });

  describe('statuts non annulables', () => {
    it('rejette l\'annulation d\'une facture "draft" → 400', async () => {
      mockInvoiceFindFirst.mockResolvedValue({ ...BASE_INVOICE, status: 'draft' });
      await expect(invoicesService.cancel('invoice-uuid-001', 'user-uuid'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejette l\'annulation d\'une facture déjà "cancelled" → 400', async () => {
      mockInvoiceFindFirst.mockResolvedValue({ ...BASE_INVOICE, status: 'cancelled' });
      await expect(invoicesService.cancel('invoice-uuid-001', 'user-uuid'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejette l\'annulation d\'une facture "paid" → 400', async () => {
      mockInvoiceFindFirst.mockResolvedValue({ ...BASE_INVOICE, status: 'paid' });
      await expect(invoicesService.cancel('invoice-uuid-001', 'user-uuid'))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('contenu de l\'avoir', () => {
    it('l\'avoir a le même totalTtc que la facture annulée', async () => {
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalTtc: BASE_INVOICE.totalTtc,
            totalTax: BASE_INVOICE.totalTax,
            totalHt: BASE_INVOICE.totalHt,
          }),
        }),
      );
    });

    it('l\'avoir est lié à la facture annulée via creditedInvoiceId', async () => {
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ creditedInvoiceId: BASE_INVOICE.id }),
        }),
      );
    });

    it('l\'avoir a le même clientId que la facture annulée', async () => {
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid');
      expect(mockInvoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: BASE_INVOICE.clientId }),
        }),
      );
    });

    it('passe le motif d\'annulation dans les notes de l\'avoir', async () => {
      const reason = 'Erreur de facturation';
      await invoicesService.cancel('invoice-uuid-001', 'user-uuid', reason);
      expect(mockInvoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: reason }),
        }),
      );
    });
  });
});
