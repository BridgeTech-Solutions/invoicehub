import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { AuditService } from './audit.service';
import { sendCsvResponse } from '../../lib/csv';

const listSchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  userId:     z.string().uuid().optional(),
  entityType: z.string().optional(),
  action:     z.string().optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
  export:     z.string().optional(),
});

@Controller('audit-logs')
@Permission('audit:read')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('stats')
  async stats() {
    return this.auditService.stats();
  }

  @Get()
  @SkipResponseWrapper()
  async list(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { export: exportFormat, page, limit, userId, entityType, action, dateFrom, dateTo } = listSchema.parse(query);

    if (exportFormat === 'csv') {
      const rows = await this.auditService.listAll({ userId, entityType, action: action as any, dateFrom, dateTo });
      sendCsvResponse(
        res,
        'audit-logs.csv',
        ['Date', 'Utilisateur', 'Email', 'Action', 'Entité', 'ID entité', 'IP', 'User Agent'],
        rows.map(r => [
          new Date(r.createdAt).toISOString(),
          r.user ? `${(r.user as any).firstName} ${(r.user as any).lastName}` : '',
          r.user ? (r.user as any).email : '',
          r.action,
          r.entityType ?? '',
          r.entityId   ?? '',
          r.ipAddress  ?? '',
          r.userAgent  ?? '',
        ]),
      );
      return;
    }

    const result = await this.auditService.list({ page, limit, userId, entityType, action: action as any, dateFrom, dateTo });
    res.json({ success: true, ...result });
  }
}
