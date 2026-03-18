import { Request, Response, NextFunction } from 'express';
import { invoicesService } from './invoices.service';
import { sendCsvResponse } from '../../lib/csv';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
  cancelInvoiceSchema,
  computeInvoiceSchema,
  createAvoirSchema,
} from './invoices.schema';

export class InvoicesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listInvoicesSchema.parse(req.query);

      if (req.query['export'] === 'csv') {
        const { data } = await invoicesService.list({ ...query, page: 1, limit: 10_000 });
        return sendCsvResponse(res, 'factures.csv',
          ['Numéro', 'Client', 'Type', 'Statut', 'Date émission', 'Échéance', 'Total TTC', 'Payé', 'Solde'],
          data.map(i => [
            i.number,
            (i.client as { name: string }).name,
            i.type,
            i.status,
            new Date(i.issueDate).toLocaleDateString('fr-FR'),
            new Date(i.dueDate).toLocaleDateString('fr-FR'),
            Number(i.totalTtc),
            Number(i.amountPaid),
            Number(i.balanceDue),
          ]),
        );
      }

      const result = await invoicesService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await invoicesService.findById(req.params['id']!);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createInvoiceSchema.parse(req.body);
      const data = await invoicesService.create(input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateInvoiceSchema.parse(req.body);
      const data = await invoicesService.update(req.params['id']!, input, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async issue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await invoicesService.issue(req.params['id']!, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = cancelInvoiceSchema.parse(req.body);
      const data = await invoicesService.cancel(req.params['id']!, req.user!.id, reason);
      res.json({ success: true, data, message: 'Facture annulée et avoir créé automatiquement' });
    } catch (err) {
      next(err);
    }
  }

  async compute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = computeInvoiceSchema.parse(req.body);
      const data  = await invoicesService.compute(input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await invoicesService.duplicate(req.params['id']!, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async createAvoir(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createAvoirSchema.parse(req.body);
      const data = await invoicesService.createAvoir(req.params['id']!, input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }

  async getPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { buffer, filename } = await invoicesService.generatePdfResponse(req.params['id']!);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}

export const invoicesController = new InvoicesController();
