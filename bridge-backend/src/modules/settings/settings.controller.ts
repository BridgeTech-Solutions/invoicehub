import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { updateSettingsSchema } from './settings.schema';

export class SettingsController {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await settingsService.get();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateSettingsSchema.parse(req.body);
      const data  = await settingsService.update(input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const settingsController = new SettingsController();
