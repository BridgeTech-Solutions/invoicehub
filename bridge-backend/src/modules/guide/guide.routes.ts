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
import fs from 'fs';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const guideRouter: ReturnType<typeof Router> = Router();

// ── Dossier de stockage ───────────────────────────────────────────────────────

const VIDEOS_DIR = path.resolve(process.cwd(), 'uploads', 'videos');
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// ── Sections valides (anchors du guide) ───────────────────────────────────────

const VALID_SECTIONS = new Set([
  'facturation', 'proformas', 'recurrence', 'clients', 'produits',
  'rapports', 'notifications', 'assistant', 'securite', 'audit', 'parametres',
]);

// ── Multer ────────────────────────────────────────────────────────────────────

const ALLOWED_MIMES = ['video/mp4', 'video/webm', 'video/ogg'];
const MAX_SIZE = 500 * 1024 * 1024; // 500 Mo

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `${req.params['section'] as string}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non accepté. Utilisez MP4, WebM ou OGG.'));
    }
  },
});

// ── Helper : trouver un fichier vidéo pour une section ───────────────────────

function findVideoFile(section: string): string | null {
  for (const ext of ['.mp4', '.webm', '.ogv', '.ogg']) {
    const filePath = path.join(VIDEOS_DIR, `${section}${ext}`);
    if (fs.existsSync(filePath)) return `${section}${ext}`;
  }
  return null;
}

// ── GET /api/guide/videos ────────────────────────────────────────────────────

guideRouter.get('/videos', authenticate, (_req: Request, res: Response) => {
  const result: Record<string, string> = {};
  for (const section of VALID_SECTIONS) {
    const file = findVideoFile(section);
    if (file) result[section] = `uploads/videos/${file}`;
  }
  res.json({ success: true, data: result });
});

// ── POST /api/guide/videos/:section ──────────────────────────────────────────

guideRouter.post(
  '/videos/:section',
  authenticate,
  authorize('admin'),
  (req: Request, res: Response, next: NextFunction) => {
    if (!VALID_SECTIONS.has(req.params['section'] as string)) {
      return next(AppError.badRequest(`Section inconnue : ${req.params['section'] as string}`));
    }

    // Supprimer l'ancienne vidéo de la section avant l'upload
    const existing = findVideoFile(req.params['section'] as string);
    if (existing) {
      const oldPath = path.join(VIDEOS_DIR, existing);
      fs.unlink(oldPath, () => {});
    }

    upload.single('file')(req, res, (err) => {
      if (err) return next(AppError.badRequest(err.message));
      if (!req.file) return next(AppError.badRequest('Aucun fichier reçu'));
      const relativePath = `uploads/videos/${req.file.filename}`;
      res.json({ success: true, data: { path: relativePath, section: req.params['section'] as string } });
    });
  },
);

// ── DELETE /api/guide/videos/:section ────────────────────────────────────────

guideRouter.delete(
  '/videos/:section',
  authenticate,
  authorize('admin'),
  (req: Request, res: Response, next: NextFunction) => {
    if (!VALID_SECTIONS.has(req.params['section'] as string)) {
      return next(AppError.badRequest(`Section inconnue : ${req.params['section'] as string}`));
    }
    const file = findVideoFile(req.params['section'] as string);
    if (!file) return next(AppError.notFound('Aucune vidéo trouvée pour cette section'));
    fs.unlink(path.join(VIDEOS_DIR, file), (err) => {
      if (err) return next(AppError.internal('Erreur lors de la suppression'));
      res.json({ success: true });
    });
  },
);
