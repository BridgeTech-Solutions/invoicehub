import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { auditService } from './audit.service';
import { sendCsvResponse } from '../../lib/csv';

const listSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(50),
  userId:     z.string().uuid().optional(),
  entityType: z.string().optional(),
  action:     z.nativeEnum(AuditAction).optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
  export:     z.enum(['csv']).optional(),
});

export class AuditController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, userId, entityType, action, dateFrom, dateTo, export: fmt } = listSchema.parse(req.query);

      if (fmt === 'csv') {
        const data = await auditService.listAll({ userId, entityType, action, dateFrom, dateTo });
        sendCsvResponse(res, 'audit-logs.csv',
          ['Date', 'Utilisateur', 'Email', 'Action', 'Table', 'Enregistrement', 'IP'],
          data.map(l => [
            l.createdAt.toISOString(),
            l.user ? `${l.user.firstName} ${l.user.lastName}` : 'Système',
            l.user?.email ?? '',
            l.action, l.entityType ?? '', l.entityId ?? '', l.ipAddress ?? '',
          ]),
        );
        return;
      }

      const result = await auditService.list({ page, limit, userId, entityType, action, dateFrom, dateTo });
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await auditService.stats();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const auditController = new AuditController();
