import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { emailTemplatesService } from './email-templates.service';

const updateSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  subject:  z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export class EmailTemplatesController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await emailTemplatesService.list();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await emailTemplatesService.findById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateSchema.parse(req.body);
      const data = await emailTemplatesService.update(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vars: Record<string, string> = req.body ?? {};
      const data = await emailTemplatesService.preview(req.params['id'] as string, vars);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const emailTemplatesController = new EmailTemplatesController();
