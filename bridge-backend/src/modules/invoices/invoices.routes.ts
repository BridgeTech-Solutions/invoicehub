import { Router } from 'express';
import { invoicesController } from './invoices.controller';
import { paymentsController } from '../payments/payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

const router = Router();

router.use(authenticate);

router.get('/', invoicesController.list.bind(invoicesController));
router.post('/', invoicesController.create.bind(invoicesController));
router.get('/:id', invoicesController.findById.bind(invoicesController));
router.put('/:id', invoicesController.update.bind(invoicesController));
router.post('/:id/issue', invoicesController.issue.bind(invoicesController));
router.post('/:id/cancel', authorize('admin', 'commercial'), invoicesController.cancel.bind(invoicesController));
router.get('/:id/pdf', invoicesController.getPdf.bind(invoicesController));

// Paiements d'une facture
router.post('/:id/payment', paymentsController.create.bind(paymentsController));

export { router as invoicesRouter };
