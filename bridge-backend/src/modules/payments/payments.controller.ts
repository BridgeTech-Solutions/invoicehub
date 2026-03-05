import { Request, Response, NextFunction } from 'express';
import { paymentsService } from './payments.service';
import { createPaymentSchema, listPaymentsSchema } from './payments.schema';

export class PaymentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listPaymentsSchema.parse(req.query);
      const result = await paymentsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createPaymentSchema.parse(req.body);
      const invoiceId = req.params['id']!;
      const data = await paymentsService.create(invoiceId, input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await paymentsService.softDelete(req.params['id']!);
      res.json({ success: true, message: 'Paiement supprimé' });
    } catch (err) {
      next(err);
    }
  }
}

export const paymentsController = new PaymentsController();
