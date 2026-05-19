import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { auditMiddleware } from '../../core/middleware/audit';

const router: ReturnType<typeof Router> = Router();

// ── Avatar upload ─────────────────────────────────────────────────────────────
const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non accepté. Utilisez PNG, JPEG ou WebP.'));
  },
});
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/me',          usersController.me.bind(usersController));
router.put('/me',          usersController.updateMe.bind(usersController));
router.put('/me/password', usersController.changePassword.bind(usersController));
router.put('/me/avatar',   avatarUpload.single('file'), usersController.uploadAvatar.bind(usersController));
router.delete('/me/avatar', usersController.deleteAvatar.bind(usersController));

router.get('/',                    authorizePermission('users:manage'), usersController.list.bind(usersController));
router.post('/',                   authorizePermission('users:manage'), auditMiddleware('user', 'CREATE'),        usersController.create.bind(usersController));
router.get('/:id',                 authorizePermission('users:manage'), usersController.findById.bind(usersController));
router.put('/:id',                 authorizePermission('users:manage'), auditMiddleware('user', 'UPDATE'),        usersController.update.bind(usersController));
router.delete('/:id',              authorizePermission('users:manage'), auditMiddleware('user', 'SOFT_DELETE'),   usersController.delete.bind(usersController));
router.post('/:id/reactivate',     authorizePermission('users:manage'), auditMiddleware('user', 'STATUS_CHANGE'), usersController.reactivate.bind(usersController));
router.post('/:id/reset-password', authorizePermission('users:manage'), auditMiddleware('user', 'UPDATE'),        usersController.resetPassword.bind(usersController));
router.get('/:id/activity',        authorizePermission('users:manage'), usersController.activity.bind(usersController));

export { router as usersRouter };
