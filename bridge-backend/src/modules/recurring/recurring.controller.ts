import { Request, Response, NextFunction } from 'express';
import { recurringService } from './recurring.service';
import { createRecurringSchema, updateRecurringSchema, listRecurringSchema } from './recurring.schema';

export class RecurringController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listRecurringSchema.parse(req.query);
      const result = await recurringService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await recurringService.findById(req.params['id']!);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createRecurringSchema.parse(req.body);
      const data = await recurringService.create(input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateRecurringSchema.parse(req.body);
      const data = await recurringService.update(req.params['id']!, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await recurringService.toggleActive(req.params['id']!, true);
      res.json({ success: true, message: 'Gabarit activé' });
    } catch (err) {
      next(err);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await recurringService.toggleActive(req.params['id']!, false);
      res.json({ success: true, message: 'Gabarit désactivé' });
    } catch (err) {
      next(err);
    }
  }

  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await recurringService.generate(req.params['id']!, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await recurringService.softDelete(req.params['id']!);
      res.json({ success: true, message: 'Gabarit supprimé' });
    } catch (err) {
      next(err);
    }
  }
}

export const recurringController = new RecurringController();
