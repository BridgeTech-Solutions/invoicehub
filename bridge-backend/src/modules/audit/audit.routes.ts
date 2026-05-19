/**
 * @module modules/audit/audit.routes
 * Consultation du journal d'audit — accès admin uniquement.
 *
 * Endpoints :
 *  GET /api/audit-logs          — Liste paginée avec filtres
 *  GET /api/audit-logs?export=csv — Export CSV complet de la période
 *  GET /api/audit-logs/stats    — Statistiques d'activité
 */
import { Router } from 'express';
import { auditController } from './audit.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const auditRouter: ReturnType<typeof Router> = Router();

auditRouter.use(authenticate, authorizePermission('audit:read'));

auditRouter.get('/stats', auditController.stats.bind(auditController));
auditRouter.get('/',      auditController.list.bind(auditController));
