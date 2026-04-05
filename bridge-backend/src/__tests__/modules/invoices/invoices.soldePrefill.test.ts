/**
 * Tests unitaires — InvoicesService.soldePrefill
 *
 * Vérifie que le montant du solde est correctement calculé :
 *   soldeTtc = totalTtc acompte - somme des paiements sur tous les acomptes du cycle
 * Et que les garde-fous fonctionnent (double solde, facture non-acompte).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
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
  generateDocumentNumber: jest.fn().mockResolvedValue('BTS/DC/2026/01/FAC003'),
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

const mockInvoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const mockInvoiceFindMany  = prisma.invoice.findMany as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACOMPTE = {
  id: 'acompte-root-uuid',
  number: 'BTS/DC/2026/01/FAC001',
  type: 'acompte',
  status: 'issued',
  parentInvoiceId: null,
  deletedAt: null,
  totalTtc: 500_000,
  clientId: 'client-uuid',
  officeId: 'office-uuid',
  client: { id: 'client-uuid', name: 'Camtel' },
  lines: [
    {
      id: 'line-1',
      sortOrder: 0,
      designation: 'Prestation A',
      description: null,
      unit: 'forfait',
      quantity: 1,
      unitPriceHt: 421_941,
      discountType: 'none',
      discountValue: 0,
      taxRate: 19.25,
      productId: null,
      hideDetails: false,
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvoicesService.soldePrefill', () => {

  describe('garde-fous', () => {
    it('lève 404 si l\'acompte est introuvable', async () => {
      mockInvoiceFindFirst.mockResolvedValueOnce(null);
      await expect(invoicesService.soldePrefill('inexistant')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lève 400 si la facture n\'est pas de type acompte', async () => {
      mockInvoiceFindFirst.mockResolvedValueOnce({ ...ACOMPTE, type: 'standard' });
      await expect(invoicesService.soldePrefill('acompte-root-uuid')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lève 400 si un solde non-annulé existe déjà', async () => {
      mockInvoiceFindFirst.mockResolvedValueOnce(ACOMPTE);
      mockInvoiceFindMany.mockResolvedValueOnce([{ ...ACOMPTE, payments: [] }]);
      // Deuxième findFirst : solde existant
      mockInvoiceFindFirst.mockResolvedValueOnce({ id: 'solde-uuid', number: 'BTS/DC/2026/01/FAC002' });
      await expect(invoicesService.soldePrefill('acompte-root-uuid')).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('calcul du montant solde', () => {
    it('soldeTtc = totalTtc - acomptes encaissés (acompte simple)', async () => {
      // Acompte root avec 200 000 encaissés → solde = 500 000 - 200 000 = 300 000
      mockInvoiceFindFirst
        .mockResolvedValueOnce(ACOMPTE)    // findFirst pour l'acompte
        .mockResolvedValueOnce(null);       // findFirst pour vérifier solde existant

      mockInvoiceFindMany.mockResolvedValueOnce([
        {
          ...ACOMPTE,
          payments: [{ amount: 200_000, paymentDate: new Date(), method: 'bank_transfer' }],
        },
      ]);

      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.summary.soldeTtc).toBe(300_000);
    });

    it('soldeTtc = 0 si acomptes couvrent tout le montant', async () => {
      mockInvoiceFindFirst
        .mockResolvedValueOnce(ACOMPTE)
        .mockResolvedValueOnce(null);

      mockInvoiceFindMany.mockResolvedValueOnce([
        {
          ...ACOMPTE,
          payments: [{ amount: 500_000, paymentDate: new Date(), method: 'bank_transfer' }],
        },
      ]);

      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.summary.soldeTtc).toBe(0);
    });

    it('cumule les paiements de plusieurs acomptes du même cycle', async () => {
      // Root : 150 000 encaissés, Enfant : 100 000 encaissés → solde = 500 000 - 250 000 = 250 000
      const enfant = { ...ACOMPTE, id: 'acompte-child-uuid', parentInvoiceId: ACOMPTE.id };
      mockInvoiceFindFirst
        .mockResolvedValueOnce(ACOMPTE)
        .mockResolvedValueOnce(null);

      mockInvoiceFindMany.mockResolvedValueOnce([
        { ...ACOMPTE, payments: [{ amount: 150_000, paymentDate: new Date(), method: 'cash' }] },
        { ...enfant,  payments: [{ amount: 100_000, paymentDate: new Date(), method: 'cash' }] },
      ]);

      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.summary.soldeTtc).toBe(250_000);
    });

    it('ignore les paiements à 0 (acompte sans encaissement)', async () => {
      mockInvoiceFindFirst
        .mockResolvedValueOnce(ACOMPTE)
        .mockResolvedValueOnce(null);

      mockInvoiceFindMany.mockResolvedValueOnce([
        { ...ACOMPTE, payments: [] }, // Aucun paiement
      ]);

      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.summary.soldeTtc).toBe(500_000); // Solde = montant total
    });
  });

  describe('données pré-remplies', () => {
    beforeEach(() => {
      mockInvoiceFindFirst
        .mockResolvedValueOnce(ACOMPTE)
        .mockResolvedValueOnce(null);
      mockInvoiceFindMany.mockResolvedValueOnce([
        { ...ACOMPTE, payments: [{ amount: 100_000, paymentDate: new Date(), method: 'cash' }] },
      ]);
    });

    it('retourne les lignes de l\'acompte', async () => {
      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.prefill.lines).toHaveLength(1);
      expect(result.prefill.lines[0].designation).toBe('Prestation A');
    });

    it('retourne le clientId', async () => {
      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(result.prefill.clientId).toBe('client-uuid');
    });

    it('retourne la liste des acomptes avec leurs paiements', async () => {
      const result = await invoicesService.soldePrefill('acompte-root-uuid');
      expect(Array.isArray(result.summary.acomptes)).toBe(true);
      expect(result.summary.acomptes).toHaveLength(1);
    });
  });
});
