import { Request, Response, NextFunction } from 'express';
import { invoicesService } from './invoices.service';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
  cancelInvoiceSchema,
} from './invoices.schema';

export class InvoicesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listInvoicesSchema.parse(req.query);
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
