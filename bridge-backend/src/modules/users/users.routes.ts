import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

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

router.get('/',                    authorize('admin'), usersController.list.bind(usersController));
router.post('/',                   authorize('admin'), usersController.create.bind(usersController));
router.get('/:id',                 authorize('admin'), usersController.findById.bind(usersController));
router.put('/:id',                 authorize('admin'), usersController.update.bind(usersController));
router.delete('/:id',              authorize('admin'), usersController.delete.bind(usersController));
router.post('/:id/reactivate',     authorize('admin'), usersController.reactivate.bind(usersController));
router.post('/:id/reset-password', authorize('admin'), usersController.resetPassword.bind(usersController));
router.get('/:id/activity',        authorize('admin'), usersController.activity.bind(usersController));

export { router as usersRouter };
