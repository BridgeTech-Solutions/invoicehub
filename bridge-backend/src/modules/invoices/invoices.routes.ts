import { Router } from 'express';
import { invoicesController } from './invoices.controller';
import { paymentsController } from '../payments/payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/',         invoicesController.list.bind(invoicesController));
router.post('/',        auditMiddleware('invoice', 'CREATE'), invoicesController.create.bind(invoicesController));
// ⚠️ Routes statiques AVANT /:id
router.post('/compute', invoicesController.compute.bind(invoicesController));
router.get('/counts',   invoicesController.counts.bind(invoicesController));

router.get('/:id',               invoicesController.findById.bind(invoicesController));
router.get('/:id/solde-prefill', invoicesController.soldePrefill.bind(invoicesController));
router.get('/:id/history',       invoicesController.history.bind(invoicesController));
router.put('/:id',               auditMiddleware('invoice', 'UPDATE'), invoicesController.update.bind(invoicesController));
router.post('/:id/issue',        auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.issue.bind(invoicesController));
router.post('/:id/cancel',       authorize('admin', 'commercial'), auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.cancel.bind(invoicesController));
router.post('/:id/duplicate',    invoicesController.duplicate.bind(invoicesController));
router.delete('/:id',            authorize('admin', 'commercial'), auditMiddleware('invoice', 'SOFT_DELETE'), invoicesController.delete.bind(invoicesController));
router.post('/:id/avoir',        authorize('admin', 'commercial'), auditMiddleware('invoice', 'CREATE'), invoicesController.createAvoir.bind(invoicesController));
router.get('/:id/pdf',           rateLimitByUser({ max: 10, windowMs: 60_000 }), invoicesController.getPdf.bind(invoicesController));

// Paiements d'une facture
router.post('/:id/payment', auditMiddleware('payment', 'PAYMENT_REGISTERED'), paymentsController.create.bind(paymentsController));

// ── Quick-confirm depuis notification in-app ────────────────────────────────
router.post('/:id/quick-confirm-payment', auditMiddleware('payment', 'PAYMENT_REGISTERED'), invoicesController.quickConfirmPayment.bind(invoicesController));
router.post('/:id/quick-confirm-issued',  auditMiddleware('invoice', 'STATUS_CHANGE'),      invoicesController.issue.bind(invoicesController));

export { router as invoicesRouter };
