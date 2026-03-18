import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router = Router();

router.use(authenticate);

router.get('/', paymentsController.list.bind(paymentsController));
router.get('/:id/receipt', rateLimitByUser({ max: 10, windowMs: 60_000 }), paymentsController.getReceipt.bind(paymentsController));
router.delete('/:id', authorize('admin'), auditMiddleware('payment', 'PAYMENT_DELETED'), paymentsController.delete.bind(paymentsController));

export { router as paymentsRouter };
