import { prisma } from '../../config/database';

export class DashboardService {
  async getKpis() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      invoicesTotal,
      invoicesThisMonth,
      overdueInvoices,
      paidThisMonth,
      pendingPayments,
      clientsCount,
      proformasThisMonth,
      recentInvoices,
      topClients,
      monthlyRevenue,
    ] = await Promise.all([
      // Total facturé (toutes factures émises)
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
        include: { client: { select: { name: true } } },
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
}

export const dashboardService = new DashboardService();
