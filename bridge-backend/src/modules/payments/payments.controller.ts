import { Request, Response, NextFunction } from 'express';
import { paymentsService } from './payments.service';
import { sendCsvResponse } from '../../lib/csv';
import { createPaymentSchema, listPaymentsSchema } from './payments.schema';

export class PaymentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listPaymentsSchema.parse(req.query);

      if (req.query['export'] === 'csv') {
        const { data } = await paymentsService.list({ ...query, page: 1, limit: 10_000 });
        return sendCsvResponse(res, 'paiements.csv',
          ['Référence', 'Facture', 'Client', 'Montant', 'Méthode', 'Date paiement'],
          data.map(p => {
            const inv = p.invoice as { number: string; client: { name: string } };
            return [
              p.reference ?? '',
              inv.number,
              inv.client.name,
              Number(p.amount),
              p.method,
              new Date(p.paymentDate).toLocaleDateString('fr-FR'),
            ];
          }),
        );
      }

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

  async getReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { buffer, filename } = await paymentsService.generateReceipt(req.params['id']!);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (err) { next(err); }
  }
}

export const paymentsController = new PaymentsController();
