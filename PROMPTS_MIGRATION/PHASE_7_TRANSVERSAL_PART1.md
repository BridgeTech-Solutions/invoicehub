# PHASE 7 — MODULES TRANSVERSAUX : NestJS MIGRATION PROMPT (Partie 1/2)

## Périmètre
Dashboard · Search · Reports · Audit · Backups · Settings · SettingsAdvanced · AI

---

## Décisions d'architecture

| # | Décision | Raison |
|---|---|---|
| 1 | **DashboardService** : Redis via `{ provide: 'REDIS_CLIENT', useValue: redisConnection }` — `invalidateCache()` devient méthode d'instance avec `@OnEvent` listeners | Évite dépendances circulaires entre modules |
| 2 | **reports.renderer.ts + search.parser.ts** : pure TS, copiés tels quels, importés directement dans les services/controllers (PAS @Injectable) | Pas de dépendances Prisma ni DI |
| 3 | **ai.tools.ts** : fonctions PLIÉES dans `AiService` (méthodes privées) — besoin de `PrismaService` via DI | Le fichier original accède à `prisma` global |
| 4 | **AI SSE streaming** : `@Res() res: Response` sans passthrough + `@SkipResponseWrapper()` | `res.write()` / `res.end()` incompatibles avec passthrough |
| 5 | **Reports multi-format** : `@Res() res: Response` + `@SkipResponseWrapper()` sur les 8 méthodes | JSON / CSV / PDF dans le même handler |
| 6 | **SettingsAdvancedModule** : 6 `@Controller` dans 1 `@Module`, 1 `@Injectable` service | Miroir des 6 routers Express séparés |
| 7 | **BackupsService.runBackup()** : appelé depuis `BackupProcessor` (WorkerHost) — BackupProcessor dans BackupsModule | Même pattern que BankImportProcessor (Phase 5) |
| 8 | **Throttling AI** : `ThrottlerModule` global (20 req/60s pour AI, guard configuré par route) ; backups : guard Redis custom `BackupRateLimitGuard` | Contextes différents : par-IP global vs par-userId custom |

---

## 1. DashboardModule

### 1.1 DashboardService

