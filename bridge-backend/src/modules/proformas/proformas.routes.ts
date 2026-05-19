import { Router, Request, Response, NextFunction } from 'express';
import { proformasController } from './proformas.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/',        authorizePermission('proformas:read'),   proformasController.list.bind(proformasController));
router.post('/',       authorizePermission('proformas:create'), auditMiddleware('proforma', 'CREATE'), proformasController.create.bind(proformasController));
// GET /proformas/counts — compteurs par statut pour les onglets
router.get('/counts',  authorizePermission('proformas:read'),   proformasController.counts.bind(proformasController));

router.get('/:id',         authorizePermission('proformas:read'),   proformasController.findById.bind(proformasController));
router.put('/:id',         authorizePermission('proformas:update'), auditMiddleware('proforma', 'UPDATE'), proformasController.update.bind(proformasController));
router.delete('/:id',      authorizePermission('proformas:delete'), auditMiddleware('proforma', 'SOFT_DELETE'), proformasController.delete.bind(proformasController));
router.post('/:id/send',   authorizePermission('proformas:update'), auditMiddleware('proforma', 'EMAIL_SENT'), proformasController.send.bind(proformasController));
router.post('/:id/accept', authorizePermission('proformas:update'), auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.accept.bind(proformasController));
router.post('/:id/reject', authorizePermission('proformas:update'), auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.reject.bind(proformasController));
router.post('/:id/convert',    authorizePermission('proformas:update'), auditMiddleware('proforma', 'CONVERT_TO_INVOICE'), proformasController.convert.bind(proformasController));
router.post('/:id/duplicate',  authorizePermission('proformas:create'), auditMiddleware('proforma', 'CREATE'), proformasController.duplicate.bind(proformasController));
router.get('/:id/pdf',         authorizePermission('proformas:read'),   rateLimitByUser({ max: 10, windowMs: 60_000 }), auditMiddleware('proforma', 'PDF_GENERATED'), proformasController.getPdf.bind(proformasController));

// ── Quick-confirm depuis notification in-app ────────────────────────────────
// POST /:id/quick-confirm-sent — marque un brouillon comme envoyé au client
router.post('/:id/quick-confirm-sent', authorizePermission('proformas:update'), auditMiddleware('proforma', 'EMAIL_SENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await proformasController.send(req, res, next);
  } catch (err) { next(err); }
});

// POST /:id/quick-confirm-accepted — marque une proforma envoyée comme acceptée
router.post('/:id/quick-confirm-accepted', authorizePermission('proformas:update'), auditMiddleware('proforma', 'STATUS_CHANGE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await proformasController.accept(req, res, next);
  } catch (err) { next(err); }
});

export { router as proformasRouter };
