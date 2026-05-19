import { z } from 'zod';
import { AuditAction } from '@prisma/client';

export const listAuditLogsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(50),
  userId:     z.string().uuid().optional(),
  entityType: z.string().optional(),
  action:     z.nativeEnum(AuditAction).optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
  export:     z.enum(['csv']).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;
