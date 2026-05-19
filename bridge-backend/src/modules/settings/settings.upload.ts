/**
 * @module modules/settings/settings.upload
 * Upload des assets visuels de l'entreprise (logo, cachet, signature).
 *
 * Endpoints :
 *  PUT /api/settings/assets/logo       — Remplace le logo
 *  PUT /api/settings/assets/stamp      — Remplace le cachet
 *  PUT /api/settings/assets/signature  — Remplace la signature
 *
 * Contraintes :
 *  - Types MIME acceptés : image/png, image/jpeg, image/webp
 *  - Taille maximale : 2 Mo
 *  - Fichiers stockés dans uploads/company/
 *  - L'ancienne version est supprimée après remplacement
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

function toRelativePath(absPath: string): string {
  if (!path.isAbsolute(absPath)) return absPath.replace(/\\/g, '/');
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorizePermission } from '../../core/middleware/rbac';
import { AppError } from '../../core/errors/AppError';

export const settingsUploadRouter: ReturnType<typeof Router> = Router();

settingsUploadRouter.use(authenticate, authorizePermission('settings:update'));

// Dossier de stockage
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'company');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non accepté. Utilisez PNG, JPEG ou WebP.'));
    }
  },
});

/** Map des clés d'asset vers le champ Prisma correspondant */
const ASSET_FIELDS: Record<string, 'logoPath' | 'stampPath' | 'signaturePath' | 'headerImagePath' | 'footerImagePath'> = {
  logo:      'logoPath',
  stamp:     'stampPath',
  signature: 'signaturePath',
  header:    'headerImagePath',
  footer:    'footerImagePath',
};

function assetHandler(assetKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) throw AppError.badRequest('Aucun fichier reçu');

      const field = ASSET_FIELDS[assetKey];
      const newPath = req.file.path;

      // Supprimer l'ancienne version si elle existe
      const settings = await prisma.companySettings.findFirst({ select: { [field]: true } });
      const oldPath = (settings?.[field] as string | null | undefined) ?? null;
      if (oldPath && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }

      await prisma.companySettings.updateMany({
        data: { [field]: newPath },
      });

      res.json({ success: true, data: { path: toRelativePath(newPath) } });
    } catch (err) {
      // Supprimer le fichier uploadé si l'opération échoue
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  };
}

settingsUploadRouter.put('/logo',      upload.single('file'), assetHandler('logo'));
settingsUploadRouter.put('/stamp',     upload.single('file'), assetHandler('stamp'));
settingsUploadRouter.put('/signature', upload.single('file'), assetHandler('signature'));
settingsUploadRouter.put('/header',    upload.single('file'), assetHandler('header'));
settingsUploadRouter.put('/footer',    upload.single('file'), assetHandler('footer'));
