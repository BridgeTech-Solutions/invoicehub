import { prisma } from '../../config/database';
import { redisConnection } from '../../config/redis';
import { emitToAll } from '../../lib/socket';

const KPIS_CACHE_KEY = 'dashboard:kpis';
const KPIS_CACHE_TTL = 300; // 5 minutes

export class DashboardService {
  async getKpis() {
    const cached = await redisConnection.get(KPIS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as ReturnType<typeof this._computeKpis> extends Promise<infer T> ? T : never;

    const result = await this._computeKpis();
    await redisConnection.setex(KPIS_CACHE_KEY, KPIS_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /** Invalide le cache et notifie tous les clients connectés de recharger le dashboard */
  static async invalidateCache(): Promise<void> {
    await redisConnection.del(KPIS_CACHE_KEY);
    emitToAll('dashboard:refresh', { timestamp: new Date().toISOString() });
  }

  private async _computeKpis() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      invoicesTotal,
      invoicesThisMonth,
      overdueInvoices,
      paidThisMonth,
      pendingPayments,
      draftInvoices,
      clientsCount,
      proformasThisMonth,
      recentInvoices,
      topClients,
      monthlyRevenue,
    ] = await Promise.all([
      // Total facturé (toutes factures émises — hors draft et cancelled)
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true },
        _count: true,
      }),

      // Factures ce mois
      prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: { notIn: ['draft', 'cancelled'] },
          issueDate: { gte: startOfMonth },
        },
        _sum: { totalTtc: true },
        _count: true,
      }),

      // Factures en retard
      prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] },
          dueDate: { lt: now },
        },
        _sum: { balanceDue: true },
        _count: true,
      }),

      // Encaissements ce mois
      prisma.payment.aggregate({
        where: {
          deletedAt: null,
          paymentDate: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),

      // Total en attente de paiement
      prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: { in: ['issued', 'partially_paid', 'overdue'] },
        },
        _sum: { balanceDue: true },
        _count: true,
      }),

      // Factures en brouillon (pas encore émises)
      prisma.invoice.count({
        where: { deletedAt: null, status: 'draft' },
      }),

      // Nombre de clients actifs
      prisma.client.count({
        where: { deletedAt: null, status: 'active' },
      }),

      // Proformas ce mois
      prisma.proforma.aggregate({
        where: { deletedAt: null, issueDate: { gte: startOfMonth } },
        _count: true,
      }),

      // 10 dernières factures
      prisma.invoice.findMany({
        where: { deletedAt: null },
        orderBy: { issueDate: 'desc' },
        take: 10,
        select: {
          id: true,
          number: true,
          status: true,
          totalTtc: true,
          issueDate: true,
          dueDate: true,
          client: { select: { name: true } },
        },
      }),

      // Top 5 clients par CA
      prisma.invoice.groupBy({
        by: ['clientId'],
        where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true },
        orderBy: { _sum: { totalTtc: 'desc' } },
        take: 5,
      }),

      // CA mensuel (12 derniers mois)
      prisma.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT
          TO_CHAR(issue_date, 'YYYY-MM') AS month,
          SUM(total_ttc)::numeric AS total
        FROM invoices
        WHERE deleted_at IS NULL
          AND status NOT IN ('draft', 'cancelled')
          AND issue_date >= ${startOfYear}   
        GROUP BY month
        ORDER BY month ASC
      `,
    ]);

    // Résoudre les noms des top clients
    const clientIds = topClients.map(c => c.clientId);
    const clientNames = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true },
    });
    const clientMap = new Map(clientNames.map(c => [c.id, c.name]));

    return {
      invoices: {
        totalAmount: Number(invoicesTotal._sum.totalTtc ?? 0),
        totalCount: invoicesTotal._count,
        thisMonthAmount: Number(invoicesThisMonth._sum.totalTtc ?? 0),
        thisMonthCount: invoicesThisMonth._count,
      },
      overdue: {
        amount: Number(overdueInvoices._sum.balanceDue ?? 0),
        count: overdueInvoices._count,
      },
      payments: {
        thisMonthAmount: Number(paidThisMonth._sum.amount ?? 0),
      },
      pending: {
        amount: Number(pendingPayments._sum.balanceDue ?? 0),
        count: pendingPayments._count,
      },
      drafts: {
        count: draftInvoices,
      },
      clients: {
        activeCount: clientsCount,
      },
      proformas: {
        thisMonthCount: proformasThisMonth._count,
      },
      recentInvoices,
      topClients: topClients.map(c => ({
        clientId: c.clientId,
        clientName: clientMap.get(c.clientId) ?? 'Inconnu',
        totalRevenue: Number(c._sum.totalTtc ?? 0),
      })),
      monthlyRevenue: monthlyRevenue.map(r => ({
        month: r.month,
        total: Number(r.total),
      })),
    };
  }

  async getAging() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const invoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
      },
      select: { dueDate: true, balanceDue: true },
    });

    const buckets = {
      current: { amount: 0, count: 0 },
      days_1_30:  { amount: 0, count: 0 },
      days_31_60: { amount: 0, count: 0 },
      days_61_90: { amount: 0, count: 0 },
      over_90:    { amount: 0, count: 0 },
    };

    for (const inv of invoices) {
      const daysLate = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      const amount = Number(inv.balanceDue);

      if (daysLate <= 0)       { buckets.current.amount    += amount; buckets.current.count++;    }
      else if (daysLate <= 30) { buckets.days_1_30.amount  += amount; buckets.days_1_30.count++;  }
      else if (daysLate <= 60) { buckets.days_31_60.amount += amount; buckets.days_31_60.count++; }
      else if (daysLate <= 90) { buckets.days_61_90.amount += amount; buckets.days_61_90.count++; }
      else                     { buckets.over_90.amount    += amount; buckets.over_90.count++;    }
    }

    const total = Object.values(buckets).reduce(
      (acc, b) => ({ amount: acc.amount + b.amount, count: acc.count + b.count }),
      { amount: 0, count: 0 },
    );

    return { ...buckets, total };
  }
}

export const dashboardService = new DashboardService();
