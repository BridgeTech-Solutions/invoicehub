# PHASE 6 — Modules Avancés (NestJS Migration)

> **Modules couverts** : Suppliers · SupplierInvoices · PurchaseOrders · Expenses (+ Categories + Budgets) · Stock
>
> **Prérequis** : Phases 1–5 migrées. `ApprovalsModule` existe et exporte `ApprovalsService` (Phase 4).

---

## 0. Fichiers source Express analysés

| Module | Fichiers lus |
|---|---|
| `suppliers` | routes, service, controller, schema |
| `supplier-invoices` | routes, service, controller, schema |
| `purchase-orders` | routes, service, controller, schema |
| `expenses` | routes (3 routers!), service, controller, schema |
| `stock` | routes, service, controller, schema |

---

## 1. Décisions d'architecture (6 décisions critiques)

### Décision 1 : Expenses — 3 Express routers → 3 NestJS controllers dans un seul ExpensesModule

`expenses.routes.ts` exporte 3 routeurs Express distincts :
- `expenseCategoriesRouter` → `/api/expense-categories`
- `expensesRouter` → `/api/expenses`
- `expenseBudgetsRouter` → `/api/expense-budgets`

**Pattern NestJS identique à la Phase 4 (Products/Categories)** : 3 controllers avec préfixes différents,
tous dans un même `ExpensesModule` qui partage un seul `ExpensesService`.

```typescript
// ExpensesModule.controllers = [ExpenseCategoriesController, ExpensesController, ExpenseBudgetsController]
@Controller('expense-categories') class ExpenseCategoriesController {}
@Controller('expenses')           class ExpensesController {}
@Controller('expense-budgets')    class ExpenseBudgetsController {}
```

### Décision 2 : eventBus → EventEmitter2 (même pattern que Phase 4)

Tous les services Phase 6 utilisent `void eventBus.emit('event.name', payload)`.
En NestJS, remplacer par injection de `EventEmitter2` et `this.eventEmitter.emit(...)`.

```typescript
// Dans chaque service
constructor(
  private prisma: PrismaService,
  private eventEmitter: EventEmitter2,
  // ...
) {}

// Utilisation
this.eventEmitter.emit('purchase_order.sent', { purchaseOrderId: id, supplierId });
```

**Important** : `EventEmitterModule.forRoot()` est déjà dans AppModule (Phase 4). Aucune modification AppModule nécessaire.

### Décision 3 : accountingEngine — lib TS pur, PAS de transformation en @Injectable

`lib/accountingEngine.ts` est appelé avec la syntaxe :
```typescript
void prisma.$transaction((tx) => accountingEngine.onSupplierInvoiceValidated(id, tx));
void prisma.$transaction((tx) => accountingEngine.onSupplierPaymentMade(paymentId, tx));
void prisma.$transaction((tx) => accountingEngine.onExpensePaid(id, tx));
```
Les fonctions reçoivent `tx` (le client Prisma transactionnel) en paramètre — elles n'importent pas prisma directement.
En NestJS, la même syntaxe fonctionne avec `this.prisma.$transaction(...)` :

```typescript
void this.prisma.$transaction(tx => accountingEngine.onSupplierInvoiceValidated(id, tx));
```

**Ne pas créer de `AccountingEngineService`**. Importer le fichier lib directement.

### Décision 4 : ApprovalsService — injection cross-module

`SupplierInvoicesService`, `PurchaseOrdersService`, `ExpensesService` appellent `approvalsService.getDocumentPendingRequest(...)` et `approvalsService.requestApproval(...)`.

En NestJS : inject `ApprovalsService` via le constructeur. Importer `ApprovalsModule` dans chaque module concerné.

```typescript
// purchase-orders.module.ts
imports: [ApprovalsModule, StockModule]
// ApprovalsModule doit exporter ApprovalsService
```

### Décision 5 : StockService.createStockMovement() partagé avec PurchaseOrdersService

`purchase-orders.service.ts` appelle directement `stockService.createStockMovement(...)` lors de la réception (receive).
En Express, il accédait à la logique via import direct de fonctions. En NestJS :

- `StockModule` exporte `StockService`
- `PurchaseOrdersModule` importe `StockModule`
- `PurchaseOrdersService` injecte `StockService` dans son constructeur

```typescript
// purchase-orders.module.ts
imports: [ApprovalsModule, StockModule]

// PurchaseOrdersService constructor
constructor(
  private prisma: PrismaService,
  private eventEmitter: EventEmitter2,
  private approvalsService: ApprovalsService,
  private stockService: StockService,
) {}
```

### Décision 6 : Route ordering — PurchaseOrders `POST /compute` AVANT `POST /`

Dans PurchaseOrdersController :
```
POST /purchase-orders/compute  (2 segments, statique)
POST /purchase-orders          (1 segment, bare)
```
Ces deux routes ont des longueurs de segment différentes → pas de conflit technique.
Mais **par convention** : déclarer `@Post('compute')` avant `@Post()` dans la classe.

Supplier-invoices : `GET /:id/pdf` (3 seg) vs `GET /:id` (2 seg) → pas de conflit non plus.
Stock : `POST /movements/adjust` (statique) vs `GET /movements/:id` (param, GET) → HTTP différent, aucun conflit.

---

## 2. Nouvelles permissions RBAC

```typescript
// Ajouter à l'enum Permission (src/core/decorators/permission.decorator.ts)

// Suppliers
SUPPLIERS_READ   = 'suppliers:read',
SUPPLIERS_CREATE = 'suppliers:create',
SUPPLIERS_UPDATE = 'suppliers:update',
SUPPLIERS_DELETE = 'suppliers:delete',

// Purchases (partagées par supplier-invoices et purchase-orders)
PURCHASES_READ     = 'purchases:read',
PURCHASES_CREATE   = 'purchases:create',
PURCHASES_UPDATE   = 'purchases:update',
PURCHASES_DELETE   = 'purchases:delete',
PURCHASES_VALIDATE = 'purchases:validate',
PURCHASES_PAY      = 'purchases:pay',
PURCHASES_APPROVE  = 'purchases:approve',

// Expenses
EXPENSES_READ    = 'expenses:read',
EXPENSES_CREATE  = 'expenses:create',
EXPENSES_UPDATE  = 'expenses:update',
EXPENSES_DELETE  = 'expenses:delete',
EXPENSES_SUBMIT  = 'expenses:submit',
EXPENSES_APPROVE = 'expenses:approve',
EXPENSES_PAY     = 'expenses:pay',
EXPENSES_MANAGE  = 'expenses:manage',

// Stock
STOCK_READ   = 'stock:read',
STOCK_ADJUST = 'stock:adjust',
```

---

## 3. Module Suppliers — Code complet

### 3.1 SuppliersService

