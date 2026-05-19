import { Request, Response, NextFunction } from 'express';
import { guideService, VALID_SECTIONS } from './guide.service';
import { AppError } from '../../core/errors/AppError';

export class GuideController {
  listVideos(_req: Request, res: Response, next: NextFunction): void {
    try {
      const data = guideService.listVideos();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  uploadVideo(req: Request, res: Response, next: NextFunction): void {
    try {
      const section = req.params['section'] as string;
      if (!VALID_SECTIONS.has(section)) {
        return next(AppError.badRequest(`Section inconnue : ${section}`));
      }
      if (!req.file) {
        return next(AppError.badRequest('Aucun fichier reçu'));
      }
      const relativePath = `uploads/videos/${req.file.filename}`;
      res.json({ success: true, data: { path: relativePath, section } });
    } catch (err) { next(err); }
  }

  async deleteVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const section = req.params['section'] as string;
      if (!VALID_SECTIONS.has(section)) {
        return next(AppError.badRequest(`Section inconnue : ${section}`));
      }
      if (!guideService.findVideoFile(section)) {
        return next(AppError.notFound('Aucune vidéo trouvée pour cette section'));
      }
      await guideService.deleteVideo(section);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const guideController = new GuideController();
