import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { rateLimitByUser } from '../../core/middleware/rateLimitByUser';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

// ── Upload justificatifs de paiement ──────────────────────────────────────────
const PAYMENT_DIR = path.resolve(process.cwd(), 'uploads', 'payments');
if (!fs.existsSync(PAYMENT_DIR)) fs.mkdirSync(PAYMENT_DIR, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PAYMENT_DIR),
    filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.bin'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non accepté. Utilisez PDF, JPEG ou PNG.'));
  },
});

router.use(authenticate);

router.get('/',              authorizePermission('payments:read'),   paymentsController.list.bind(paymentsController));
router.get('/:id/receipt',   authorizePermission('payments:read'),   rateLimitByUser({ max: 10, windowMs: 60_000 }), paymentsController.getReceipt.bind(paymentsController));
router.delete('/:id',        authorizePermission('payments:delete'), auditMiddleware('payment', 'PAYMENT_DELETED'), paymentsController.delete.bind(paymentsController));

// ── Justificatifs de paiement ────────────────────────────────────────────────
// Servis via route protégée — jamais via express.static public
router.post('/:id/attachment',   authorizePermission('payments:create'), auditMiddleware('payment', 'UPDATE'), attachmentUpload.single('file'), paymentsController.uploadAttachment.bind(paymentsController));
router.get('/:id/attachment',    authorizePermission('payments:read'),   paymentsController.getAttachment.bind(paymentsController));
router.delete('/:id/attachment', authorizePermission('payments:create'), auditMiddleware('payment', 'UPDATE'),  paymentsController.deleteAttachment.bind(paymentsController));

export { router as paymentsRouter };