```typescript
// src/modules/suppliers/suppliers.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import {
  CreateSupplierInput, UpdateSupplierInput,
  CreateContactInput, UpdateContactInput,
} from './suppliers.schema';

function generateSupplierCode(): string {
  const now = new Date();
  const ym  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq  = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `FOUR-${ym}-${seq}`;
}

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async listSuppliers(params: { page: number; limit: number; search?: string; status?: string; category?: string }) {
    const { page, limit, search, status, category } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)   where['status']   = status;
    if (category) where['category'] = category;
    if (search) {
      where['OR'] = [
        { name:         { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { name: 'asc' },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          _count:   { select: { purchaseOrders: true, invoices: true } },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, total };
  }

  async getSupplierById(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where:   { id, deletedAt: null },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        _count:   { select: { purchaseOrders: true, invoices: true } },
      },
    });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return supplier;
  }

  async createSupplier(data: CreateSupplierInput, createdById: string) {
    let supplierCode = generateSupplierCode();
    for (let i = 0; i < 5; i++) {
      const exists = await this.prisma.supplier.findFirst({ where: { supplierCode } });
      if (!exists) break;
      supplierCode = generateSupplierCode();
    }
    return this.prisma.supplier.create({ data: { ...(data as any), supplierCode, createdById } });
  }

  async updateSupplier(id: string, data: UpdateSupplierInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return this.prisma.supplier.update({ where: { id }, data: data as any });
  }

  async deleteSupplier(id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    const unpaid = await this.prisma.supplierInvoice.count({
      where: { supplierId: id, deletedAt: null, status: { notIn: ['paid', 'cancelled'] as any[] } },
    });
    if (unpaid > 0) throw AppError.conflict(`Impossible : ${unpaid} facture(s) fournisseur non soldée(s)`);
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listContacts(supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return this.prisma.supplierContact.findMany({
      where:   { supplierId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addContact(supplierId: string, data: CreateContactInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.supplierContact.updateMany({ where: { supplierId, isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.supplierContact.create({ data: { ...(data as any), supplierId } });
    });
  }

  async updateContact(supplierId: string, contactId: string, data: UpdateContactInput) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id: contactId, supplierId } });
    if (!contact) throw AppError.notFound('Contact introuvable');
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.supplierContact.updateMany({
          where: { supplierId, isPrimary: true, id: { not: contactId } },
          data:  { isPrimary: false },
        });
      }
      return tx.supplierContact.update({ where: { id: contactId }, data: data as any });
    });
  }

  async deleteContact(supplierId: string, contactId: string) {
    const contact = await this.prisma.supplierContact.findFirst({ where: { id: contactId, supplierId } });
    if (!contact) throw AppError.notFound('Contact introuvable');
    await this.prisma.supplierContact.delete({ where: { id: contactId } });
  }

  async getSupplierPurchaseOrders(supplierId: string, params: { page: number; limit: number }) {
    const where = { supplierId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip: (params.page - 1) * params.limit, take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalTtc: true, issueDate: true, expectedDeliveryDate: true },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total };
  }

  async getSupplierInvoices(supplierId: string, params: { page: number; limit: number }) {
    const where = { supplierId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where, skip: (params.page - 1) * params.limit, take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalTtc: true, invoiceDate: true, dueDate: true, balanceDue: true },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return { data, total };
  }

  async getFinancialSummary(id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fournisseur introuvable');

    const now           = new Date();
    const startOfYear   = new Date(now.getFullYear(), 0, 1);
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPurchases, purchasesThisYear, purchasesThisMonth, pendingPayables, overduePayables,
           totalPayments, openPurchaseOrders, lastInvoices] = await Promise.all([
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] } }, _sum: { totalTtc: true }, _count: true }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] }, invoiceDate: { gte: startOfYear } }, _sum: { totalTtc: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] }, invoiceDate: { gte: startOfMonth } }, _sum: { totalTtc: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { in: ['validated', 'partially_paid'] as any[] } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.supplierInvoice.aggregate({ where: { supplierId: id, deletedAt: null, status: { in: ['validated', 'partially_paid'] as any[] }, dueDate: { lt: now } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.supplierPayment.aggregate({ where: { supplierId: id }, _sum: { amount: true }, _count: true }),
      this.prisma.purchaseOrder.count({ where: { supplierId: id, deletedAt: null, status: { in: ['draft', 'sent', 'confirmed', 'partially_received'] as any[] } } }),
      this.prisma.supplierInvoice.findMany({ where: { supplierId: id, deletedAt: null }, orderBy: { invoiceDate: 'desc' }, take: 5, select: { id: true, number: true, status: true, totalTtc: true, balanceDue: true, invoiceDate: true, dueDate: true } }),
    ]);

    return {
      supplierId: id, supplierName: supplier.name,
      totalPurchases: { amount: Number(totalPurchases._sum.totalTtc ?? 0), invoiceCount: totalPurchases._count },
      purchasesThisYear:  Number(purchasesThisYear._sum.totalTtc ?? 0),
      purchasesThisMonth: Number(purchasesThisMonth._sum.totalTtc ?? 0),
      pendingPayables:  { amount: Number(pendingPayables._sum.balanceDue ?? 0),  count: pendingPayables._count },
      overduePayables:  { amount: Number(overduePayables._sum.balanceDue ?? 0),  count: overduePayables._count },
      totalPayments:    { amount: Number(totalPayments._sum.amount ?? 0),         count: totalPayments._count },
      openPurchaseOrders, lastInvoices,
    };
  }
}
```

### 3.2 SuppliersController

```typescript
// src/modules/suppliers/suppliers.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createSupplierSchema, updateSupplierSchema,
  createContactSchema, updateContactSchema,
} from './suppliers.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  @Permission('suppliers:read')
  @SkipResponseWrapper()
  async list(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.listSuppliers({ page: p, limit: l, search, status, category });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post()
  @Permission('suppliers:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createSupplier(body, user.id);
  }

  // Sous-routes spécifiques AVANT /:id
  @Get(':id/contacts')
  @Permission('suppliers:read')
  async listContacts(@Param('id') id: string) {
    return this.svc.listContacts(id);
  }

  @Post(':id/contacts')
  @Permission('suppliers:update')
  @HttpCode(HttpStatus.CREATED)
  async addContact(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: any,
  ) {
    return this.svc.addContact(id, body);
  }

  @Put(':id/contacts/:contactId')
  @Permission('suppliers:update')
  async updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: any,
  ) {
    return this.svc.updateContact(id, contactId, body);
  }

  @Delete(':id/contacts/:contactId')
  @Permission('suppliers:update')
  async deleteContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    await this.svc.deleteContact(id, contactId);
    return { message: 'Contact supprimé' };
  }

  @Get(':id/purchase-orders')
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async getPurchaseOrders(
    @Param('id') id: string,
    @Query('page') page = '1', @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.getSupplierPurchaseOrders(id, { page: p, limit: l });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Get(':id/invoices')
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async getInvoices(
    @Param('id') id: string,
    @Query('page') page = '1', @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.getSupplierInvoices(id, { page: p, limit: l });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Get(':id/financial-summary')
  @Permission('suppliers:read')
  async getFinancialSummary(@Param('id') id: string) {
    return this.svc.getFinancialSummary(id);
  }

  @Get(':id')
  @Permission('suppliers:read')
  async findById(@Param('id') id: string) {
    return this.svc.getSupplierById(id);
  }

  @Put(':id')
  @Permission('suppliers:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: any,
  ) {
    return this.svc.updateSupplier(id, body);
  }

  @Delete(':id')
  @Permission('suppliers:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteSupplier(id);
    return { message: 'Fournisseur supprimé' };
  }
}
```

### 3.3 SuppliersModule

```typescript
// src/modules/suppliers/suppliers.module.ts
import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  controllers: [SuppliersController],
  providers:   [SuppliersService],
  exports:     [SuppliersService],
})
export class SuppliersModule {}
```

---

## 4. Module SupplierInvoices — Code complet

### 4.1 SupplierInvoicesService

