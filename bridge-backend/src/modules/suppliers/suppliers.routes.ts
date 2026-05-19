import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';
import * as ctrl from './suppliers.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/',    authorizePermission('suppliers:read'),   ctrl.listSuppliers);
router.post('/',   authorizePermission('suppliers:create'), auditMiddleware('supplier', 'CREATE'), ctrl.createSupplier);
router.get('/:id', authorizePermission('suppliers:read'),   ctrl.getSupplier);
router.put('/:id', authorizePermission('suppliers:update'), auditMiddleware('supplier', 'UPDATE'), ctrl.updateSupplier);
router.delete('/:id', authorizePermission('suppliers:delete'), auditMiddleware('supplier', 'SOFT_DELETE'), ctrl.deleteSupplier);

router.get('/:id/contacts',                      authorizePermission('suppliers:read'),   ctrl.listContacts);
router.post('/:id/contacts',                     authorizePermission('suppliers:update'), ctrl.addContact);
router.put('/:id/contacts/:contactId',           authorizePermission('suppliers:update'), ctrl.updateContact);
router.delete('/:id/contacts/:contactId',        authorizePermission('suppliers:update'), ctrl.deleteContact);

router.get('/:id/purchase-orders',   authorizePermission('purchases:read'),  ctrl.getSupplierPurchaseOrders);
router.get('/:id/invoices',          authorizePermission('purchases:read'),  ctrl.getSupplierInvoices);
router.get('/:id/financial-summary', authorizePermission('suppliers:read'),  ctrl.getFinancialSummary);

export default router;
