/**
 * @module modules/reports/reports.routes
 * Routes des rapports financiers.
 *
 * Tous les endpoints acceptent ?format=json (défaut) ou ?format=csv
 * GET /api/reports/revenue
 * GET /api/reports/by-client
 * GET /api/reports/by-category
 * GET /api/reports/unpaid
 * GET /api/reports/payments
 * GET /api/reports/tax-summary
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from './reports.service';
import { sendCsvResponse } from '../../lib/csv';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

export const reportsRouter = Router();

reportsRouter.use(authenticate, authorize('admin', 'commercial'));

const rangeSchema = z.object({
  dateFrom:  z.coerce.date().optional(),
  dateTo:    z.coerce.date().optional(),
  year:      z.coerce.number().int().min(2000).max(2100).optional(),
  quarter:   z.coerce.number().int().min(1).max(4).optional(),
  format:    z.enum(['json', 'csv']).default('json'),
});

reportsRouter.get('/revenue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenue(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-mensuel.csv',
        ['Mois', 'Total HT', 'TVA', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.month, r.totalHt, r.totalTax, r.totalTtc, r.count]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/by-client', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenueByClient(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-clients.csv',
        ['Client', 'Email', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Solde dû', 'Nb Factures'],
        data.map(r => [r.client.name, r.client.email, r.totalHt, r.totalTax, r.totalTtc, r.amountPaid, r.balanceDue, r.invoiceCount]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/by-category', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenueByCategory(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-categories.csv',
        ['Catégorie', 'Total HT', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.category, r.totalHt, r.totalTtc, r.invoiceCount]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/unpaid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format } = rangeSchema.parse(req.query);
    const data = await reportsService.getUnpaid();

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-impayes.csv',
        ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Total TTC', 'Solde dû', 'Statut'],
        data.map(r => [
          r.number, r.client.name, r.client.email,
          r.issueDate.toISOString().slice(0, 10),
          r.dueDate.toISOString().slice(0, 10),
          Number(r.totalTtc), Number(r.balanceDue), r.status,
        ]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getPayments(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-encaissements.csv',
        ['Date', 'Facture', 'Client', 'Méthode', 'Montant', 'Référence'],
        data.map(r => [
          r.paymentDate.toISOString().slice(0, 10),
          r.invoice.number, r.invoice.client.name,
          r.method, Number(r.amount), r.reference ?? '',
        ]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/tax-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getTaxSummary(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-tva.csv',
        ['Période', 'Base HT', 'TVA collectée', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.period, r.totalHt, r.totalTax, r.totalTtc, r.count]),
      );
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