```typescript
// src/modules/supplier-invoices/supplier-invoices.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../core/errors/app-error';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import * as accountingEngine from '../../lib/accountingEngine';
import {
  CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput, PaySupplierInvoiceInput,
} from './supplier-invoices.schema';

const PAY_METHOD_MAP: Record<string, string> = {
  bank_transfer: 'virement', cash: 'especes', check: 'cheque',
  mobile_money: 'mobile_money', other: 'autre',
};

interface LineInput {
  purchaseOrderLineId?: string | null;
  productId?: string | null;
  designation: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  unit?: string | null;
}

function computeLines(lines: LineInput[]) {
  let subtotalHt = 0, totalTax = 0;
  const computed = lines.map((l) => {
    const gross          = l.quantity * l.unitPrice;
    const discountAmount = gross * (l.discountPercent / 100);
    const netHt          = gross - discountAmount;
    const tax            = netHt * (l.taxRate / 100);
    subtotalHt += netHt;
    totalTax   += tax;
    return {
      designation: l.designation, description: l.description ?? undefined,
      purchaseOrderLineId: l.purchaseOrderLineId ?? undefined,
      productId:   l.productId ?? undefined, unit: l.unit as any ?? undefined,
      quantity: l.quantity, unitPriceHt: l.unitPrice,
      discountValue: l.discountPercent, discountAmount,
      taxRate: l.taxRate, subtotalHt: gross, netHt, taxAmount: tax, totalTtc: netHt + tax,
    };
  });
  return { lines: computed, subtotalHt, totalTax, totalTtc: subtotalHt + totalTax };
}

@Injectable()
export class SupplierInvoicesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    supplierInvoiceId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.supplierInvoiceStatusHistory.create({
      data: { supplierInvoiceId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  async list(params: {
    page: number; limit: number;
    status?: string; supplierId?: string; dateFrom?: string; dateTo?: string; search?: string;
  }) {
    const { page, limit, status, supplierId, dateFrom, dateTo, search } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)    where['status']     = status;
    if (supplierId) where['supplierId'] = supplierId;
    if (search) where['OR'] = [
      { number:               { contains: search, mode: 'insensitive' } },
      { supplierInvoiceNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name:     { contains: search, mode: 'insensitive' } } },
    ];
    if (dateFrom || dateTo) {
      where['invoiceDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: { supplier: { select: { id: true, name: true, supplierCode: true } } },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        lines:         { orderBy: { sortOrder: 'asc' } },
        payments:      { orderBy: { paymentDate: 'asc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    return inv;
  }

  async create(data: CreateSupplierInvoiceInput, userId: string) {
    const { lines, supplierId, purchaseOrderId, officeId, ...rest } = data;
    const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);

    const officeIdResolved = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    const [result] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('supplier_invoice', ${officeIdResolved}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.supplierInvoice.create({
        data: {
          ...(rest as any), supplierId,
          purchaseOrderId: purchaseOrderId ?? undefined,
          officeId:        officeIdResolved,
          number:          result.fn_next_document_number,
          supplierInvoiceNumber: (rest as any).supplierInvoiceRef ?? '',
          status: 'received' as any,
          subtotalHt, totalHt: subtotalHt, totalTax, totalTtc,
          amountPaid: 0, balanceDue: totalTtc,
          createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, inv.id, 'received', userId);
      return inv;
    });
  }

  async update(id: string, data: UpdateSupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'draft'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être modifiées');
    }

    const { lines, supplierInvoiceRef, dueDate, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.supplierInvoiceLine.deleteMany({ where: { supplierInvoiceId: id } });
        const { lines: computed, subtotalHt, totalTax, totalTtc } = computeLines(lines as any);
        await tx.supplierInvoiceLine.createMany({
          data: computed.map((l, i) => ({ ...l, supplierInvoiceId: id, sortOrder: i + 1 })),
        });
        return tx.supplierInvoice.update({
          where: { id },
          data: {
            ...(rest as any),
            ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
            ...(dueDate != null ? { dueDate } : {}),
            subtotalHt, totalHt: subtotalHt, totalTax, totalTtc,
            balanceDue: totalTtc - Number(inv.amountPaid),
          },
          include: { lines: true },
        });
      }
      return tx.supplierInvoice.update({
        where: { id },
        data: {
          ...(rest as any),
          ...(supplierInvoiceRef !== undefined ? { supplierInvoiceNumber: supplierInvoiceRef ?? undefined } : {}),
          ...(dueDate != null ? { dueDate } : {}),
        },
      });
    });
  }

  async remove(id: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['draft', 'received'].includes(String(inv.status))) {
      throw AppError.badRequest('Seules les factures reçues/brouillon peuvent être supprimées');
    }
    await this.prisma.supplierInvoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async validate(id: string, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (inv.status !== 'received') throw AppError.badRequest('Seules les factures reçues peuvent être validées');

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('supplier_invoice', id);
    if (pendingRequest) {
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'supplier_invoice', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'supplier_invoice',
        documentId:     id,
        documentNumber: String(inv.number ?? `FSR-${id.slice(0, 8)}`),
        document:       inv as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.supplierInvoice.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest('Facture soumise pour approbation. Elle sera validée après approbation.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'validated' as any } });
      await this.recordHistory(tx, id, 'validated', userId);
      return u;
    });
    void this.prisma.$transaction(tx => accountingEngine.onSupplierInvoiceValidated(id, tx));
    this.eventEmitter.emit('supplier_invoice.validated', { supplierInvoiceId: id, supplierId: inv.supplierId });
    return updated;
  }

  async dispute(id: string, userId: string, reason: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['received', 'validated'].includes(String(inv.status))) {
      throw AppError.badRequest('Statut invalide pour contestation');
    }
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({ where: { id }, data: { status: 'disputed' as any } });
      await this.recordHistory(tx, id, 'disputed', userId, reason);
      return u;
    });
  }

  async pay(id: string, data: PaySupplierInvoiceInput, userId: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({ where: { id, deletedAt: null } });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
    if (!['validated', 'partially_paid'].includes(String(inv.status))) {
      throw AppError.badRequest('La facture doit être validée avant paiement');
    }

    const newAmountPaid = Number(inv.amountPaid) + data.amount;
    const newBalanceDue = Number(inv.totalTtc) - newAmountPaid;
    const newStatus     = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

    const { updated, paymentId } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          supplierInvoiceId: id, supplierId: inv.supplierId,
          amount: data.amount, paymentDate: data.paymentDate,
          method:       (PAY_METHOD_MAP[data.method] ?? 'virement') as any,
          reference:    data.reference    ?? undefined,
          bankAccountId: data.bankAccountId ?? undefined,
          notes:        data.notes         ?? undefined,
          createdById:  userId,
        },
      });
      const u = await tx.supplierInvoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid, balanceDue: Math.max(0, newBalanceDue), status: newStatus as any },
      });
      await this.recordHistory(tx, id, newStatus, userId);
      return { updated: u, paymentId: payment.id };
    });

    void this.prisma.$transaction(tx => accountingEngine.onSupplierPaymentMade(paymentId, tx));
    this.eventEmitter.emit('supplier_invoice.paid', { supplierInvoiceId: id, amount: data.amount });
    return updated;
  }

  async listPayments(invoiceId: string) {
    return this.prisma.supplierPayment.findMany({
      where:   { supplierInvoiceId: invoiceId },
      orderBy: { paymentDate: 'asc' },
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where:   { id, deletedAt: null },
      include: { supplier: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!inv) throw AppError.notFound('Facture fournisseur introuvable');

    const settings       = await this.prisma.companySettings.findFirst();
    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;

    const lines: DocumentLine[] = inv.lines.map(l => ({
      designation: l.designation, description: l.description ?? undefined,
      quantity:    Number(l.quantity), unit: String(l.unit ?? 'pcs'),
      unitPriceHt: Number(l.unitPriceHt), netHt: Number(l.netHt),
      taxRate:     Number(l.taxRate),
      discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
    }));

    const html = buildDocumentHtml({
      type: 'Facture', number: inv.number,
      issueDate: new Date(inv.invoiceDate).toLocaleDateString('fr-FR'),
      dueDate:   new Date(inv.dueDate).toLocaleDateString('fr-FR'),
      clientName: inv.supplier.name, clientStreet: inv.supplier.address ?? undefined,
      clientBP: inv.supplier.city ?? undefined, clientPhone: inv.supplier.phone ?? undefined,
      clientEmail: inv.supplier.email ?? undefined, clientTaxNumber: inv.supplier.taxNumber ?? undefined,
      subject: `Facture Fournisseur — Réf. ${inv.supplierInvoiceNumber}`,
      lines, subtotalHt: Number(inv.totalHt), totalTax: Number(inv.totalTax), totalTtc: Number(inv.totalTtc),
      currency: (inv as any).currency ?? 'XAF', notes: inv.notes ?? undefined,
      headerImageB64, footerImageB64,
    });

    const buffer = await generatePdf(html);
    return { buffer, filename: `${inv.number.replace(/\//g, '-')}.pdf` };
  }
}
```

### 4.2 SupplierInvoicesController

```typescript
// src/modules/supplier-invoices/supplier-invoices.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Res, HttpCode, HttpStatus, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createSupplierInvoiceSchema, updateSupplierInvoiceSchema,
  paySupplierInvoiceSchema, disputeSchema,
} from './supplier-invoices.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';

