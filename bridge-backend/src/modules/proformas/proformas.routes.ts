import { Router, Request, Response, NextFunction } from 'express';
import { proformasController } from './proformas.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', proformasController.list.bind(proformasController));
router.post('/', auditMiddleware('proforma', 'CREATE'), proformasController.create.bind(proformasController));
// GET /proformas/counts — compteurs par statut pour les onglets
router.get('/counts', proformasController.counts.bind(proformasController));

router.get('/:id', proformasController.findById.bind(proformasController));
router.put('/:id', auditMiddleware('proforma', 'UPDATE'), proformasController.update.bind(proformasController));
router.delete('/:id', authorize('admin', 'commercial'), auditMiddleware('proforma', 'SOFT_DELETE'), proformasController.delete.bind(proformasController));
router.post('/:id/send', auditMiddleware('proforma', 'EMAIL_SENT'), proformasController.send.bind(proformasController));
router.post('/:id/accept', auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.accept.bind(proformasController));
router.post('/:id/reject', auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.reject.bind(proformasController));
router.post('/:id/convert', auditMiddleware('proforma', 'CONVERT_TO_INVOICE'), proformasController.convert.bind(proformasController));
router.post('/:id/duplicate', auditMiddleware('proforma', 'CREATE'), proformasController.duplicate.bind(proformasController));
router.get('/:id/pdf', rateLimitByUser({ max: 10, windowMs: 60_000 }), proformasController.getPdf.bind(proformasController));

// ── Quick-confirm depuis notification in-app ────────────────────────────────
// POST /:id/quick-confirm-sent — marque un brouillon comme envoyé au client
router.post('/:id/quick-confirm-sent', auditMiddleware('proforma', 'EMAIL_SENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await proformasController.send(req, res, next);
  } catch (err) { next(err); }
});

// POST /:id/quick-confirm-accepted — marque une proforma envoyée comme acceptée
router.post('/:id/quick-confirm-accepted', auditMiddleware('proforma', 'STATUS_CHANGE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await proformasController.accept(req, res, next);
  } catch (err) { next(err); }
});

export { router as proformasRouter };
