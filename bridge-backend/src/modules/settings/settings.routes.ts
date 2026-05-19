import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import { settingsController } from './settings.controller';

export const settingsRouter: ReturnType<typeof Router> = Router();

settingsRouter.use(authenticate);

/** GET /api/settings — Lire les paramètres (tous les rôles authentifiés) */
settingsRouter.get('/', settingsController.get.bind(settingsController));

/** PUT /api/settings — Modifier les paramètres (admin uniquement) */
settingsRouter.put(
  '/',
  authorizePermission('settings:update'),
  auditMiddleware('company_settings', 'UPDATE'),
  settingsController.update.bind(settingsController),
);
