import { Router, Request, Response, NextFunction } from 'express';
import { invoicesController } from './invoices.controller';
import { paymentsController } from '../payments/payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';
import { prisma } from '../../config/database';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', invoicesController.list.bind(invoicesController));
router.post('/', auditMiddleware('invoice', 'CREATE'), invoicesController.create.bind(invoicesController));
// ⚠️ Route statique AVANT /:id
router.post('/compute', invoicesController.compute.bind(invoicesController));
router.get('/:id', invoicesController.findById.bind(invoicesController));
router.get('/:id/solde-prefill', invoicesController.soldePrefill.bind(invoicesController));
router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityId:   req.params['id'] as string,
        entityType: { in: ['invoice', 'payment'] },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});
router.put('/:id', auditMiddleware('invoice', 'UPDATE'), invoicesController.update.bind(invoicesController));
router.post('/:id/issue', auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.issue.bind(invoicesController));
router.post('/:id/cancel', authorize('admin', 'commercial'), auditMiddleware('invoice', 'STATUS_CHANGE'), invoicesController.cancel.bind(invoicesController));
router.post('/:id/duplicate', invoicesController.duplicate.bind(invoicesController));
router.delete('/:id', authorize('admin', 'commercial'), auditMiddleware('invoice', 'SOFT_DELETE'), invoicesController.delete.bind(invoicesController));
router.post('/:id/avoir', authorize('admin', 'commercial'), auditMiddleware('invoice', 'CREATE'), invoicesController.createAvoir.bind(invoicesController));
router.get('/:id/pdf', rateLimitByUser({ max: 10, windowMs: 60_000 }), invoicesController.getPdf.bind(invoicesController));

// Paiements d'une facture
router.post('/:id/payment', auditMiddleware('payment', 'PAYMENT_REGISTERED'), paymentsController.create.bind(paymentsController));

export { router as invoicesRouter };