@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly svc: SupplierInvoicesService) {}

  @Get()
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async list(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.list({ page: p, limit: l, search, status, supplierId, dateFrom, dateTo });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post()
  @Permission('purchases:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.id);
  }

  // Sous-routes AVANT /:id
  @Get(':id/pdf')
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async getPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Post(':id/validate')
  @Permission('purchases:validate')
  async validate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.validate(id, user.id);
  }

  @Post(':id/dispute')
  @Permission('purchases:validate')
  async dispute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disputeSchema)) body: { reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.dispute(id, user.id, body.reason);
  }

  @Post(':id/pay')
  @Permission('purchases:pay')
  async pay(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paySupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.pay(id, body, user.id);
  }

  @Get(':id/payments')
  @Permission('purchases:read')
  async listPayments(@Param('id') id: string) {
    return this.svc.listPayments(id);
  }

  @Get(':id')
  @Permission('purchases:read')
  async findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('purchases:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.id);
  }

  @Delete(':id')
  @Permission('purchases:delete')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { message: 'Facture fournisseur supprimée' };
  }
}
```

### 4.3 SupplierInvoicesModule

```typescript
// src/modules/supplier-invoices/supplier-invoices.module.ts
import { Module } from '@nestjs/common';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports:     [ApprovalsModule],
  controllers: [SupplierInvoicesController],
  providers:   [SupplierInvoicesService],
  exports:     [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
```

---

## 5. Module PurchaseOrders — Code complet

### 5.1 PurchaseOrdersService

```typescript
// src/modules/purchase-orders/purchase-orders.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { StockService } from '../stock/stock.service';
import { AppError } from '../../core/errors/app-error';
import { generatePdf, buildDocumentHtml, imgToBase64 } from '../../lib/pdf';
import type { DocumentLine } from '../../lib/pdf';
import { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, ReceiveInput } from './purchase-orders.schema';

interface LineInput {
  productId?: string | null;
  designation: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  unit?: string | null;
  notes?: string | null;
}

function computeLines(lines: LineInput[]) {
  let totalSubtotalHt = 0, totalTax = 0;
  const computed = lines.map((l) => {
    const subtotalHt    = l.quantity * l.unitPrice;
    const discountValue = l.discountPercent ?? 0;
    const discountAmount = subtotalHt * (discountValue / 100);
    const netHt         = subtotalHt - discountAmount;
    const taxRate       = l.taxRate ?? 0;
    const taxAmount     = netHt * (taxRate / 100);
    totalSubtotalHt    += netHt;
    totalTax           += taxAmount;
    return {
      designation: l.designation, description: l.description ?? undefined,
      productId:   l.productId ?? undefined, unit: l.unit as any ?? undefined,
      quantityOrdered: l.quantity, unitPriceHt: l.unitPrice,
      discountValue, discountAmount, taxRate, subtotalHt, netHt, taxAmount,
      totalTtc: netHt + taxAmount,
    };
  });
  return { lines: computed, subtotalHt: totalSubtotalHt, totalHt: totalSubtotalHt, totalTax, totalTtc: totalSubtotalHt + totalTax };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
    private stockService: StockService,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    purchaseOrderId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.purchaseOrderStatusHistory.create({
      data: { purchaseOrderId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  private async transition(id: string, from: string | string[], to: string, userId: string, comment?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    const fromArr = Array.isArray(from) ? from : [from];
    if (!fromArr.includes(String(po.status))) {
      throw AppError.badRequest(`Transition invalide : ${po.status} → ${to}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: to as any } });
      await this.recordHistory(tx, id, to, userId, comment);
      return updated;
    });
  }

  async list(params: {
    page: number; limit: number;
    search?: string; status?: string; supplierId?: string; dateFrom?: string; dateTo?: string;
  }) {
    const { page, limit, search, status, supplierId, dateFrom, dateTo } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (supplierId) where['supplierId'] = supplierId;
    if (search) where['OR'] = [
      { number:   { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
    if (dateFrom || dateTo) {
      where['issueDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, supplierCode: true } },
          _count:   { select: { lines: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier:      true,
        lines:         { orderBy: { sortOrder: 'asc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    return po;
  }

  async create(data: CreatePurchaseOrderInput, userId: string) {
    const { lines, supplierId, officeId, ...rest } = data;
    const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);

    const officeIdResolved: string | undefined = officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id ?? undefined;

    const [orderNumber] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('purchase_order', ${officeIdResolved ?? null}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          ...(rest as any), supplierId, officeId: officeIdResolved!,
          number: orderNumber.fn_next_document_number,
          status: 'draft' as any,
          subtotalHt, totalHt, totalTax, totalTtc, createdById: userId,
          lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) },
        },
        include: { lines: true },
      });
      await this.recordHistory(tx, po.id, 'draft', userId);
      return po;
    });
  }

  async update(id: string, data: UpdatePurchaseOrderInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (po.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const { lines, ...rest } = data;
    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        const { lines: computed, subtotalHt, totalHt, totalTax, totalTtc } = computeLines(lines);
        return tx.purchaseOrder.update({
          where: { id },
          data: { ...(rest as any), subtotalHt, totalHt, totalTax, totalTtc, lines: { create: computed.map((l, i) => ({ ...l, sortOrder: i + 1 })) } },
          include: { lines: true },
        });
      }
      return tx.purchaseOrder.update({ where: { id }, data: rest as any });
    });
  }

  async remove(id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (po.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  computeDryRun(lines: LineInput[]) {
    return computeLines(lines);
  }

  async send(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      select: { supplierId: true, number: true, totalTtc: true, status: true },
    });

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('purchase_order', id);
    if (pendingRequest) {
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'purchase_order', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'purchase_order',
        documentId:     id,
        documentNumber: String(po?.number ?? `BC-${id.slice(0, 8)}`),
        document:       (po ?? {}) as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.purchaseOrder.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest('Bon de commande soumis pour approbation. Il sera envoyé après validation.');
      }
    }

    const result = await this.transition(id, 'draft', 'sent', userId);
    if (po) this.eventEmitter.emit('purchase_order.sent', { purchaseOrderId: id, supplierId: po.supplierId });
    return result;
  }

  async confirm(id: string, userId: string) {
    const result = await this.transition(id, 'sent', 'confirmed', userId);
    this.eventEmitter.emit('purchase_order.confirmed', { purchaseOrderId: id });
    return result;
  }

  async cancel(id: string, userId: string, comment?: string) {
    return this.transition(id, ['draft', 'sent', 'confirmed'], 'cancelled', userId, comment);
  }

  async receive(id: string, input: ReceiveInput, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null }, include: { lines: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');
    if (!['confirmed', 'partially_received'].includes(String(po.status))) {
      throw AppError.badRequest('Le bon de commande doit être confirmé pour enregistrer une réception');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const recv of input.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: recv.lineId },
          data:  { quantityReceived: { increment: recv.quantityReceived } },
        });

        const line = po.lines.find(l => l.id === recv.lineId);
        if (line?.productId) {
          const product = await tx.product.findUnique({
            where:  { id: line.productId },
            select: { trackStock: true, stockQuantity: true, stockMinLevel: true },
          });
          if (product?.trackStock) {
            const qtyBefore = Number(product.stockQuantity ?? 0);
            const qtyAfter  = qtyBefore + recv.quantityReceived;
            await tx.stockMovement.create({
              data: {
                productId: line.productId, type: 'purchase_receipt' as any,
                quantity: recv.quantityReceived, unitCostHt: Number(line.unitPriceHt),
                quantityBefore: qtyBefore, quantityAfter: qtyAfter,
                sourceType: 'purchase_order', sourceId: id,
                notes: input.notes ?? undefined, createdById: userId,
              },
            });
            await tx.product.update({
              where: { id: line.productId },
              data:  { stockQuantity: qtyAfter },
            });
            const minLevel = Number(product.stockMinLevel ?? 0);
            if (minLevel > 0 && qtyAfter < minLevel) {
              this.eventEmitter.emit('stock.low', { productId: line.productId, currentQty: qtyAfter, minLevel });
            }
          }
        }
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      const allReceived  = updatedLines.every(l => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const anyReceived  = updatedLines.some(l => Number(l.quantityReceived) > 0);
      const newStatus    = allReceived ? 'received' : anyReceived ? 'partially_received' : String(po.status);

      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: newStatus as any } });
      await this.recordHistory(tx, id, newStatus, userId, input.notes);

      if (newStatus === 'received') {
        this.eventEmitter.emit('purchase_order.received', { purchaseOrderId: id });
      }
      return updated;
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, lines: { orderBy: { sortOrder: 'asc' } }, office: true },
    });
    if (!po) throw AppError.notFound('Bon de commande introuvable');

    const settings       = await this.prisma.companySettings.findFirst();
    const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
    const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
    const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

    const lines: DocumentLine[] = po.lines.map(l => ({
      designation: l.designation, description: l.description ?? undefined,
      quantity:    Number(l.quantityOrdered), unit: String(l.unit ?? 'pcs'),
      unitPriceHt: Number(l.unitPriceHt), netHt: Number(l.netHt),
      taxRate:     Number(l.taxRate),
      discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
    }));

    const html = buildDocumentHtml({
      type: 'Proforma', number: po.number,
      issueDate: new Date(po.issueDate).toLocaleDateString('fr-FR'),
      dueDate:   po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('fr-FR') : undefined,
      clientName: po.supplier.name, clientStreet: po.supplier.address ?? undefined,
      clientBP: po.supplier.city ?? undefined, clientPhone: po.supplier.phone ?? undefined,
      clientEmail: po.supplier.email ?? undefined, clientTaxNumber: po.supplier.taxNumber ?? undefined,
      subject: `Bon de Commande — ${po.supplier.name}`,
      lines, subtotalHt: Number(po.totalHt), totalTax: Number(po.totalTax), totalTtc: Number(po.totalTtc),
      currency: 'XAF', notes: po.notes ?? undefined,
      headerImageB64, footerImageB64, sealImageB64,
    });

    const buffer = await generatePdf(html);
    return { buffer, filename: `${po.number.replace(/\//g, '-')}.pdf` };
  }
}
```

### 5.2 PurchaseOrdersController

```typescript
// src/modules/purchase-orders/purchase-orders.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Res, HttpCode, HttpStatus, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createPurchaseOrderSchema, updatePurchaseOrderSchema,
  receiveLineSchema, computeSchema,
} from './purchase-orders.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Get()
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async list(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.list({ page: p, limit: l, search, status, supplierId, dateFrom, dateTo });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  // POST /compute AVANT POST / (convention : statique avant bare)
  @Post('compute')
  @Permission('purchases:read')
  async compute(@Body(new ZodValidationPipe(computeSchema)) body: { lines: any[] }) {
    return this.svc.computeDryRun(body.lines);
  }

  @Post()
  @Permission('purchases:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.id);
  }

  // Sous-routes spécifiques AVANT /:id
  @Get(':id/pdf')
  @Permission('purchases:read')
  @SkipResponseWrapper()
  async getPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Post(':id/send')
  @Permission('purchases:update')
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.send(id, user.id);
  }

  @Post(':id/confirm')
  @Permission('purchases:approve')
  async confirm(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.confirm(id, user.id);
  }

  @Post(':id/receive')
  @Permission('purchases:update')
  async receive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receiveLineSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.receive(id, body, user.id);
  }

  @Post(':id/cancel')
  @Permission('purchases:approve')
  async cancel(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, user.id, body?.comment);
  }

  @Get(':id')
  @Permission('purchases:read')
  async findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('purchases:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.id);
  }

  @Delete(':id')
  @Permission('purchases:delete')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { message: 'Bon de commande supprimé' };
  }
}
```

### 5.3 PurchaseOrdersModule

```typescript
// src/modules/purchase-orders/purchase-orders.module.ts
import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { ApprovalsModule } from '../approvals/approvals.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports:     [ApprovalsModule, StockModule],
  controllers: [PurchaseOrdersController],
  providers:   [PurchaseOrdersService],
  exports:     [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
```

> **Note** : `StockModule` doit exporter `StockService` (voir section 7.3).

---

## 6. Module Expenses — 3 controllers, 1 service, 1 module

### 6.1 ExpensesService

```typescript
// src/modules/expenses/expenses.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AppError } from '../../core/errors/app-error';
import * as accountingEngine from '../../lib/accountingEngine';
import {
  CreateExpenseCategoryInput, CreateExpenseInput,
  UpdateExpenseInput, CreateBudgetInput,
} from './expenses.schema';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private approvalsService: ApprovalsService,
  ) {}

  private async recordHistory(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    expenseId: string, newStatus: string, userId: string, reason?: string | null,
  ) {
    await tx.expenseStatusHistory.create({
      data: { expenseId, newStatus: newStatus as any, changedById: userId, reason: reason ?? undefined },
    });
  }

  private async transition(
    id: string, from: string | string[], to: string, userId: string,
    extra?: Record<string, unknown>, reason?: string,
  ) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    const fromArr = Array.isArray(from) ? from : [from];
    if (!fromArr.includes(String(expense.status))) {
      throw AppError.badRequest(`Transition invalide : ${expense.status} → ${to}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({ where: { id }, data: { status: to as any, ...extra } });
      await this.recordHistory(tx, id, to, userId, reason);
      return updated;
    });
  }

  // ── Categories ──────────────────────────────────────────────────

  async listCategories() {
    return this.prisma.expenseCategory.findMany({
      where:   { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createCategory(data: CreateExpenseCategoryInput) {
    const exists = await this.prisma.expenseCategory.findFirst({ where: { name: data.name, deletedAt: null } });
    if (exists) throw AppError.conflict('Une catégorie avec ce nom existe déjà');
    return this.prisma.expenseCategory.create({ data });
  }

  async updateCategory(id: string, data: Partial<CreateExpenseCategoryInput>) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.expenseCategory.findFirst({
      where:   { id, deletedAt: null },
      include: { _count: { select: { expenses: true } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    if (cat._count.expenses > 0) throw AppError.conflict('Des dépenses sont liées à cette catégorie');
    await this.prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Expenses ────────────────────────────────────────────────────

  async listExpenses(params: {
    page: number; limit: number; search?: string; status?: string;
    categoryId?: string; officeId?: string; dateFrom?: string; dateTo?: string;
    isEmployeeExpense?: boolean;
  }) {
    const { page, limit, search, status, categoryId, officeId, dateFrom, dateTo, isEmployeeExpense } = params;
    const where: Record<string, unknown> = { deletedAt: null };
    if (status)     where['status']     = status;
    if (categoryId) where['categoryId'] = categoryId;
    if (officeId)   where['officeId']   = officeId;
    if (typeof isEmployeeExpense === 'boolean') where['isEmployeeExpense'] = isEmployeeExpense;
    if (search) where['OR'] = [
      { title:         { contains: search, mode: 'insensitive' } },
      { expenseNumber: { contains: search, mode: 'insensitive' } },
    ];
    if (dateFrom || dateTo) {
      where['expenseDate'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          category:  { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data, total };
  }

  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        category:      true,
        createdBy:     { select: { id: true, firstName: true, lastName: true } },
        approvedBy:    { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    return expense;
  }

  async createExpense(data: CreateExpenseInput, userId: string) {
    const amountTtc = data.amountHt * (1 + (data.taxRate ?? 0) / 100);

    const officeIdResolved = data.officeId ?? (
      await this.prisma.agencyOffice.findFirst({ where: { deletedAt: null }, select: { id: true } })
    )?.id;
    if (!officeIdResolved) throw AppError.badRequest('Aucun bureau disponible');

    const [result] = await this.prisma.$queryRaw<[{ fn_next_document_number: string }]>`
      SELECT fn_next_document_number('expense', ${officeIdResolved}::uuid)
    `;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          ...(data as any), officeId: officeIdResolved,
          number: result.fn_next_document_number,
          amountTtc, status: 'draft' as any, createdById: userId,
        },
      });
      await this.recordHistory(tx, expense.id, 'draft', userId);
      return expense;
    });
  }

  async updateExpense(id: string, data: UpdateExpenseInput, _userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être modifiés');

    const amountTtc = data.amountHt !== undefined
      ? data.amountHt * (1 + ((data.taxRate ?? Number(expense.taxRate)) / 100))
      : undefined;

    const updateData: Record<string, unknown> = { ...data };
    if (amountTtc !== undefined) updateData['amountTtc'] = amountTtc;
    if (data.officeId === null)  updateData['officeId']  = null;

    return this.prisma.expense.update({ where: { id }, data: updateData as any });
  }

  async deleteExpense(id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) throw AppError.notFound('Dépense introuvable');
    if (expense.status !== 'draft') throw AppError.badRequest('Seuls les brouillons peuvent être supprimés');
    await this.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async submitExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({
      where:  { id, deletedAt: null },
      select: { amountTtc: true, amountHt: true, createdById: true, status: true, description: true },
    });

    const pendingRequest = await this.approvalsService.getDocumentPendingRequest('expense', id);
    if (pendingRequest) {
      throw AppError.forbidden(`En attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`);
    }
    const approvedRequest = await this.prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'expense', status: 'approved' },
    });
    if (!approvedRequest) {
      const request = await this.approvalsService.requestApproval({
        documentType:   'expense',
        documentId:     id,
        documentNumber: `DEP-${id.slice(0, 8)}`,
        document:       { id, ...expense, totalTtc: expense?.amountTtc, totalHt: expense?.amountHt } as unknown as Record<string, unknown>,
        requestedById:  userId,
      });
      if (request) {
        await this.prisma.expense.update({ where: { id }, data: { requiresApproval: true } });
        throw AppError.badRequest('Dépense soumise pour approbation. Elle sera traitée après validation.');
      }
    }

    const result = await this.transition(id, 'draft', 'submitted', userId);
    this.eventEmitter.emit('expense.submitted', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), submittedById: userId });
    return result;
  }

  async approveExpense(id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null }, select: { amountTtc: true } });
    const result  = await this.transition(id, 'submitted', 'approved', userId, { approvedById: userId, approvedAt: new Date() });
    this.eventEmitter.emit('expense.approved', { expenseId: id, amount: Number(expense?.amountTtc ?? 0), approvedById: userId });
    return result;
  }

  async rejectExpense(id: string, userId: string, reason: string) {
    return this.transition(id, 'submitted', 'rejected', userId, { rejectionReason: reason }, reason);
  }

  async payExpense(id: string, userId: string) {
    const result = await this.transition(id, 'approved', 'paid', userId, { paidAt: new Date() });
    void this.prisma.$transaction(tx => accountingEngine.onExpensePaid(id, tx));
    this.eventEmitter.emit('expense.paid', { expenseId: id });
    return result;
  }

  async cancelExpense(id: string, userId: string) {
    return this.transition(id, ['draft', 'submitted', 'approved'], 'cancelled', userId);
  }

  // ── Budgets ─────────────────────────────────────────────────────

  async listBudgets(params: { year?: number; categoryId?: string; officeId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.year)       where['year']       = params.year;
    if (params.categoryId) where['categoryId'] = params.categoryId;
    if (params.officeId)   where['officeId']   = params.officeId;

    const budgets = await this.prisma.expenseBudget.findMany({
      where, orderBy: [{ year: 'desc' }, { month: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });

    return Promise.all(budgets.map(async (b) => {
      const dateFilter: Record<string, unknown> = {};
      if (b.month) {
        dateFilter['expenseDate'] = {
          gte: new Date(b.year, b.month - 1, 1),
          lte: new Date(b.year, b.month, 0, 23, 59, 59),
        };
      } else {
        dateFilter['expenseDate'] = {
          gte: new Date(b.year, 0, 1), lte: new Date(b.year, 11, 31, 23, 59, 59),
        };
      }
      const agg = await this.prisma.expense.aggregate({
        where: { categoryId: b.categoryId, status: 'paid' as any, deletedAt: null, ...dateFilter },
        _sum:  { amountTtc: true },
      });
      const realised = Number(agg._sum.amountTtc ?? 0);
      return { ...b, realised, remaining: Number(b.budgetAmount) - realised };
    }));
  }

  async createBudget(data: CreateBudgetInput) {
    const { amountBudget, ...rest } = data;
    return this.prisma.expenseBudget.create({ data: { ...rest, budgetAmount: amountBudget } });
  }

  async updateBudget(id: string, data: Partial<CreateBudgetInput>) {
    const budget = await this.prisma.expenseBudget.findUnique({ where: { id } });
    if (!budget) throw AppError.notFound('Budget introuvable');
    const { amountBudget, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    if (amountBudget !== undefined) updateData['budgetAmount'] = amountBudget;
    return this.prisma.expenseBudget.update({ where: { id }, data: updateData as any });
  }
}
```

### 6.2 Les 3 Controllers Expenses

```typescript
// src/modules/expenses/expense-categories.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../core/decorators/permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createExpenseCategorySchema, updateExpenseCategorySchema } from './expenses.schema';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list() { return this.svc.listCategories(); }

  @Post()
  @Permission('expenses:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(new ZodValidationPipe(createExpenseCategorySchema)) body: any) {
    return this.svc.createCategory(body);
  }

  @Put(':id')
  @Permission('expenses:manage')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateExpenseCategorySchema)) body: any) {
    return this.svc.updateCategory(id, body);
  }

  @Delete(':id')
  @Permission('expenses:manage')
  async remove(@Param('id') id: string) {
    await this.svc.deleteCategory(id);
    return { message: 'Catégorie supprimée' };
  }
}
```

```typescript
// src/modules/expenses/expenses.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createExpenseSchema, updateExpenseSchema, rejectExpenseSchema } from './expenses.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  @SkipResponseWrapper()
  async list(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('categoryId') categoryId?: string, @Query('officeId') officeId?: string,
    @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string,
    @Query('isEmployeeExpense') isEmpStr?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const isEmployeeExpense = isEmpStr === 'true' ? true : isEmpStr === 'false' ? false : undefined;
    const { data, total } = await this.svc.listExpenses({ page: p, limit: l, search, status, categoryId, officeId, dateFrom, dateTo, isEmployeeExpense });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post()
  @Permission('expenses:create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(new ZodValidationPipe(createExpenseSchema)) body: any, @CurrentUser() user: JwtPayload) {
    return this.svc.createExpense(body, user.id);
  }

  // Sous-routes AVANT /:id
  @Post(':id/submit')
  @Permission('expenses:submit')
  async submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.submitExpense(id, user.id);
  }

  @Post(':id/approve')
  @Permission('expenses:approve')
  async approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.approveExpense(id, user.id);
  }

  @Post(':id/reject')
  @Permission('expenses:approve')
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectExpenseSchema)) body: { reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.rejectExpense(id, user.id, body.reason);
  }

  @Post(':id/pay')
  @Permission('expenses:pay')
  async pay(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.payExpense(id, user.id);
  }

  @Post(':id/cancel')
  @Permission('expenses:approve')
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.cancelExpense(id, user.id);
  }

  @Get(':id')
  @Permission('expenses:read')
  async findById(@Param('id') id: string) {
    return this.svc.getExpenseById(id);
  }

  @Put(':id')
  @Permission('expenses:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateExpense(id, body, user.id);
  }

  @Delete(':id')
  @Permission('expenses:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteExpense(id);
    return { message: 'Dépense supprimée' };
  }
}
```

```typescript
// src/modules/expenses/expense-budgets.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../core/decorators/permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createBudgetSchema, updateBudgetSchema } from './expenses.schema';

@Controller('expense-budgets')
export class ExpenseBudgetsController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list(
    @Query('year') yearStr?: string,
    @Query('categoryId') categoryId?: string,
    @Query('officeId') officeId?: string,
  ) {
    const year = yearStr ? parseInt(yearStr) : undefined;
    return this.svc.listBudgets({ year, categoryId, officeId });
  }

  @Post()
  @Permission('expenses:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(new ZodValidationPipe(createBudgetSchema)) body: any) {
    return this.svc.createBudget(body);
  }

  @Put(':id')
  @Permission('expenses:manage')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateBudgetSchema)) body: any) {
    return this.svc.updateBudget(id, body);
  }
}
```

### 6.3 ExpensesModule

```typescript
// src/modules/expenses/expenses.module.ts
import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseBudgetsController } from './expense-budgets.controller';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports:     [ApprovalsModule],
  controllers: [ExpenseCategoriesController, ExpensesController, ExpenseBudgetsController],
  providers:   [ExpensesService],
  exports:     [ExpensesService],
})
export class ExpensesModule {}
```

---

## 7. Module Stock — Code complet

### 7.1 StockService

```typescript
// src/modules/stock/stock.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../core/errors/app-error';
import { AdjustStockInput } from './stock.schema';

export interface StockMovementData {
  productId:   string;
  quantity:    number;
  type:        string;
  unitCostHt?: number | null;
  sourceType?: string | null;
  sourceId?:   string | null;
  notes?:      string | null;
  location?:   string | null;
  createdById: string;
}

@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createStockMovement(data: StockMovementData) {
    const product = await this.prisma.product.findFirst({
      where:  { id: data.productId, deletedAt: null },
      select: { id: true, trackStock: true, stockQuantity: true, stockMinLevel: true },
    });
    if (!product) throw AppError.notFound('Produit introuvable');
    if (!product.trackStock) throw AppError.badRequest('Ce produit ne gère pas le stock');

    const newQty = Number(product.stockQuantity ?? 0) + data.quantity;

    const movement = await this.prisma.$transaction(async (tx) => {
      const m = await tx.stockMovement.create({
        data: {
          productId:      data.productId,
          type:           data.type as any,
          quantity:       data.quantity,
          unitCostHt:     data.unitCostHt,
          quantityBefore: Number(product.stockQuantity ?? 0),
          quantityAfter:  newQty,
          sourceType:     data.sourceType,
          sourceId:       data.sourceId,
          notes:          data.notes,
          location:       data.location,
          createdById:    data.createdById,
        },
      });
      await tx.product.update({
        where: { id: data.productId },
        data:  { stockQuantity: newQty },
      });
      return m;
    });

    const minLevel = Number(product.stockMinLevel ?? 0);
    if (minLevel > 0 && newQty < minLevel) {
      this.eventEmitter.emit('stock.low', { productId: data.productId, currentQty: newQty, minLevel });
    }
    return movement;
  }

  async listMovements(params: {
    page: number; limit: number;
    productId?: string; type?: string; dateFrom?: string; dateTo?: string;
  }) {
    const { page, limit, productId, type, dateFrom, dateTo } = params;
    const where: Record<string, unknown> = {};
    if (productId) where['productId'] = productId;
    if (type)      where['type']      = type;
    if (dateFrom || dateTo) {
      where['createdAt'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          product:   { select: { id: true, name: true, reference: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, total };
  }

  async getMovementById(id: string) {
    const m = await this.prisma.stockMovement.findUnique({
      where:   { id },
      include: {
        product:   true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!m) throw AppError.notFound('Mouvement de stock introuvable');
    return m;
  }

  async getStockLevels(params: { page: number; limit: number; search?: string; lowStock?: boolean }) {
    const { page, limit, search, lowStock } = params;
    const where: Record<string, unknown> = { trackStock: true, deletedAt: null };
    if (search) where['OR'] = [
      { name:      { contains: search, mode: 'insensitive' } },
      { reference: { contains: search, mode: 'insensitive' } },
    ];

    const products = await this.prisma.product.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' },
      select: {
        id: true, name: true, reference: true,
        stockQuantity: true, stockMinLevel: true, stockMaxLevel: true,
      },
    });

    return lowStock
      ? products.filter(p => Number(p.stockQuantity ?? 0) < Number(p.stockMinLevel ?? 0))
      : products;
  }

  async getProductStockHistory(productId: string, params: { page: number; limit: number }) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw AppError.notFound('Produit introuvable');

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { productId },
        skip: (params.page - 1) * params.limit, take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where: { productId } }),
    ]);
    return { data, total };
  }

  async getStockAlerts() {
    const products = await this.prisma.product.findMany({
      where:   { trackStock: true, deletedAt: null, stockMinLevel: { not: null } },
      select:  { id: true, name: true, reference: true, stockQuantity: true, stockMinLevel: true },
      orderBy: { name: 'asc' },
    });
    return products.filter(p => Number(p.stockQuantity ?? 0) < Number(p.stockMinLevel ?? 0));
  }

  async adjustStock(data: AdjustStockInput, userId: string) {
    return this.createStockMovement({
      productId:  data.productId,
      quantity:   data.type === 'adjustment_out' ? -Math.abs(data.quantity) : Math.abs(data.quantity),
      type:       data.type,
      unitCostHt: data.unitCostHt,
      notes:      data.notes,
      location:   data.location,
      createdById: userId,
    });
  }
}
```

### 7.2 StockController

```typescript
// src/modules/stock/stock.controller.ts
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { StockService } from './stock.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { adjustStockSchema } from './stock.schema';
import type { JwtPayload } from '../../core/interfaces/jwt-payload.interface';

@Controller('stock')
export class StockController {
  constructor(private readonly svc: StockService) {}

  // ── Mouvements ────────────────────────────────────────────────────────────────

  @Get('movements')
  @Permission('stock:read')
  @SkipResponseWrapper()
  async listMovements(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('productId') productId?: string, @Query('type') type?: string,
    @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.listMovements({ page: p, limit: l, productId, type, dateFrom, dateTo });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  // POST /movements/adjust AVANT GET /movements/:id
  // (même préfixe "movements/", segments identiques — statique d'abord)
  // Note : méthodes HTTP différentes (POST vs GET) — pas de conflit réel.
  // Mais par convention, déclarer le plus spécifique d'abord.
  @Post('movements/adjust')
  @Permission('stock:adjust')
  async adjust(
    @Body(new ZodValidationPipe(adjustStockSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.adjustStock(body, user.id);
  }

  @Get('movements/:id')
  @Permission('stock:read')
  async getMovement(@Param('id') id: string) {
    return this.svc.getMovementById(id);
  }

  // ── Niveaux de stock ──────────────────────────────────────────────────────────

  @Get('levels')
  @Permission('stock:read')
  @SkipResponseWrapper()
  async getStockLevels(
    @Query('page') page = '1', @Query('limit') limit = '20',
    @Query('search') search?: string, @Query('lowStock') lowStockStr?: string,
  ) {
    const p        = Math.max(1, parseInt(page));
    const l        = Math.min(100, Math.max(1, parseInt(limit)));
    const lowStock = lowStockStr === 'true';
    const data     = await this.svc.getStockLevels({ page: p, limit: l, search, lowStock });
    return { success: true, data };
  }

  @Get('levels/:productId')
  @Permission('stock:read')
  @SkipResponseWrapper()
  async getProductHistory(
    @Param('productId') productId: string,
    @Query('page') page = '1', @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.svc.getProductStockHistory(productId, { page: p, limit: l });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Get('alerts')
  @Permission('stock:read')
  async getAlerts() {
    return this.svc.getStockAlerts();
  }
}
```

### 7.3 StockModule

```typescript
// src/modules/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

@Module({
  controllers: [StockController],
  providers:   [StockService],
  exports:     [StockService],  // ← requis pour PurchaseOrdersModule
})
export class StockModule {}
```

---

## 8. Mise à jour AppModule

```typescript
// src/app.module.ts — ajouter dans imports[]
import { SuppliersModule }        from './modules/suppliers/suppliers.module';
import { SupplierInvoicesModule } from './modules/supplier-invoices/supplier-invoices.module';
import { PurchaseOrdersModule }   from './modules/purchase-orders/purchase-orders.module';
import { ExpensesModule }         from './modules/expenses/expenses.module';
import { StockModule }            from './modules/stock/stock.module';

@Module({
  imports: [
    // ... modules existants phases 1-5 ...
    SuppliersModule,
    StockModule,            // ← StockModule AVANT PurchaseOrdersModule (dépendance)
    SupplierInvoicesModule,
    PurchaseOrdersModule,   // importe StockModule + ApprovalsModule
    ExpensesModule,
  ],
})
export class AppModule {}
```

> **Ordre** : `StockModule` avant `PurchaseOrdersModule` car ce dernier l'importe.
> NestJS résout les dépendances par DI, donc l'ordre n'est pas strict, mais c'est une bonne pratique de lisibilité.

---

## 9. Graphe de dépendances des modules Phase 6

```
ApprovalsModule (Phase 4, exports ApprovalsService)
    ↑ importé par
    ├── SupplierInvoicesModule
    ├── PurchaseOrdersModule
    └── ExpensesModule

StockModule (exports StockService)
    ↑ importé par
    └── PurchaseOrdersModule

SuppliersModule — standalone (aucune dépendance cross-module)
```

---

## 10. Table récapitulative des pièges

| Piège | Cause | Solution |
|---|---|---|
| `ExpensesService` non trouvé dans `ExpenseCategoriesController` | Les 3 controllers partagent le MÊME service | Un seul `ExpensesService` en `providers[]`, les 3 controllers le reçoivent par injection |
| `StockService` non résolu dans `PurchaseOrdersService` | `StockModule` non importé | Ajouter `StockModule` dans `PurchaseOrdersModule.imports[]` ET `StockModule` doit `exports: [StockService]` |
| `accountingEngine.onX is not a function` | Import du mauvais chemin | `import * as accountingEngine from '../../lib/accountingEngine'` — chemin relatif depuis `src/modules/*/` |
| `EventEmitter2` non injecté | `EventEmitterModule.forRoot()` absent de AppModule | Déjà ajouté en Phase 4 — vérifier que l'import est bien en place |
| `ApprovalsService` non résolu | `ApprovalsModule` n'exporte pas `ApprovalsService` | Vérifier `ApprovalsModule.exports = [ApprovalsService]` (Phase 4) |
| PDF route `GET :id/pdf` interceptée par `GET :id` | Déclaration dans le mauvais ordre | NestJS : segments différents (3 vs 2) → pas de conflit. Mais déclarer `/pdf`, `/validate`, etc. avant `/:id` par convention |
| `void this.prisma.$transaction(tx => accountingEngine.onX(id, tx))` — TypeScript error | `tx` non typé | Utiliser `(tx: any) => accountingEngine.onX(id, tx)` ou vérifier le type retourné par accountingEngine |
| `ExpenseBudgetsController` absent des routes | Oublié dans `ExpensesModule.controllers[]` | Ajouter les 3 controllers : `[ExpenseCategoriesController, ExpensesController, ExpenseBudgetsController]` |
| `POST /stock/movements/adjust` → 404 | Route déclarée après `GET /stock/movements/:id` (même préfixe, HTTP différent — pas de pb réel) | Pas de conflit en pratique. Si 404, vérifier que `StockController` est bien dans `StockModule.controllers[]` |
