import { Request, Response, NextFunction } from 'express';
import { emailTemplatesService } from './email-templates.service';
import { updateEmailTemplateSchema, previewEmailTemplateSchema } from './email-templates.schema';

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

  async findByType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await emailTemplatesService.findByType(req.params['type'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateEmailTemplateSchema.parse(req.body);
      const data = await emailTemplatesService.update(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vars = previewEmailTemplateSchema.parse(req.body ?? {});
      const data = await emailTemplatesService.preview(req.params['id'] as string, vars);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const emailTemplatesController = new EmailTemplatesController();
