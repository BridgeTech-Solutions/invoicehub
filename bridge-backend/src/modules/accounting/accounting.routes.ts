import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './accounting.controller';

const router: Router = Router();
router.use(authenticate);

// ── Plan comptable ─────────────────────────────────────────────────────────────
router.get('/chart',                      authorizePermission('accounting:read'),  ctrl.getChart);
router.post('/chart',                     authorizePermission('accounting:create'), auditMiddleware('chart_account', 'CREATE'), ctrl.addChartAccount);
router.put('/chart/:accountNumber',       authorizePermission('accounting:create'), auditMiddleware('chart_account', 'UPDATE'), ctrl.updateChartAccount);

// ── Périodes fiscales ──────────────────────────────────────────────────────────
router.get('/periods',                    authorizePermission('accounting:read'),   ctrl.listPeriods);
router.post('/periods',                   authorizePermission('accounting:create'), ctrl.createPeriod);
router.get('/periods/:id',                authorizePermission('accounting:read'),   ctrl.getPeriod);
router.post('/periods/:id/close',         authorizePermission('accounting:close'),  auditMiddleware('fiscal_period', 'STATUS_CHANGE'), ctrl.closePeriod);
router.post('/periods/:id/lock',          authorizePermission('accounting:close'),  auditMiddleware('fiscal_period', 'STATUS_CHANGE'), ctrl.lockPeriod);

// ── Journaux ──────────────────────────────────────────────────────────────────
router.get('/journals',                   authorizePermission('accounting:read'),   ctrl.listJournals);
router.post('/journals',                  authorizePermission('accounting:create'), ctrl.createJournal);
router.get('/journals/:id',               authorizePermission('accounting:read'),   ctrl.getJournal);

// ── Écritures ─────────────────────────────────────────────────────────────────
router.get('/entries',                       authorizePermission('accounting:read'),     ctrl.listEntries);
router.post('/entries',                      authorizePermission('accounting:create'),   auditMiddleware('journal_entry', 'CREATE'),        ctrl.createEntry);
router.get('/entries/:id',                   authorizePermission('accounting:read'),     ctrl.getEntry);
router.put('/entries/:id',                   authorizePermission('accounting:create'),   auditMiddleware('journal_entry', 'UPDATE'),        ctrl.updateEntry);
router.delete('/entries/:id',                authorizePermission('accounting:create'),   auditMiddleware('journal_entry', 'DELETE'),        ctrl.deleteEntry);
router.post('/entries/:id/validate',         authorizePermission('accounting:validate'), auditMiddleware('journal_entry', 'STATUS_CHANGE'), ctrl.validateEntry);
router.post('/entries/:id/lock',             authorizePermission('accounting:close'),    auditMiddleware('journal_entry', 'STATUS_CHANGE'), ctrl.lockEntry);
router.post('/entries/:id/reverse',          authorizePermission('accounting:validate'), auditMiddleware('journal_entry', 'CREATE'),        ctrl.reverseEntry);

// ── Rapports / Grand livre ─────────────────────────────────────────────────────
router.get('/reports/balance',               authorizePermission('accounting:read'),   ctrl.getBalance);
router.get('/reports/ledger/:accountNumber', authorizePermission('accounting:read'),   ctrl.getAccountLedger);
router.get('/reports/export/sage',           authorizePermission('accounting:export'), ctrl.exportSage);
router.get('/reports/export/pdf',            authorizePermission('accounting:export'), ctrl.exportBalancePdf);

// ── Déclarations fiscales ──────────────────────────────────────────────────────
router.get('/tax-declarations',           authorizePermission('accounting:read'),     ctrl.listDeclarations);
router.post('/tax-declarations',          authorizePermission('accounting:create'),    ctrl.createDeclaration);
router.get('/tax-declarations/:id',       authorizePermission('accounting:read'),     ctrl.getDeclaration);
router.post('/tax-declarations/:id/submit', authorizePermission('accounting:validate'), ctrl.submitDeclaration);

// ── Lettrage ──────────────────────────────────────────────────────────────────
// /unlettered AVANT /:code pour éviter qu'Express interprète "unlettered" comme un param
router.get('/lettering/unlettered',       authorizePermission('accounting:read'),  ctrl.getUnletteredLines);
router.post('/lettering',                 authorizePermission('accounting:create'), auditMiddleware('lettering', 'CREATE'), ctrl.letterLines);
router.delete('/lettering/:code',         authorizePermission('accounting:create'), auditMiddleware('lettering', 'DELETE'), ctrl.deleteLettering);

export default router;
