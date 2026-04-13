import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clientsService } from './clients.service';
import type { ImportClientRow } from './clients.service';
import { sendCsvResponse } from '../../lib/csv';
import { createClientSchema, updateClientSchema, listClientsSchema } from './clients.schema';

const importRowSchema = z.object({
  type:                z.enum(['company', 'individual']).optional(),
  name:                z.string().min(1).max(255),
  email:               z.string().max(255).optional(),
  phone:               z.string().max(50).optional(),
  phone2:              z.string().max(50).optional(),
  address:             z.string().optional(),
  city:                z.string().max(100).optional(),
  country:             z.string().max(100).optional(),
  postalBox:           z.string().max(50).optional(),
  taxNumber:           z.string().max(100).optional(),
  rccm:                z.string().max(100).optional(),
  bankName:            z.string().max(255).optional(),
  bankAccount:         z.string().max(100).optional(),
  currency:            z.string().max(3).optional(),
  defaultPaymentTerms: z.string().optional(),
  internalNotes:       z.string().optional(),
});

const importBodySchema = z.object({
  rows: z.array(importRowSchema).min(1).max(1000),
});

export class ClientsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listClientsSchema.parse(req.query);

      if (req.query['export'] === 'csv') {
        const { data } = await clientsService.list({ ...query, page: 1, limit: 10_000 });
        return sendCsvResponse(res, 'clients.csv',
          ['Nom', 'Email', 'Téléphone', 'NIU', 'RCCM', 'Ville', 'Pays', 'Type'],
          data.map(c => [
            c.name,
            c.email ?? '',
            c.phone ?? '',
            c.taxNumber ?? '',
            c.rccm ?? '',
            c.city ?? '',
            c.country ?? '',
            c.type,
          ]),
        );
      }

      const result = await clientsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientsService.findById(req.params['id'] as string);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createClientSchema.parse(req.body);
      const client = await clientsService.create(input, req.user!.id);
      res.status(201).json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateClientSchema.parse(req.body);
      const client = await clientsService.update(req.params['id'] as string, input);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  async archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await clientsService.archive(req.params['id'] as string);
      res.json({ success: true, message: 'Client archivé' });
    } catch (err) {
      next(err);
    }
  }

  async quickFill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await clientsService.quickFill(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getRiskScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await clientsService.getRiskScore(req.params['id'] as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await clientsService.getSummary(req.params['id'] as string);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }

  async importClients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rows } = importBodySchema.parse(req.body);
      const result = await clientsService.importClients(
        rows as ImportClientRow[],
        req.user!.id,
      );
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const clientsController = new ClientsController();
