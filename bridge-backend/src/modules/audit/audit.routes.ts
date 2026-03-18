/**
 * @module modules/audit/audit.routes
 * Consultation du journal d'audit — accès admin uniquement.
 *
 * Endpoints :
 *  GET /api/audit-logs          — Liste paginée avec filtres
 *  GET /api/audit-logs?export=csv — Export CSV complet de la période
 *  GET /api/audit-logs/stats    — Statistiques d'activité
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';
import { sendCsvResponse } from '../../lib/csv';

export const auditRouter = Router();

auditRouter.use(authenticate, authorize('admin'));

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

auditRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [topUsers, topTables, topActions, dailyActivity] = await Promise.all([
      // Top 10 utilisateurs les plus actifs
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),

      // Tables les plus modifiées
      prisma.auditLog.groupBy({
        by: ['entityType'],
        _count: true,
        orderBy: { _count: { entityType: 'desc' } },
        take: 10,
      }),

      // Répartition par action
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
      }),

      // Activité des 30 derniers jours
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE(created_at) AS day, COUNT(*)::bigint AS count
        FROM audit_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `,
    ]);

    // Résoudre les noms des utilisateurs
    const userIds = topUsers.map(u => u.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json({
      success: true,
      data: {
        topUsers:      topUsers.map(u => ({ user: userMap.get(u.userId!), count: u._count })),
        topTables:     topTables.map(t => ({ table: t.entityType, count: t._count })),
        topActions:    topActions.map(a => ({ action: a.action, count: a._count })),
        dailyActivity: dailyActivity.map(d => ({ day: d.day, count: Number(d.count) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, userId, entityType, action, dateFrom, dateTo, export: fmt } = listSchema.parse(req.query);

    const where = {
      ...(userId     && { userId }),
      ...(entityType && { entityType }),
      ...(action     && { action }),
      ...(dateFrom   && { createdAt: { gte: dateFrom } }),
      ...(dateTo     && { createdAt: { lte: dateTo } }),
    };

    // Export CSV — retourne tous les enregistrements sans pagination
    if (fmt === 'csv') {
      const data = await prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return sendCsvResponse(res, 'audit-logs.csv',
        ['Date', 'Utilisateur', 'Email', 'Action', 'Table', 'Enregistrement', 'IP'],
        data.map(l => [
          l.createdAt.toISOString(),
          l.user ? `${l.user.firstName} ${l.user.lastName}` : 'Système',
          l.user?.email ?? '',
          l.action, l.entityType ?? '', l.entityId ?? '', l.ipAddress ?? '',
        ]),
      );
    }

    const skip = (page - 1) * limit;
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

    res.json({ success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});
