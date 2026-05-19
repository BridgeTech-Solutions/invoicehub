/**
 * @module modules/guide/guide.routes
 * Gestion des vidéos de formation du guide utilisateur.
 *
 * Endpoints :
 *  GET    /api/guide/videos              — Liste les vidéos disponibles (auth requis)
 *  POST   /api/guide/videos/:section     — Upload une vidéo (admin uniquement)
 *  DELETE /api/guide/videos/:section     — Supprime une vidéo (admin uniquement)
 *
 * Stockage : uploads/videos/{section}.{ext}
 * L'URL publique de lecture est servie par express.static : /uploads/videos/{filename}
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { guideController } from './guide.controller';
import { guideService, VALID_SECTIONS } from './guide.service';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const guideRouter: ReturnType<typeof Router> = Router();

guideService.ensureDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, guideService.getVideosDir()),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `${req.params['section'] as string}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['video/mp4', 'video/webm', 'video/ogg'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non accepté. Utilisez MP4, WebM ou OGG.'));
  },
});

guideRouter.get('/videos', authenticate, guideController.listVideos.bind(guideController));

guideRouter.post(
  '/videos/:section',
  authenticate,
  authorizePermission('settings:update'),
  (req: Request, res: Response, next: NextFunction) => {
    if (!VALID_SECTIONS.has(req.params['section'] as string)) {
      return next(AppError.badRequest(`Section inconnue : ${req.params['section'] as string}`));
    }
    guideService.deleteVideo(req.params['section'] as string).catch(() => {});
    upload.single('file')(req, res, (err) => {
      if (err) return next(AppError.badRequest(err.message));
      guideController.uploadVideo(req, res, next);
    });
  },
);

guideRouter.delete(
  '/videos/:section',
  authenticate,
  authorizePermission('settings:update'),
  guideController.deleteVideo.bind(guideController),
);
