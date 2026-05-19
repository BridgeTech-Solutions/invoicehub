import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../common/decorators/inject-redis.decorator';
import type { Redis } from 'ioredis';

const KPIS_CACHE_KEY = 'dashboard:kpis';
const KPIS_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── Cache ─────────────────────────────────────────────────────────────────

  async getKpis() {
    const cached = await this.redis.get(KPIS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
    const result = await this._computeKpis();
    await this.redis.setex(KPIS_CACHE_KEY, KPIS_CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async invalidateCache(): Promise<void> {
    await this.redis.del(KPIS_CACHE_KEY);
    this.eventEmitter.emit('dashboard.cache.invalidated', { timestamp: new Date().toISOString() });
  }

  @OnEvent('payment.created')
  @OnEvent('invoice.issued')
  @OnEvent('invoice.cancelled')
  @OnEvent('invoice.paid')
  async onCriticalDataChange() {
    await this.invalidateCache();
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────

  private async _computeKpis() {
    const now = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      invoicesTotal, invoicesThisMonth, overdueInvoices, paidThisMonth,
      pendingPayments, draftInvoices, clientsCount, proformasThisMonth,
      recentInvoices, topClients, monthlyRevenue,
      purchasesThisMonth, outstandingPayables, expensesThisMonth,
      cashPosition, topSuppliers, expensesByCategory,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true }, _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] }, issueDate: { gte: startOfMonth } },
        _sum: { totalTtc: true }, _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] }, dueDate: { lt: now } },
        _sum: { balanceDue: true }, _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { deletedAt: null, paymentDate: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
        _sum: { balanceDue: true }, _count: true,
      }),
      this.prisma.invoice.count({ where: { deletedAt: null, status: 'draft' as any } }),
      this.prisma.client.count({ where: { deletedAt: null, status: 'active' as any } }),
      this.prisma.proforma.aggregate({ where: { deletedAt: null, issueDate: { gte: startOfMonth } }, _count: true }),
      this.prisma.invoice.findMany({
        where: { deletedAt: null },
        orderBy: { issueDate: 'desc' }, take: 10,
        select: { id: true, number: true, status: true, totalTtc: true, issueDate: true, dueDate: true, client: { select: { name: true } } },
      }),
      this.prisma.invoice.groupBy({
        by: ['clientId'], where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true }, orderBy: { _sum: { totalTtc: 'desc' } }, take: 5,
      }),
      this.prisma.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT TO_CHAR(issue_date, 'YYYY-MM') AS month, SUM(total_ttc)::numeric AS total
        FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
          AND issue_date >= ${startOf12Months}
        GROUP BY month ORDER BY month ASC`,
      this.prisma.supplierInvoice.aggregate({
        where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] }, invoiceDate: { gte: startOfMonth } },
        _sum: { totalTtc: true }, _count: true,
      }),
      this.prisma.supplierInvoice.aggregate({
        where: { deletedAt: null, status: { in: ['validated', 'partially_paid'] } },
        _sum: { balanceDue: true }, _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { deletedAt: null, status: { in: ['approved', 'paid'] }, expenseDate: { gte: startOfMonth } },
        _sum: { amountTtc: true }, _count: true,
      }),
      this.prisma.bankAccount.aggregate({ where: { deletedAt: null, isActive: true }, _sum: { currentBalance: true }, _count: true }),
      this.prisma.supplierInvoice.groupBy({
        by: ['supplierId'], where: { deletedAt: null, status: { notIn: ['draft', 'cancelled'] } },
        _sum: { totalTtc: true }, orderBy: { _sum: { totalTtc: 'desc' } }, take: 5,
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, status: { in: ['approved', 'paid'] }, expenseDate: { gte: startOfMonth } },
        _sum: { amountTtc: true }, _count: true, orderBy: { _sum: { amountTtc: 'desc' } }, take: 10,
      }),
    ]);

    const clientIds   = topClients.map(c => c.clientId);
    const clientNames = await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } });
    const clientMap   = new Map(clientNames.map(c => [c.id, c.name]));

    const supplierIds   = topSuppliers.map(s => s.supplierId);
    const supplierNames = await this.prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } });
    const supplierMap   = new Map(supplierNames.map(s => [s.id, s.name]));

    const categoryIds   = expensesByCategory.map(e => e.categoryId).filter(Boolean) as string[];
    const categoryNames = categoryIds.length > 0
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const categoryMap = new Map(categoryNames.map(c => [c.id, c.name]));

    const stockAlertsCount = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::int AS count FROM products
      WHERE deleted_at IS NULL AND track_stock = true AND stock_quantity < min_stock_level`
      .then(rows => Number(rows[0]?.count ?? 0)).catch(() => 0);

    const totalSalesMonth     = Number(invoicesThisMonth._sum.totalTtc ?? 0);
    const totalPurchasesMonth = Number(purchasesThisMonth._sum.totalTtc ?? 0);

    return {
      invoices:  { totalAmount: Number(invoicesTotal._sum.totalTtc ?? 0), totalCount: invoicesTotal._count, thisMonthAmount: totalSalesMonth, thisMonthCount: invoicesThisMonth._count },
      overdue:   { amount: Number(overdueInvoices._sum.balanceDue ?? 0), count: overdueInvoices._count },
      payments:  { thisMonthAmount: Number(paidThisMonth._sum.amount ?? 0) },
      pending:   { amount: Number(pendingPayments._sum.balanceDue ?? 0), count: pendingPayments._count },
      drafts:    { count: draftInvoices },
      clients:   { activeCount: clientsCount },
      proformas: { thisMonthCount: proformasThisMonth._count },
      purchases: { thisMonthAmount: totalPurchasesMonth, thisMonthCount: purchasesThisMonth._count },
      payables:  { outstandingAmount: Number(outstandingPayables._sum?.balanceDue ?? 0), count: outstandingPayables._count },
      expenses:  { thisMonthAmount: Number(expensesThisMonth._sum.amountTtc ?? 0), thisMonthCount: expensesThisMonth._count },
      grossMarginMonth: totalSalesMonth - totalPurchasesMonth,
      cashPosition:     { total: Number(cashPosition._sum.currentBalance ?? 0), accountCount: cashPosition._count },
      stockAlerts:      stockAlertsCount,
      recentInvoices,
      topClients:    topClients.map(c => ({ clientId: c.clientId, clientName: clientMap.get(c.clientId) ?? 'Inconnu', totalRevenue: Number(c._sum.totalTtc ?? 0) })),
      topSuppliers:  topSuppliers.map(s => ({ supplierId: s.supplierId, supplierName: supplierMap.get(s.supplierId) ?? 'Inconnu', totalPurchases: Number(s._sum.totalTtc ?? 0) })),
      expensesByCategory: expensesByCategory.map(e => ({ categoryId: e.categoryId, categoryName: e.categoryId ? (categoryMap.get(e.categoryId) ?? 'Sans catégorie') : 'Sans catégorie', totalAmount: Number(e._sum.amountTtc ?? 0), count: e._count })),
      monthlyRevenue: monthlyRevenue.map(r => ({ month: r.month, total: Number(r.total) })),
    };
  }

  // ── Cashflow Forecast ──────────────────────────────────────────────────────

  async getCashflowForecast() {
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);

    type BehaviorRow = { client_id: string; avg_days_late: number | null };

    const [pendingInvoices, clientBehaviorRaw] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
        select: { id: true, clientId: true, dueDate: true, balanceDue: true },
      }),
      this.prisma.$queryRaw<BehaviorRow[]>`
        SELECT inv.client_id,
               AVG((pay.payment_date::date - inv.due_date::date)) AS avg_days_late
        FROM payments pay JOIN invoices inv ON inv.id = pay.invoice_id
        WHERE inv.deleted_at IS NULL AND pay.deleted_at IS NULL
        GROUP BY inv.client_id`,
    ]);

    const avgDelayMap = new Map<string, number>();
    for (const row of clientBehaviorRaw) {
      if (row.avg_days_late !== null) avgDelayMap.set(row.client_id, Math.round(Number(row.avg_days_late)));
    }

    const dayMap = new Map<string, { expected: number; invoiceCount: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      dayMap.set(d.toISOString().split('T')[0]!, { expected: 0, invoiceCount: 0 });
    }

    for (const inv of pendingInvoices) {
      const avgDelay = avgDelayMap.get(inv.clientId) ?? 0;
      const predicted = new Date(inv.dueDate);
      predicted.setDate(predicted.getDate() + avgDelay);
      predicted.setHours(0, 0, 0, 0);
      if (predicted < today) predicted.setTime(today.getTime());
      const key = predicted.toISOString().split('T')[0]!;
      const existing = dayMap.get(key);
      if (existing) { existing.expected += Number(inv.balanceDue); existing.invoiceCount += 1; }
    }

    const days = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cumulative = 0;
    return days.map(([date, { expected, invoiceCount }]) => {
      cumulative += expected;
      return { date, expected: Math.round(expected), invoiceCount, cumulative: Math.round(cumulative) };
    });
  }

  // ── Aging ─────────────────────────────────────────────────────────────────

  async getAging() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
      select: { dueDate: true, balanceDue: true },
    });

    const buckets = {
      current:    { amount: 0, count: 0 },
      days_1_30:  { amount: 0, count: 0 },
      days_31_60: { amount: 0, count: 0 },
      days_61_90: { amount: 0, count: 0 },
      over_90:    { amount: 0, count: 0 },
    };

    for (const inv of invoices) {
      const daysLate = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      const amount   = Number(inv.balanceDue);
      if      (daysLate <= 0)  { buckets.current.amount    += amount; buckets.current.count++;    }
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
