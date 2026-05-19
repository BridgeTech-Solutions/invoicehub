import { Router } from 'express';
import { recurringController } from './recurring.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', recurringController.list.bind(recurringController));
router.post('/',     authorizePermission('invoices:create'), auditMiddleware('recurringInvoiceTemplate', 'CREATE'),      recurringController.create.bind(recurringController));
router.get('/:id',  recurringController.findById.bind(recurringController));
router.put('/:id',  authorizePermission('invoices:update'), auditMiddleware('recurringInvoiceTemplate', 'UPDATE'),      recurringController.update.bind(recurringController));
router.delete('/:id', authorizePermission('invoices:delete'),             auditMiddleware('recurringInvoiceTemplate', 'SOFT_DELETE'), recurringController.delete.bind(recurringController));
router.post('/:id/activate',   authorizePermission('invoices:create'), auditMiddleware('recurringInvoiceTemplate', 'STATUS_CHANGE'), recurringController.activate.bind(recurringController));
router.post('/:id/deactivate', authorizePermission('invoices:create'), auditMiddleware('recurringInvoiceTemplate', 'STATUS_CHANGE'), recurringController.deactivate.bind(recurringController));
router.post('/:id/generate',   authorizePermission('invoices:create'), auditMiddleware('recurringInvoiceTemplate', 'CREATE'),        recurringController.generate.bind(recurringController));

export { router as recurringRouter };
