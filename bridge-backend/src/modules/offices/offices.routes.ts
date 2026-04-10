import { Router } from 'express';
import { officesController } from './offices.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

export const officesRouter: ReturnType<typeof Router> = Router();

officesRouter.use(authenticate);

officesRouter.get('/',    officesController.list.bind(officesController));
officesRouter.get('/:id', officesController.findById.bind(officesController));
officesRouter.post('/',   authorize('admin'), officesController.create.bind(officesController));
officesRouter.put('/:id', authorize('admin'), officesController.update.bind(officesController));
officesRouter.delete('/:id', authorize('admin'), officesController.delete.bind(officesController));
