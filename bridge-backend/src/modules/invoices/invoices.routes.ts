import { Router, Request, Response, NextFunction } from 'express';
import { invoicesController } from './invoices.controller';
import { paymentsController } from '../payments/payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { paymentsService } from '../payments/payments.service';

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

// ── Quick-confirm depuis notification in-app ────────────────────────────────
// POST /:id/quick-confirm-payment — marque la facture comme payée (montant = balanceDue)
router.post('/:id/quick-confirm-payment', auditMiddleware('payment', 'PAYMENT_REGISTERED'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params['id'] as string;
    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: { balanceDue: true, number: true },
    });
    if (!inv) throw new AppError('Facture introuvable', 404);
    const balanceDue = Number(inv.balanceDue);
    if (balanceDue <= 0) throw new AppError('Solde déjà nul', 400);

    const data = await paymentsService.create(invoiceId, {
      amount:      balanceDue,
      method:      'virement',
      reference:   `Confirmé via notification — ${inv.number}`,
      paymentDate: new Date(),
    }, req.user!.id);

    res.status(201).json({ success: true, data, message: 'Facture marquée comme payée' });
  } catch (err) { next(err); }
});

// POST /:id/quick-confirm-issued — marque un brouillon comme émis
router.post('/:id/quick-confirm-issued', auditMiddleware('invoice', 'STATUS_CHANGE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await invoicesController.issue(req, res, next);
  } catch (err) { next(err); }
});

export { router as invoicesRouter };
