import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { notificationsService } from './notifications.service';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export class NotificationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, unreadOnly } = listSchema.parse(req.query);
      const result = await notificationsService.list(req.user!.id, page, limit, unreadOnly);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationsService.markRead(req.params['id']!, req.user!.id);
      res.json({ success: true, message: 'Notification marquée comme lue' });
    } catch (err) {
      next(err);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationsService.markAllRead(req.user!.id);
      res.json({ success: true, message: 'Toutes les notifications marquées comme lues' });
    } catch (err) {
      next(err);
    }
  }
}

export const notificationsController = new NotificationsController();
