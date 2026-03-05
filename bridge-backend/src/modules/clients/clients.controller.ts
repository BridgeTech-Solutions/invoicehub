import { Request, Response, NextFunction } from 'express';
import { clientsService } from './clients.service';
import { createClientSchema, updateClientSchema, listClientsSchema } from './clients.schema';

export class ClientsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listClientsSchema.parse(req.query);
      const result = await clientsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientsService.findById(req.params['id']!);
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
      const client = await clientsService.update(req.params['id']!, input);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  async archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await clientsService.archive(req.params['id']!);
      res.json({ success: true, message: 'Client archivé' });
    } catch (err) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await clientsService.getSummary(req.params['id']!);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }
}

export const clientsController = new ClientsController();
