import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { officesService } from './offices.service';

const createSchema = z.object({
  code:      z.string().min(1).max(10).transform(v => v.toUpperCase()),
  name:      z.string().min(1).max(255),
  city:      z.string().max(100).optional(),
  address:   z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export class OfficesController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await officesService.list();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await officesService.findById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSchema.parse(req.body);
      const data = await officesService.create(input);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateSchema.parse(req.body);
      const data = await officesService.update(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await officesService.delete(req.params['id'] as string);
      res.json({ success: true, message: 'Bureau supprimé' });
    } catch (err) { next(err); }
  }
}

export const officesController = new OfficesController();
