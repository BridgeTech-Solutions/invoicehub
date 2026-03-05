import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

const router = Router();

router.use(authenticate);

router.get('/', paymentsController.list.bind(paymentsController));
router.delete('/:id', authorize('admin'), paymentsController.delete.bind(paymentsController));

export { router as paymentsRouter };
