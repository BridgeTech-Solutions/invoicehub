import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotificationStatus, NotificationChannel } from '@prisma/client';
import { notificationsService } from './notifications.service';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.preprocess(val => val === 'true' || val === true, z.boolean()).default(false),
});

const updateSettingsSchema = z.object({
  settings: z.array(z.object({
    type:    z.nativeEnum(NotificationStatus),
    channel: z.nativeEnum(NotificationChannel),
    enabled: z.boolean(),
  })).min(1),
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
      await notificationsService.markRead(req.params['id'] as string, req.user!.id);
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

  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await notificationsService.getSettings(req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { settings } = updateSettingsSchema.parse(req.body);
      const data = await notificationsService.updateSettings(req.user!.id, settings);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const notificationsController = new NotificationsController();