```typescript
// src/modules/dashboard/dashboard.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import type { Redis } from 'ioredis';

const REDIS_CLIENT  = 'REDIS_CLIENT';
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
    // Notifie le WsGateway (si présent) de forcer un rechargement côté frontend
    this.eventEmitter.emit('dashboard.cache.invalidated', { timestamp: new Date().toISOString() });
  }

  // Auto-invalidation sur les événements métier critiques
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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
      this.prisma.invoice.count({ where: { deletedAt: null, status: 'draft' } }),
      this.prisma.client.count({ where: { deletedAt: null, status: 'active' } }),
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

    const clientIds = topClients.map(c => c.clientId);
    const clientNames = await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } });
    const clientMap = new Map(clientNames.map(c => [c.id, c.name]));

    const supplierIds = topSuppliers.map(s => s.supplierId);
    const supplierNames = await this.prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } });
    const supplierMap = new Map(supplierNames.map(s => [s.id, s.name]));

    const categoryIds = expensesByCategory.map(e => e.categoryId).filter(Boolean) as string[];
    const categoryNames = categoryIds.length > 0
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const categoryMap = new Map(categoryNames.map(c => [c.id, c.name]));

    const stockAlertsCount = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::int AS count FROM products
      WHERE deleted_at IS NULL AND track_stock = true AND stock_quantity < min_stock_level`
      .then(rows => Number(rows[0]?.count ?? 0)).catch(() => 0);

    const totalSalesMonth    = Number(invoicesThisMonth._sum.totalTtc ?? 0);
    const totalPurchasesMonth = Number(purchasesThisMonth._sum.totalTtc ?? 0);

    return {
      invoices: { totalAmount: Number(invoicesTotal._sum.totalTtc ?? 0), totalCount: invoicesTotal._count, thisMonthAmount: totalSalesMonth, thisMonthCount: invoicesThisMonth._count },
      overdue:  { amount: Number(overdueInvoices._sum.balanceDue ?? 0), count: overdueInvoices._count },
      payments: { thisMonthAmount: Number(paidThisMonth._sum.amount ?? 0) },
      pending:  { amount: Number(pendingPayments._sum.balanceDue ?? 0), count: pendingPayments._count },
      drafts:   { count: draftInvoices },
      clients:  { activeCount: clientsCount },
      proformas: { thisMonthCount: proformasThisMonth._count },
      purchases: { thisMonthAmount: totalPurchasesMonth, thisMonthCount: purchasesThisMonth._count },
      payables:  { outstandingAmount: Number(outstandingPayables._sum?.balanceDue ?? 0), count: outstandingPayables._count },
      expenses:  { thisMonthAmount: Number(expensesThisMonth._sum.amountTtc ?? 0), thisMonthCount: expensesThisMonth._count },
      grossMarginMonth: totalSalesMonth - totalPurchasesMonth,
      cashPosition:     { total: Number(cashPosition._sum.currentBalance ?? 0), accountCount: cashPosition._count },
      stockAlerts:      stockAlertsCount,
      recentInvoices,
      topClients: topClients.map(c => ({ clientId: c.clientId, clientName: clientMap.get(c.clientId) ?? 'Inconnu', totalRevenue: Number(c._sum.totalTtc ?? 0) })),
      topSuppliers: topSuppliers.map(s => ({ supplierId: s.supplierId, supplierName: supplierMap.get(s.supplierId) ?? 'Inconnu', totalPurchases: Number(s._sum.totalTtc ?? 0) })),
      expensesByCategory: expensesByCategory.map(e => ({ categoryId: e.categoryId, categoryName: e.categoryId ? (categoryMap.get(e.categoryId) ?? 'Sans catégorie') : 'Sans catégorie', totalAmount: Number(e._sum.amountTtc ?? 0), count: e._count })),
      monthlyRevenue: monthlyRevenue.map(r => ({ month: r.month, total: Number(r.total) })),
    };
  }

  // ── Cashflow Forecast ──────────────────────────────────────────────────────

  async getCashflowForecast() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
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
```

### 1.2 DashboardController

```typescript
// src/modules/dashboard/dashboard.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('dashboard:read')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('aging')
  getAging() {
    return this.dashboardService.getAging();
  }

  @Get('cashflow')
  getCashflow() {
    return this.dashboardService.getCashflowForecast();
  }
}
```

### 1.3 DashboardModule

```typescript
// src/modules/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { redisConnection } from '../../config/redis';       // IORedis singleton existant
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  providers: [
    DashboardService,
    { provide: 'REDIS_CLIENT', useValue: redisConnection }, // ← injection via token
  ],
  controllers: [DashboardController],
  exports: [DashboardService],   // ← export pour que d'autres modules puissent appeler invalidateCache()
})
export class DashboardModule {}
```

---

## 2. SearchModule

### 2.1 SearchService

```typescript
// src/modules/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// ↓ Copier search.parser.ts tel quel dans le même dossier — import direct (PAS @Injectable)
import { parseSearchQuery, describeParsedQuery } from './search.parser';

const MODE = 'insensitive' as const;

function buildDateFilter(year: number | null, month: number | null) {
  if (!year && !month) return null;
  const now = new Date(); const y = year ?? now.getFullYear();
  if (month) return { gte: new Date(y, month - 1, 1), lt: new Date(y, month, 1) };
  return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
}

