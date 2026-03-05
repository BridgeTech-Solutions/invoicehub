import { Router } from 'express';
import { recurringController } from './recurring.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

const router = Router();

router.use(authenticate);

router.get('/', recurringController.list.bind(recurringController));
router.post('/', authorize('admin', 'commercial'), recurringController.create.bind(recurringController));
router.get('/:id', recurringController.findById.bind(recurringController));
router.put('/:id', authorize('admin', 'commercial'), recurringController.update.bind(recurringController));
router.delete('/:id', authorize('admin'), recurringController.delete.bind(recurringController));
router.post('/:id/activate', authorize('admin', 'commercial'), recurringController.activate.bind(recurringController));
router.post('/:id/deactivate', authorize('admin', 'commercial'), recurringController.deactivate.bind(recurringController));
router.post('/:id/generate', authorize('admin', 'commercial'), recurringController.generate.bind(recurringController));

export { router as recurringRouter };
