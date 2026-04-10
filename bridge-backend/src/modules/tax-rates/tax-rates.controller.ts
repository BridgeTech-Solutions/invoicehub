import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { taxRatesService } from './tax-rates.service';

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  code:        z.string().min(1).max(20),
  rate:        z.number().min(0).max(100),
  description: z.string().optional(),
  isDefault:   z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export class TaxRatesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query['includeInactive'] === 'true';
      const data = await taxRatesService.list(includeInactive);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await taxRatesService.findById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSchema.parse(req.body);
      const data = await taxRatesService.create(input);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateSchema.parse(req.body);
      const data = await taxRatesService.update(req.params['id'] as string, input);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await taxRatesService.delete(req.params['id'] as string);
      res.json({ success: true, message: 'Taux de taxe supprimé' });
    } catch (err) { next(err); }
  }
}

export const taxRatesController = new TaxRatesController();