function buildAmountFilter(p: { amountGt: number | null; amountGte: number | null; amountLt: number | null; amountLte: number | null }) {
  const f: Record<string, number> = {};
  if (p.amountGt  !== null) f['gt']  = p.amountGt;
  if (p.amountGte !== null) f['gte'] = p.amountGte;
  if (p.amountLt  !== null) f['lt']  = p.amountLt;
  if (p.amountLte !== null) f['lte'] = p.amountLte;
  return Object.keys(f).length > 0 ? f : null;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, limit: number, isAdmin: boolean) {
    const parsed     = parseSearchQuery(q);
    const dateFilter = buildDateFilter(parsed.year, parsed.month);
    const amountF    = buildAmountFilter(parsed);
    const text       = parsed.text;
    const hasText    = text.length > 0;

    if (!hasText && !parsed.hasFilters) {
      return { parsed: { description: '', filters: parsed }, navigation: null, results: { invoices: [], proformas: [], clients: [], products: [], users: [] }, total: 0 };
    }

    const [invoices, proformas, clients, products, users] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          ...(parsed.invoiceStatuses.length > 0 && { status: { in: parsed.invoiceStatuses as any[] } }),
          ...(amountF    && { totalTtc: amountF }),
          ...(dateFilter && { issueDate: dateFilter }),
          ...(hasText || parsed.documentNumber ? { OR: [
            ...(hasText ? [
              { number:  { contains: text, mode: MODE } },
              { subject: { contains: text, mode: MODE } },
              { client:  { name:  { contains: text, mode: MODE } } },
              { client:  { email: { contains: text, mode: MODE } } },
              { client:  { taxNumber: { contains: text, mode: MODE } } },
            ] : []),
            ...(parsed.documentNumber ? [{ number: { contains: parsed.documentNumber, mode: MODE } }] : []),
          ]} : {}),
        },
        select: { id: true, number: true, status: true, type: true, totalTtc: true, issueDate: true, dueDate: true, client: { select: { id: true, name: true } } },
        orderBy: { issueDate: 'desc' }, take: limit,
      }),

      this.prisma.proforma.findMany({
        where: {
          deletedAt: null,
          ...(parsed.proformaStatuses.length > 0 && { status: { in: parsed.proformaStatuses as any[] } }),
          ...(amountF    && { totalTtc: amountF }),
          ...(dateFilter && { createdAt: dateFilter }),
          ...(hasText || parsed.documentNumber ? { OR: [
            ...(hasText ? [{ number: { contains: text, mode: MODE } }, { subject: { contains: text, mode: MODE } }, { client: { name: { contains: text, mode: MODE } } }, { client: { email: { contains: text, mode: MODE } } }] : []),
            ...(parsed.documentNumber ? [{ number: { contains: parsed.documentNumber, mode: MODE } }] : []),
          ]} : {}),
        },
        select: { id: true, number: true, status: true, totalTtc: true, createdAt: true, validUntil: true, client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: limit,
      }),

      hasText
        ? this.prisma.client.findMany({
            where: { deletedAt: null, OR: [{ name: { contains: text, mode: MODE } }, { email: { contains: text, mode: MODE } }, { taxNumber: { contains: text, mode: MODE } }, { rccm: { contains: text, mode: MODE } }, { phone: { contains: text, mode: MODE } }, { city: { contains: text, mode: MODE } }] },
            select: { id: true, name: true, email: true, phone: true, city: true, type: true, status: true },
            orderBy: { name: 'asc' }, take: limit,
          })
        : Promise.resolve([]),

      hasText
        ? this.prisma.product.findMany({
            where: { deletedAt: null, OR: [{ name: { contains: text, mode: MODE } }, { reference: { contains: text, mode: MODE } }, { description: { contains: text, mode: MODE } }] },
            select: { id: true, name: true, reference: true, unitPriceHt: true, type: true, unit: true },
            orderBy: { name: 'asc' }, take: limit,
          })
        : Promise.resolve([]),

      isAdmin && hasText
        ? this.prisma.user.findMany({
            where: { deletedAt: null, OR: [{ firstName: { contains: text, mode: MODE } }, { lastName: { contains: text, mode: MODE } }, { email: { contains: text, mode: MODE } }] },
            select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true },
            orderBy: { lastName: 'asc' }, take: limit,
          })
        : Promise.resolve([]),
    ]);

    let navigation: { type: string; id: string; number: string } | null = null;
    if (parsed.documentNumber) {
      const exactInvoice  = invoices.find(i => i.number.toUpperCase() === parsed.documentNumber);
      if (exactInvoice) navigation = { type: 'invoice', id: exactInvoice.id, number: exactInvoice.number };
      else {
        const exactProforma = proformas.find(p => p.number.toUpperCase() === parsed.documentNumber);
        if (exactProforma) navigation = { type: 'proforma', id: exactProforma.id, number: exactProforma.number };
      }
    }

    return {
      parsed: { description: describeParsedQuery(parsed), text: parsed.text || null, documentNumber: parsed.documentNumber, invoiceStatuses: parsed.invoiceStatuses.length > 0 ? parsed.invoiceStatuses : null, proformaStatuses: parsed.proformaStatuses.length > 0 ? parsed.proformaStatuses : null, amountGt: parsed.amountGt, amountGte: parsed.amountGte, amountLt: parsed.amountLt, amountLte: parsed.amountLte, year: parsed.year, month: parsed.month },
      navigation,
      results: { invoices, proformas, clients, products, users },
      total:   invoices.length + proformas.length + clients.length + products.length + users.length,
    };
  }
}
```

### 2.2 SearchController

```typescript
// src/modules/search/search.controller.ts
import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SearchService } from './search.service';
import { AppError } from '../../core/errors/AppError';

