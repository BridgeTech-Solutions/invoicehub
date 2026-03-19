import { Router } from 'express';
import { proformasController } from './proformas.controller';
import { authenticate } from '../../core/middleware/auth';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

router.use(authenticate);

router.get('/', proformasController.list.bind(proformasController));
router.post('/', auditMiddleware('proforma', 'CREATE'), proformasController.create.bind(proformasController));
router.get('/:id', proformasController.findById.bind(proformasController));
router.put('/:id', auditMiddleware('proforma', 'UPDATE'), proformasController.update.bind(proformasController));
router.delete('/:id', auditMiddleware('proforma', 'SOFT_DELETE'), proformasController.delete.bind(proformasController));
router.post('/:id/send', auditMiddleware('proforma', 'EMAIL_SENT'), proformasController.send.bind(proformasController));
router.post('/:id/accept', auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.accept.bind(proformasController));
router.post('/:id/reject', auditMiddleware('proforma', 'STATUS_CHANGE'), proformasController.reject.bind(proformasController));
router.post('/:id/convert', auditMiddleware('proforma', 'CONVERT_TO_INVOICE'), proformasController.convert.bind(proformasController));
router.post('/:id/duplicate', proformasController.duplicate.bind(proformasController));
router.get('/:id/pdf', rateLimitByUser({ max: 10, windowMs: 60_000 }), proformasController.getPdf.bind(proformasController));

export { router as proformasRouter };
