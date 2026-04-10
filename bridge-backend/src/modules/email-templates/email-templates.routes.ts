import { Router } from 'express';
import { emailTemplatesController } from './email-templates.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

export const emailTemplatesRouter: ReturnType<typeof Router> = Router();

emailTemplatesRouter.use(authenticate, authorize('admin'));

emailTemplatesRouter.get('/',              emailTemplatesController.list.bind(emailTemplatesController));
emailTemplatesRouter.get('/:id',           emailTemplatesController.findById.bind(emailTemplatesController));
emailTemplatesRouter.put('/:id',           emailTemplatesController.update.bind(emailTemplatesController));
emailTemplatesRouter.post('/:id/preview',  emailTemplatesController.preview.bind(emailTemplatesController));