const searchSchema = z.object({
  q:     z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

@Controller('search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('search:read')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  async search(@Query() query: Record<string, unknown>, @Request() req: any) {
    const { q, limit } = searchSchema.parse(query);
    const isAdmin = req.user?.roleName === 'admin';
    return this.searchService.search(q, limit, isAdmin);
  }
}
```

### 2.3 SearchModule

```typescript
// src/modules/search/search.module.ts
import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  providers:   [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
```

---

## 3. ReportsModule

### 3.1 ReportsService

```typescript
// src/modules/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { imgToBase64 } from '../../lib/pdf';

export interface DateRangeInput {
  dateFrom?: Date; dateTo?: Date; year?: number; quarter?: number;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private _resolveDateRange(input: DateRangeInput): { dateFrom: Date; dateTo: Date } {
    if (input.dateFrom && input.dateTo) return { dateFrom: input.dateFrom, dateTo: input.dateTo };
    const year = input.year ?? new Date().getFullYear();
    if (input.quarter) {
      const startMonth = (input.quarter - 1) * 3;
      return { dateFrom: new Date(year, startMonth, 1), dateTo: new Date(year, startMonth + 3, 0, 23, 59, 59) };
    }
    return { dateFrom: new Date(year, 0, 1), dateTo: new Date(year, 11, 31, 23, 59, 59) };
  }

  async getRevenue(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ month: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT TO_CHAR(issue_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ht*acompte_percentage/100 ELSE total_ht END)::numeric AS ht,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_tax*acompte_percentage/100 ELSE total_tax END)::numeric AS tax,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ttc*acompte_percentage/100 ELSE total_ttc END)::numeric AS ttc,
        COUNT(*) AS count
      FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
        AND issue_date >= ${dateFrom} AND issue_date <= ${dateTo}
      GROUP BY month ORDER BY month ASC`;
    return rows.map(r => ({ month: r.month, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), count: Number(r.count) }));
  }

  async getRevenueByClient(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ client_id: string; client_name: string; client_email: string | null; ht: number; tax: number; ttc: number; amount_paid: number; balance_due: number; cnt: bigint }>>`
      SELECT c.id AS client_id, c.name AS client_name, c.email AS client_email,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_ht*i.acompte_percentage/100 ELSE i.total_ht END)::numeric AS ht,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_tax*i.acompte_percentage/100 ELSE i.total_tax END)::numeric AS tax,
        SUM(CASE WHEN i.type='acompte' AND i.acompte_percentage>0 THEN i.total_ttc*i.acompte_percentage/100 ELSE i.total_ttc END)::numeric AS ttc,
        SUM(i.amount_paid)::numeric AS amount_paid, SUM(i.balance_due)::numeric AS balance_due, COUNT(*) AS cnt
      FROM invoices i JOIN clients c ON i.client_id=c.id
      WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','cancelled')
        AND i.issue_date >= ${dateFrom} AND i.issue_date <= ${dateTo}
      GROUP BY c.id, c.name, c.email ORDER BY ttc DESC`;
    return rows.map(r => ({ client: { id: r.client_id, name: r.client_name, email: r.client_email }, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), amountPaid: Number(r.amount_paid), balanceDue: Number(r.balance_due), invoiceCount: Number(r.cnt) }));
  }

  async getRevenueByCategory(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ category: string; ht: number; ttc: number; count: bigint }>>`
      SELECT COALESCE(pc.name,'Sans catégorie') AS category, SUM(il.net_ht)::numeric AS ht, SUM(il.total_ttc)::numeric AS ttc, COUNT(DISTINCT i.id) AS count
      FROM invoice_lines il JOIN invoices i ON il.invoice_id=i.id LEFT JOIN products p ON il.product_id=p.id LEFT JOIN product_categories pc ON p.category_id=pc.id
      WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','cancelled') AND i.issue_date >= ${dateFrom} AND i.issue_date <= ${dateTo}
      GROUP BY category ORDER BY ht DESC`;
    return rows.map(r => ({ category: r.category, totalHt: Number(r.ht), totalTtc: Number(r.ttc), invoiceCount: Number(r.count) }));
  }

  async getUnpaid(input?: DateRangeInput) {
    const { dateFrom, dateTo } = input ? this._resolveDateRange(input) : { dateFrom: undefined, dateTo: undefined };
    return this.prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] }, ...(dateFrom && dateTo ? { issueDate: { gte: dateFrom, lte: dateTo } } : {}) },
      select: { id: true, number: true, clientReference: true, issueDate: true, dueDate: true, status: true, totalTtc: true, amountPaid: true, balanceDue: true, client: { select: { name: true, email: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getPayments(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    return this.prisma.payment.findMany({
      where: { deletedAt: null, paymentDate: { gte: dateFrom, lte: dateTo } },
      include: { invoice: { select: { number: true, client: { select: { name: true } } } } },
      orderBy: { paymentDate: 'asc' },
    });
  }

  async getTaxSummary(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ period: string; ht: number; tax: number; ttc: number; count: bigint }>>`
      SELECT TO_CHAR(issue_date,'YYYY "T"Q') AS period,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ht*acompte_percentage/100 ELSE total_ht END)::numeric AS ht,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_tax*acompte_percentage/100 ELSE total_tax END)::numeric AS tax,
        SUM(CASE WHEN type='acompte' AND acompte_percentage>0 THEN total_ttc*acompte_percentage/100 ELSE total_ttc END)::numeric AS ttc,
        COUNT(*) AS count
      FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
        AND issue_date >= ${dateFrom} AND issue_date <= ${dateTo}
      GROUP BY period ORDER BY period ASC`;
    return rows.map(r => ({ period: r.period, totalHt: Number(r.ht), totalTax: Number(r.tax), totalTtc: Number(r.ttc), count: Number(r.count) }));
  }

  async getAgingReport() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
      select: { id: true, number: true, clientReference: true, issueDate: true, dueDate: true, status: true, totalTtc: true, amountPaid: true, balanceDue: true, client: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: { label: 'Courant', amount: 0, count: 0 }, days_1_30: { label: '1-30j', amount: 0, count: 0 }, days_31_60: { label: '31-60j', amount: 0, count: 0 }, days_61_90: { label: '61-90j', amount: 0, count: 0 }, over_90: { label: '> 90j', amount: 0, count: 0 } };

    const rows = invoices.map(inv => {
      const daysLate = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      const amount   = Number(inv.balanceDue);
      let bucket: keyof typeof buckets;
      if      (daysLate <= 0)  bucket = 'current';
      else if (daysLate <= 30) bucket = 'days_1_30';
      else if (daysLate <= 60) bucket = 'days_31_60';
      else if (daysLate <= 90) bucket = 'days_61_90';
      else                     bucket = 'over_90';
      buckets[bucket].amount += amount; buckets[bucket].count += 1;
      return { id: inv.id, number: inv.number, client: inv.client, issueDate: inv.issueDate, dueDate: inv.dueDate, status: inv.status, totalTtc: Number(inv.totalTtc), balanceDue: amount, daysLate: Math.max(0, daysLate), bucket };
    });

    const total = Object.values(buckets).reduce((acc, b) => ({ amount: acc.amount + b.amount, count: acc.count + b.count }), { amount: 0, count: 0 });
    return { rows, buckets, total };
  }

  async getPaymentsByMethod(input: DateRangeInput) {
    const { dateFrom, dateTo } = this._resolveDateRange(input);
    const rows = await this.prisma.$queryRaw<Array<{ method: string; total: number; count: bigint }>>`
      SELECT p.method, SUM(p.amount)::numeric AS total, COUNT(*) AS count
      FROM payments p WHERE p.deleted_at IS NULL AND p.payment_date >= ${dateFrom} AND p.payment_date <= ${dateTo}
      GROUP BY p.method ORDER BY total DESC`;
    const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);
    return rows.map(r => ({ method: r.method, total: Number(r.total), count: Number(r.count), percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 100) : 0 }));
  }

  async getReportAssets() {
    const settings = await this.prisma.companySettings.findFirst({ select: { companyName: true, headerImagePath: true, footerImagePath: true } });
    return { companyName: settings?.companyName ?? 'Bridge Technologies Solutions', headerImageB64: settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined, footerImageB64: settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined };
  }
}
```

