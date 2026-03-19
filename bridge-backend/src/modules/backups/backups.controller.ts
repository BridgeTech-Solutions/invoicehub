import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { backupsService } from './backups.service';

export class BackupsController {

  /** POST /api/backups — Déclencher un backup manuel */
  async trigger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const backup = await backupsService.trigger(req.user!.id);
      res.status(202).json({
        success: true,
        data: backup,
        message: 'Backup en cours de création...',
      });
    } catch (err) { next(err); }
  }

  /** GET /api/backups — Liste des backups */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await backupsService.list({
        page:   Number(req.query.page)  || 1,
        limit:  Number(req.query.limit) || 20,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  /** GET /api/backups/:id — Détail d'un backup */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const backup = await backupsService.findById(req.params.id as string);
      res.json({ success: true, data: backup });
    } catch (err) { next(err); }
  }

  /** GET /api/backups/:id/download — Télécharger le fichier de backup */
  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, localPath, filename } = await backupsService.getDownloadInfo(req.params.id as string);

      if (url) {
        // S3 ou GCS → redirection vers URL signée (5 min)
        res.redirect(302, url);
        return;
      }

      if (localPath && fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(localPath).pipe(res);
        return;
      }

      next({ statusCode: 404, message: 'Fichier de backup introuvable sur le disque' });
    } catch (err) { next(err); }
  }

  /** DELETE /api/backups/:id — Supprimer un backup */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await backupsService.delete(req.params.id as string);
      res.json({ success: true, message: 'Backup supprimé' });
    } catch (err) { next(err); }
  }
}

export const backupsController = new BackupsController();
