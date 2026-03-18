import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import { settingsController } from './settings.controller';

export const settingsRouter = Router();

settingsRouter.use(authenticate);

/** GET /api/settings — Lire les paramètres (tous les rôles authentifiés) */
settingsRouter.get('/', settingsController.get.bind(settingsController));

/** PUT /api/settings — Modifier les paramètres (admin uniquement) */
settingsRouter.put(
  '/',
  authorize('admin'),
  auditMiddleware('company_settings', 'UPDATE'),
  settingsController.update.bind(settingsController),
);
