import { Router } from 'express';
import { recurringController } from './recurring.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', recurringController.list.bind(recurringController));
router.post('/',     authorize('admin', 'commercial'), auditMiddleware('recurringInvoiceTemplate', 'CREATE'),      recurringController.create.bind(recurringController));
router.get('/:id',  recurringController.findById.bind(recurringController));
router.put('/:id',  authorize('admin', 'commercial'), auditMiddleware('recurringInvoiceTemplate', 'UPDATE'),      recurringController.update.bind(recurringController));
router.delete('/:id', authorize('admin'),             auditMiddleware('recurringInvoiceTemplate', 'SOFT_DELETE'), recurringController.delete.bind(recurringController));
router.post('/:id/activate',   authorize('admin', 'commercial'), auditMiddleware('recurringInvoiceTemplate', 'STATUS_CHANGE'), recurringController.activate.bind(recurringController));
router.post('/:id/deactivate', authorize('admin', 'commercial'), auditMiddleware('recurringInvoiceTemplate', 'STATUS_CHANGE'), recurringController.deactivate.bind(recurringController));
router.post('/:id/generate',   authorize('admin', 'commercial'), auditMiddleware('recurringInvoiceTemplate', 'CREATE'),        recurringController.generate.bind(recurringController));

export { router as recurringRouter };
