/**
 * @module modules/reports/reports.routes
 * Routes des rapports financiers.
 *
 * Tous les endpoints acceptent ?format=json (défaut), ?format=csv ou ?format=pdf
 * GET /api/reports/revenue       — CA mensuel
 * GET /api/reports/by-client     — CA par client
 * GET /api/reports/by-category   — CA par catégorie
 * GET /api/reports/unpaid        — Factures impayées
 * GET /api/reports/payments      — Journal des encaissements
 * GET /api/reports/by-method     — Encaissements par méthode
 * GET /api/reports/tax-summary   — Récapitulatif TVA
 * GET /api/reports/aging         — Vieillissement des impayés
 */
import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const reportsRouter: ReturnType<typeof Router> = Router();

reportsRouter.use(authenticate, authorizePermission('reports:read'));

reportsRouter.get('/revenue',     reportsController.getRevenue.bind(reportsController));
reportsRouter.get('/by-client',   reportsController.getByClient.bind(reportsController));
reportsRouter.get('/by-category', reportsController.getByCategory.bind(reportsController));
reportsRouter.get('/unpaid',      reportsController.getUnpaid.bind(reportsController));
reportsRouter.get('/payments',    reportsController.getPayments.bind(reportsController));
reportsRouter.get('/by-method',   reportsController.getByMethod.bind(reportsController));
reportsRouter.get('/tax-summary', reportsController.getTaxSummary.bind(reportsController));
reportsRouter.get('/aging',       reportsController.getAging.bind(reportsController));
