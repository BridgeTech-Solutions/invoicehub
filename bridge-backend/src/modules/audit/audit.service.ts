import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/database';

export interface ListAuditLogsInput {
  page:        number;
  limit:       number;
  userId?:     string;
  entityType?: string;
  action?:     AuditAction;
  dateFrom?:   Date;
  dateTo?:     Date;
}

export class AuditService {
  async list(input: ListAuditLogsInput) {
    const { page, limit, userId, entityType, action, dateFrom, dateTo } = input;
    const skip  = (page - 1) * limit;

    const where = {
      ...(userId     && { userId }),
      ...(entityType && { entityType }),
      ...(action     && { action }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo   && { lte: dateTo }),
        },
      }),
    };

    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listAll(input: Omit<ListAuditLogsInput, 'page' | 'limit'>) {
    const { userId, entityType, action, dateFrom, dateTo } = input;
    const where = {
      ...(userId     && { userId }),
      ...(entityType && { entityType }),
      ...(action     && { action }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo   && { lte: dateTo }),
        },
      }),
    };
    return prisma.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async stats() {
    const [topUsers, topTables, topActions, dailyActivity] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['userId'],
        where:   { userId: { not: null } },
        _count:  true,
        orderBy: { _count: { userId: 'desc' } },
        take:    10,
      }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        where:   { entityType: { not: null } },
        _count:  true,
        orderBy: { _count: { entityType: 'desc' } },
        take:    10,
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count:  true,
        orderBy: { _count: { action: 'desc' } },
      }),
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE(created_at) AS day, COUNT(*)::bigint AS count
        FROM audit_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `,
    ]);

    const userIds = topUsers.map(u => u.userId).filter(Boolean) as string[];
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      topUsers:      topUsers.map(u => ({ user: userMap.get(u.userId!), count: u._count })),
      topTables:     topTables.map(t => ({ table: t.entityType, count: t._count })),
      topActions:    topActions.map(a => ({ action: a.action, count: a._count })),
      dailyActivity: dailyActivity.map(d => ({ day: d.day, count: Number(d.count) })),
    };
  }
}

export const auditService = new AuditService();
