import { Router } from 'express';
import { officesController } from './offices.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';

export const officesRouter: ReturnType<typeof Router> = Router();

officesRouter.use(authenticate);

officesRouter.get('/',    officesController.list.bind(officesController));
officesRouter.get('/:id', officesController.findById.bind(officesController));
officesRouter.post('/',   authorizePermission('settings:update'), officesController.create.bind(officesController));
officesRouter.put('/:id', authorizePermission('settings:update'), officesController.update.bind(officesController));
officesRouter.delete('/:id', authorizePermission('settings:update'), officesController.delete.bind(officesController));
