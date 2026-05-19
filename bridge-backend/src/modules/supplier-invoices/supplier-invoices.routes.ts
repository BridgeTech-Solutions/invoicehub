import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './supplier-invoices.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/',    authorizePermission('purchases:read'),     ctrl.list);
router.post('/',   authorizePermission('purchases:create'),   auditMiddleware('supplier_invoice', 'CREATE'), ctrl.create);

router.get('/:id/pdf', authorizePermission('purchases:read'), auditMiddleware('supplier_invoice', 'PDF_GENERATED'), ctrl.getPdf);
router.get('/:id',    authorizePermission('purchases:read'),   ctrl.findById);
router.put('/:id',    authorizePermission('purchases:update'), auditMiddleware('supplier_invoice', 'UPDATE'), ctrl.update);
router.delete('/:id', authorizePermission('purchases:delete'), auditMiddleware('supplier_invoice', 'SOFT_DELETE'), ctrl.remove);

router.post('/:id/validate', authorizePermission('purchases:validate'), auditMiddleware('supplier_invoice', 'STATUS_CHANGE'), ctrl.validate);
router.post('/:id/dispute',  authorizePermission('purchases:validate'), auditMiddleware('supplier_invoice', 'STATUS_CHANGE'), ctrl.dispute);
router.post('/:id/pay',      authorizePermission('purchases:pay'),      auditMiddleware('supplier_invoice', 'PAYMENT_REGISTERED'), ctrl.pay);
router.get('/:id/payments',  authorizePermission('purchases:read'),     ctrl.listPayments);

export default router;
