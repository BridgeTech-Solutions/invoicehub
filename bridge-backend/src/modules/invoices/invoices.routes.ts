import { Router } from 'express';
import { invoicesController } from './invoices.controller';
import { paymentsController } from '../payments/payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/',         authorizePermission('invoices:read'),   invoicesController.list.bind(invoicesController));
router.post('/',        authorizePermission('invoices:create'), auditMiddleware('invoice', 'CREATE'), invoicesController.create.bind(invoicesController));
// ⚠️ Routes statiques AVANT /:id
router.post('/compute', authorizePermission('invoices:read'),   invoicesController.compute.bind(invoicesController));
router.get('/counts',   authorizePermission('invoices:read'),   invoicesController.counts.bind(invoicesController));

router.get('/:id',               authorizePermission('invoices:read'),   invoicesController.findById.bind(invoicesController));
router.get('/:id/solde-prefill', authorizePermission('invoices:read'),   invoicesController.soldePrefill.bind(invoicesController));
router.get('/:id/history',       authorizePermission('invoices:read'),   invoicesController.history.bind(invoicesController));
router.put('/:id',               authorizePermission('invoices:update'), auditMiddleware('invoice', 'UPDATE'), invoicesController.update.bind(invoicesController));
router.post('/:id/issue',        authorizePermission('invoices:update'), auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.issue.bind(invoicesController));
router.post('/:id/cancel',       authorizePermission('invoices:cancel'), auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.cancel.bind(invoicesController));
router.post('/:id/duplicate',    authorizePermission('invoices:create'), auditMiddleware('invoice', 'CREATE'), invoicesController.duplicate.bind(invoicesController));
router.delete('/:id',            authorizePermission('invoices:delete'), auditMiddleware('invoice', 'SOFT_DELETE'), invoicesController.delete.bind(invoicesController));
router.post('/:id/avoir',        authorizePermission('invoices:cancel'), auditMiddleware('invoice', 'CREATE'), invoicesController.createAvoir.bind(invoicesController));
router.get('/:id/pdf',                authorizePermission('invoices:read'), rateLimitByUser({ max: 10, windowMs: 60_000 }), auditMiddleware('invoice', 'PDF_GENERATED'), invoicesController.getPdf.bind(invoicesController));
router.get('/:id/payment-prediction', authorizePermission('invoices:read'), invoicesController.getPaymentPrediction.bind(invoicesController));

// Paiements d'une facture
router.post('/:id/payment', authorizePermission('payments:create'), auditMiddleware('payment', 'PAYMENT_REGISTERED'), paymentsController.create.bind(paymentsController));

// ── Quick-confirm depuis notification in-app ────────────────────────────────
router.post('/:id/quick-confirm-payment', authorizePermission('payments:create'),  auditMiddleware('payment', 'PAYMENT_REGISTERED'), invoicesController.quickConfirmPayment.bind(invoicesController));
router.post('/:id/quick-confirm-issued',  authorizePermission('invoices:update'),  auditMiddleware('invoice', 'STATUS_CHANGE'),      invoicesController.issue.bind(invoicesController));

export { router as invoicesRouter };