### 3.2 ReportsController

> **Pattern clé** : `@Res() res: Response` + `@SkipResponseWrapper()` sur toutes les méthodes.  
> Les fonctions utilitaires `fmt`, `periodLabel`, `emptyRow`, `sendPdfResponse`, `reportHtml` sont importées depuis `./reports.renderer` (copie directe du fichier Express — PAS @Injectable).

```typescript
// src/modules/reports/reports.controller.ts
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ReportsService } from './reports.service';
import { sendCsvResponse } from '../../lib/csv';
import { generatePdf } from '../../lib/pdf';
// ↓ Copier reports.renderer.ts tel quel — import direct (PAS @Injectable)
import { fmt, periodLabel, daysLate, emptyRow, sendPdfResponse, reportHtml } from './reports.renderer';

const MONTHS: Record<string, string> = { '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin','07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre' };
const METHOD_FR: Record<string, string> = { cash:'Espèces', bank_transfer:'Virement', check:'Chèque', mobile_money:'Mobile Money', card:'Carte', virement:'Virement bancaire', especes:'Espèces', cheque:'Chèque', autre:'Autre' };
const STATUS_FR: Record<string, string> = { issued:'Émise', partially_paid:'Part. payée', overdue:'En retard' };

const rangeSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo:   z.coerce.date().optional(),
  year:     z.coerce.number().int().min(2000).max(2100).optional(),
  quarter:  z.coerce.number().int().min(1).max(4).optional(),
  format:   z.enum(['json', 'csv', 'pdf']).default('json'),
});

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('reports:read')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('revenue')
  @SkipResponseWrapper()
  async getRevenue(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenue(range);

    if (format === 'csv') {
      sendCsvResponse(res, 'rapport-ca-mensuel.csv', ['Mois','Total HT','TVA','Total TTC','Nb Factures'], data.map(r => [r.month, r.totalHt, r.totalTax, r.totalTtc, r.count]));
      return;
    }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const [totalHt, totalTax, totalTtc, count] = [data.reduce((s,r)=>s+r.totalHt,0), data.reduce((s,r)=>s+r.totalTax,0), data.reduce((s,r)=>s+r.totalTtc,0), data.reduce((s,r)=>s+r.count,0)];
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA HT</div><div class="kpi-value blue">${fmt(totalHt)}</div></div><div class="kpi accent-purple"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div><div class="kpi accent-blue"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div><div class="kpi"><div class="kpi-label">Factures émises</div><div class="kpi-value">${count}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-mensuel.pdf', await generatePdf(reportHtml({ reportType:'Rapport financier', title:"Chiffre d'affaires mensuel", subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-client')
  @SkipResponseWrapper()
  async getByClient(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenueByClient(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-ca-clients.csv', ['Client','Email','Total HT','TVA','Total TTC','Payé','Solde dû','Nb Factures'], data.map(r => [r.client.name, r.client.email, r.totalHt, r.totalTax, r.totalTtc, r.amountPaid, r.balanceDue, r.invoiceCount])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const [totalHt, totalTtc, totalPaid, totalDue, totalCnt] = [data.reduce((s,r)=>s+r.totalHt,0), data.reduce((s,r)=>s+r.totalTtc,0), data.reduce((s,r)=>s+r.amountPaid,0), data.reduce((s,r)=>s+r.balanceDue,0), data.reduce((s,r)=>s+r.invoiceCount,0)];
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div><div class="kpi accent-green"><div class="kpi-label">Encaissé</div><div class="kpi-value green">${fmt(totalPaid)}</div></div><div class="kpi ${totalDue>0?'accent-red':''}"><div class="kpi-label">Solde dû</div><div class="kpi-value ${totalDue>0?'red':''}">${fmt(totalDue)}</div></div><div class="kpi"><div class="kpi-label">Clients actifs</div><div class="kpi-value">${data.length}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-clients.pdf', await generatePdf(reportHtml({ reportType:'Rapport financier', title:"Chiffre d'affaires par client", subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-category')
  @SkipResponseWrapper()
  async getByCategory(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenueByCategory(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-ca-categories.csv', ['Catégorie','Total HT','Total TTC','Nb Factures'], data.map(r => [r.category, r.totalHt, r.totalTtc, r.invoiceCount])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA HT total</div><div class="kpi-value blue">${fmt(data.reduce((s,r)=>s+r.totalHt,0))}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-categories.pdf', await generatePdf(reportHtml({ reportType:'Rapport financier', title:"CA par catégorie", subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('unpaid')
  @SkipResponseWrapper()
  async getUnpaid(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getUnpaid(range);
    const now  = new Date();
    if (format === 'csv') { sendCsvResponse(res, 'rapport-impayes.csv', ['Numéro','Client','Email','Date émission','Échéance','Retard (j)','Total TTC','Solde dû','Statut'], data.map(r => { const late=new Date(r.dueDate)<now; return [r.number, r.client.name, r.client.email, r.issueDate.toISOString().slice(0,10), r.dueDate.toISOString().slice(0,10), late?daysLate(r.dueDate):0, Number(r.totalTtc), Number(r.balanceDue), r.status]; })); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const totalDue = data.reduce((s,r)=>s+Number(r.balanceDue),0);
      const body = `<div class="section-block"><table><thead><tr><th>Numéro</th><th>Client</th><th>Émission</th><th>Échéance</th><th class="r">Retard</th><th class="r">Total TTC</th><th class="r">Solde dû</th><th>Statut</th></tr></thead><tbody>${data.length===0?emptyRow(8):data.map(r=>{const late=new Date(r.dueDate)<now;const days=late?daysLate(r.dueDate):0;return`<tr><td class="mono blue">${r.number}</td><td>${r.client.name}</td><td>${new Date(r.issueDate).toLocaleDateString('fr-FR')}</td><td>${new Date(r.dueDate).toLocaleDateString('fr-FR')}</td><td class="r">${late?`<span class="late-pill">J+${days}</span>`:'—'}</td><td class="r">${fmt(Number(r.totalTtc))}</td><td class="r red bold">${fmt(Number(r.balanceDue))}</td><td><span class="badge ${r.status==='overdue'?'badge-error':'badge-warning'}">${STATUS_FR[String(r.status)]??r.status}</span></td></tr>`;}).join('')}</tbody><tfoot><tr><td colspan="6">Total impayé</td><td class="r">${fmt(totalDue)}</td><td></td></tr></tfoot></table></div>`;
      sendPdfResponse(res, 'rapport-impayes.pdf', await generatePdf(reportHtml({ reportType:'Rapport de recouvrement', title:'Factures impayées', subtitle:`Situation au ${now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`, body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('payments')
  @SkipResponseWrapper()
  async getPayments(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getPayments(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-encaissements.csv', ['Date','Facture','Client','Méthode','Montant','Référence'], data.map(r => [r.paymentDate.toISOString().slice(0,10), (r as any).invoice.number, (r as any).invoice.client.name, r.method, Number(r.amount), r.reference??''])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const total = data.reduce((s,r)=>s+Number(r.amount),0);
      const body = `<div class="kpis"><div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(total)}</div></div><div class="kpi"><div class="kpi-label">Nb encaissements</div><div class="kpi-value">${data.length}</div></div></div>`;
      sendPdfResponse(res, 'rapport-encaissements.pdf', await generatePdf(reportHtml({ reportType:'Journal comptable', title:'Journal des encaissements', subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-method')
  @SkipResponseWrapper()
  async getByMethod(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getPaymentsByMethod(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-paiements-methodes.csv', ['Méthode','Total encaissé','Nb paiements','Part (%)'], data.map(r => [r.method, r.total, r.count, r.percentage])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis"><div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(data.reduce((s,r)=>s+r.total,0))}</div></div></div>`;
      sendPdfResponse(res, 'rapport-paiements-methodes.pdf', await generatePdf(reportHtml({ reportType:'Rapport de trésorerie', title:'Encaissements par méthode', subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('tax-summary')
  @SkipResponseWrapper()
  async getTaxSummary(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getTaxSummary(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-tva.csv', ['Période','Base HT','TVA collectée','Total TTC','Nb Factures'], data.map(r => [r.period, r.totalHt, r.totalTax, r.totalTtc, r.count])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="info-box"><strong>Taux TVA : 19,25%</strong> — Conformément au CGI du Cameroun et aux règles SYSCOHADA révisé.</div>`;
      sendPdfResponse(res, 'rapport-tva.pdf', await generatePdf(reportHtml({ reportType:'Déclaration fiscale', title:'Récapitulatif TVA', subtitle: periodLabel(range), body, footerNote:'Document établi conformément au CGI du Cameroun. Taux TVA : 19,25%.', ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('aging')
  @SkipResponseWrapper()
  async getAging(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format } = rangeSchema.parse(query);
    const { rows, buckets, total } = await this.reportsService.getAgingReport();
    const now = new Date();
    if (format === 'csv') { sendCsvResponse(res, 'rapport-aging.csv', ['Numéro','Client','Email','Date émission','Échéance','Retard (j)','Total TTC','Solde dû','Statut','Tranche'], rows.map(r => [r.number, r.client.name, (r.client as any).email??'', new Date(r.issueDate).toLocaleDateString('fr-FR'), new Date(r.dueDate).toLocaleDateString('fr-FR'), r.daysLate, r.totalTtc, r.balanceDue, r.status, buckets[r.bucket as keyof typeof buckets].label])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis">${Object.entries(buckets).map(([k,b])=>`<div class="kpi"><div class="kpi-label">${b.label}</div><div class="kpi-value">${fmt(b.amount)}</div></div>`).join('')}</div>`;
      sendPdfResponse(res, 'rapport-aging.pdf', await generatePdf(reportHtml({ reportType:'Rapport de recouvrement', title:'Vieillissement des impayés', subtitle:`Situation au ${now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`, body, ...assets })));
      return;
    }
    res.json({ success: true, data: { rows, buckets, total } });
  }
}
```

### 3.3 ReportsModule

```typescript
// src/modules/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  providers:   [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
```
