import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './bank.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router: Router = Router();
router.use(authenticate);

// ── Résumé ────────────────────────────────────────────────────────────────────
router.get('/summary', authorizePermission('bank:read'), ctrl.getBankSummary);

// ── Comptes bancaires ─────────────────────────────────────────────────────────
router.get('/accounts',      authorizePermission('bank:read'),   ctrl.listAccounts);
router.post('/accounts',     authorizePermission('bank:manage'), auditMiddleware('bank_account', 'CREATE'), ctrl.createAccount);
router.get('/accounts/:id',  authorizePermission('bank:read'),   ctrl.getAccount);
router.put('/accounts/:id',  authorizePermission('bank:manage'), auditMiddleware('bank_account', 'UPDATE'), ctrl.updateAccount);
router.delete('/accounts/:id', authorizePermission('bank:manage'), auditMiddleware('bank_account', 'SOFT_DELETE'), ctrl.deleteAccount);

// ── Import CSV (ancien — rétrocompat, déprécié) ───────────────────────────────
router.post('/import', authorizePermission('bank:import-confirm'), auditMiddleware('bank_import', 'CREATE'), upload.single('file'),
  (_req, res, next) => { res.setHeader('Deprecation', 'true'); res.setHeader('Sunset', '2026-12-31'); next(); },
  ctrl.importCsv);

// ── Nouveau pipeline import ───────────────────────────────────────────────────
router.post('/import/detect',              authorizePermission('bank:import-parse'),   upload.single('file'), ctrl.detectFormat);
router.post('/import/preview',             authorizePermission('bank:import-parse'),   upload.single('file'), ctrl.previewImport);
router.post('/import/confirm',             authorizePermission('bank:import-confirm'), auditMiddleware('bank_import', 'CREATE'), ctrl.confirmImport);
router.get('/import/:id/status',           authorizePermission('bank:import-confirm'), ctrl.getImportStatus);
router.delete('/import/:id',               authorizePermission('bank:import-confirm'), auditMiddleware('bank_import', 'DELETE'), ctrl.rollbackImport);
router.post('/profiles/override',          authorizePermission('bank:import-parse'),   ctrl.saveProfileOverride);

// ── Bibliothèque de profils d'import ─────────────────────────────────────────
router.get('/import-profiles',             authorizePermission('bank:read'),          ctrl.listImportProfiles);
router.post('/import-profiles',            authorizePermission('bank:import-parse'),  auditMiddleware('bank_import_profile', 'CREATE'), ctrl.createImportProfile);
router.get('/import-profiles/:id',         authorizePermission('bank:read'),          ctrl.getImportProfile);
router.put('/import-profiles/:id',         authorizePermission('bank:import-parse'),  auditMiddleware('bank_import_profile', 'UPDATE'), ctrl.updateImportProfile);
router.delete('/import-profiles/:id',      authorizePermission('bank:import-parse'),  auditMiddleware('bank_import_profile', 'DELETE'), ctrl.deleteImportProfile);

// ── Config import par compte ──────────────────────────────────────────────────
router.get('/accounts/:id/import-config',  authorizePermission('bank:read'), ctrl.getImportConfig);

// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/transactions',                    authorizePermission('bank:read'),      ctrl.listTransactions);
router.post('/transactions',                   authorizePermission('bank:manage'),    auditMiddleware('bank_transaction', 'CREATE'), ctrl.createTransaction);
router.get('/transactions/:id',                authorizePermission('bank:read'),      ctrl.getTransaction);
router.get('/transactions/:id/suggestions',    authorizePermission('bank:read'),      ctrl.getSuggestions);
router.get('/transactions/:id/subset-matches', authorizePermission('bank:read'),      ctrl.getSubsetMatches);
router.post('/transactions/:id/reconcile',     authorizePermission('bank:reconcile'), ctrl.reconcileTransaction);
router.post('/transactions/:id/unmatch',       authorizePermission('bank:reconcile'), ctrl.unmatchTransaction);
router.post('/transactions/:id/ignore',        authorizePermission('bank:reconcile'), ctrl.ignoreTransaction);

// ── Rapprochements ────────────────────────────────────────────────────────────
router.get('/reconciliations',                  authorizePermission('bank:read'),      ctrl.listReconciliations);
router.post('/reconciliations',                 authorizePermission('bank:reconcile'), auditMiddleware('bank_reconciliation', 'CREATE'), ctrl.openReconciliation);
router.get('/reconciliations/:id',              authorizePermission('bank:read'),      ctrl.getReconciliation);
router.get('/reconciliations/:id/report',       authorizePermission('bank:read'),      ctrl.getReconciliationReport);
router.post('/reconciliations/:id/auto-match',  authorizePermission('bank:auto-match'), auditMiddleware('bank_reconciliation', 'UPDATE'), ctrl.autoMatch);
router.post('/reconciliations/:id/complete',    authorizePermission('bank:reconcile'), auditMiddleware('bank_reconciliation', 'STATUS_CHANGE'), ctrl.completeReconciliation);

// ── Règles de matching ────────────────────────────────────────────────────────
router.get('/matching-rules',        authorizePermission('bank:read'),  ctrl.listMatchingRules);
router.post('/matching-rules',       authorizePermission('bank:rules'), ctrl.createMatchingRule);
router.put('/matching-rules/:id',    authorizePermission('bank:rules'), ctrl.updateMatchingRule);
router.delete('/matching-rules/:id', authorizePermission('bank:rules'), ctrl.deleteMatchingRule);

export default router;
