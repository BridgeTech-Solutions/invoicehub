import { Router } from 'express';
import { emailTemplatesController } from './email-templates.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const emailTemplatesRouter: ReturnType<typeof Router> = Router();

emailTemplatesRouter.use(authenticate);

// Lecture : accessible à tous ceux qui peuvent lire les paramètres (admin, DG…)
emailTemplatesRouter.get('/',                  authorizePermission('settings:read'),   emailTemplatesController.list.bind(emailTemplatesController));
emailTemplatesRouter.get('/by-type/:type',     authorizePermission('settings:read'),   emailTemplatesController.findByType.bind(emailTemplatesController));
emailTemplatesRouter.get('/:id',               authorizePermission('settings:read'),   emailTemplatesController.findById.bind(emailTemplatesController));

// Écriture : settings:update uniquement
emailTemplatesRouter.put('/:id',               authorizePermission('settings:update'), emailTemplatesController.update.bind(emailTemplatesController));
emailTemplatesRouter.post('/:id/preview',      authorizePermission('settings:read'),   emailTemplatesController.preview.bind(emailTemplatesController));
