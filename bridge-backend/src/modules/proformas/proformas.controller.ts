import { Request, Response, NextFunction } from 'express';
import { proformasService } from './proformas.service';
import { sendCsvResponse } from '../../lib/csv';
import {
  createProformaSchema,
  updateProformaSchema,
  listProformasSchema,
  rejectProformaSchema,
  convertProformaSchema,
} from './proformas.schema';

export class ProformasController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listProformasSchema.parse(req.query);

      if (req.query['export'] === 'csv') {
        const { data } = await proformasService.list({ ...query, page: 1, limit: 10_000 });
        return sendCsvResponse(res, 'proformas.csv',
          ['Numéro', 'Client', 'Statut', 'Date émission', 'Valide jusqu\'au', 'Total TTC'],
          data.map(p => [
            p.number,
            (p.client as { name: string }).name,
            p.status,
            new Date(p.issueDate).toLocaleDateString('fr-FR'),
            new Date(p.validUntil).toLocaleDateString('fr-FR'),
            Number(p.totalTtc),
          ]),
        );
      }

      const result = await proformasService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await proformasService.findById(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createProformaSchema.parse(req.body);
      const data = await proformasService.create(input, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateProformaSchema.parse(req.body);
      const data = await proformasService.update(req.params['id'] as string, input, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async send(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await proformasService.send(req.params['id'] as string, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await proformasService.accept(req.params['id'] as string, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = rejectProformaSchema.parse(req.body);
      const data = await proformasService.reject(req.params['id'] as string, req.user!.id, reason);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = convertProformaSchema.parse(req.body);
      const data = await proformasService.convertToInvoice(req.params['id'] as string, req.user!.id, options);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { buffer, filename } = await proformasService.generatePdfResponse(req.params['id'] as string);
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

  async duplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await proformasService.duplicate(req.params['id'] as string, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await proformasService.softDelete(req.params['id'] as string);
      res.json({ success: true, message: 'Proforma supprimée' });
    } catch (err) {
      next(err);
    }
  }
}

export const proformasController = new ProformasController();
