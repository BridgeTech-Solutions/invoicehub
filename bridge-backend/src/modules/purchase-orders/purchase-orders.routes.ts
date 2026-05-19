import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './purchase-orders.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/',       authorizePermission('purchases:read'),   ctrl.list);
router.post('/compute', authorizePermission('purchases:read'), ctrl.compute);
router.post('/',      authorizePermission('purchases:create'), auditMiddleware('purchase_order', 'CREATE'), ctrl.create);

router.get('/:id/pdf', authorizePermission('purchases:read'), auditMiddleware('purchase_order', 'PDF_GENERATED'), ctrl.getPdf);
router.get('/:id',    authorizePermission('purchases:read'),   ctrl.findById);
router.put('/:id',    authorizePermission('purchases:update'), auditMiddleware('purchase_order', 'UPDATE'), ctrl.update);
router.delete('/:id', authorizePermission('purchases:delete'), auditMiddleware('purchase_order', 'SOFT_DELETE'), ctrl.remove);

router.post('/:id/send',    authorizePermission('purchases:update'),  auditMiddleware('purchase_order', 'STATUS_CHANGE'), ctrl.send);
router.post('/:id/confirm', authorizePermission('purchases:approve'), auditMiddleware('purchase_order', 'STATUS_CHANGE'), ctrl.confirm);
router.post('/:id/receive', authorizePermission('purchases:update'),  auditMiddleware('purchase_order', 'STATUS_CHANGE'), ctrl.receive);
router.post('/:id/cancel',  authorizePermission('purchases:approve'), auditMiddleware('purchase_order', 'STATUS_CHANGE'), ctrl.cancel);

export default router;
