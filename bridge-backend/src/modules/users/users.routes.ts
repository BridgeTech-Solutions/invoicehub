import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

const router = Router();

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

router.get('/me', usersController.me.bind(usersController));
router.put('/me', usersController.updateMe.bind(usersController));
router.put('/me/password', usersController.changePassword.bind(usersController));

/** PUT /api/users/me/avatar — Upload ou remplacement de l'avatar */
router.put('/me/avatar', avatarUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw AppError.badRequest('Aucun fichier reçu');

    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarPath: true } });

    // Supprimer l'ancien avatar si présent
    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarPath: req.file.path },
    });

    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

/** DELETE /api/users/me/avatar — Suppression de l'avatar */
router.delete('/me/avatar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarPath: true } });

    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
    }

    await prisma.user.update({ where: { id: req.user!.id }, data: { avatarPath: null } });
    res.json({ success: true, message: 'Avatar supprimé' });
  } catch (err) { next(err); }
});

router.get('/', authorize('admin'), usersController.list.bind(usersController));
router.post('/', authorize('admin'), usersController.create.bind(usersController));
router.get('/:id', authorize('admin'), usersController.findById.bind(usersController));
router.put('/:id', authorize('admin'), usersController.update.bind(usersController));
router.delete('/:id', authorize('admin'), usersController.delete.bind(usersController));

export { router as usersRouter };
