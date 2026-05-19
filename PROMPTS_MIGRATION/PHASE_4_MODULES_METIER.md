# PHASE 4 — MODULES MÉTIER CORE (7 modules)

## Contexte

Tu migres une API Express/TypeScript vers NestJS. Phases 1-3 sont complètes.
Cette phase migre les 7 modules business principaux :
`clients`, `products` (inclut categories), `proformas`, `invoices`, `payments`,
`recurring`, `approvals`.

**C'est la phase la plus complexe** — avant de toucher au code, lis l'intégralité
de cette section Architecture. Chaque décision mal prise ici génère des bugs de DI
difficiles à débugguer.

Répertoire NestJS cible : `bridge-nestjs/src/`

---

## ARCHITECTURE — Décisions avant de coder

### Graphe de dépendances inter-modules

```
ApprovalsModule ← InvoicesModule ← PaymentsModule
                       ↑
                  ProformasModule
                       ↑
              ClientsModule  ProductsModule  RecurringModule
```

Dans NestJS, DI circulaire = erreur au démarrage. L'ordre d'import dans les modules
doit respecter ce graphe (les feuilles d'abord).

### Décision 1 — DashboardService (Phase 7, pas encore migré)

`InvoicesService` et `PaymentsService` appellent `DashboardService.invalidateCache()`
(méthode statique Express) pour expirer le cache Redis du dashboard après chaque
paiement ou changement de statut.

**Solution** : créer un `DashboardCacheService` minimal dès maintenant.

```
src/core/services/dashboard-cache.service.ts
```

```typescript
import { Injectable }    from '@nestjs/common';
import { InjectRedis }   from '@nestjs-modules/ioredis';
import Redis             from 'ioredis';

@Injectable()
export class DashboardCacheService {
  private static readonly KEY_PATTERN = 'dashboard:*';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async invalidate(): Promise<void> {
    const keys = await this.redis.keys(DashboardCacheService.KEY_PATTERN);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

```
src/core/services/core-services.module.ts
```

```typescript
import { Module }                from '@nestjs/common';
import { RedisModule }           from '../redis/redis.module';
import { DashboardCacheService } from './dashboard-cache.service';

@Module({
  imports:  [RedisModule],
  providers: [DashboardCacheService],
  exports:   [DashboardCacheService],
})
export class CoreServicesModule {}
```

Importer `CoreServicesModule` dans tous les modules qui utilisent l'invalidation.
En Phase 7, `DashboardService` injectera aussi `DashboardCacheService` à la place
de sa méthode statique actuelle.

### Décision 2 — broadcastNotification → EventsGateway

En Express, `broadcastNotification()` est une fonction libre qui émet via Socket.io.
En NestJS, injecter `EventsGateway` et utiliser `.server.emit()`.

```typescript
// lib/broadcast.ts Express
import { io } from '../server';
export async function broadcastNotification({ type, title, message, data }) {
  io.emit('notification', { type, title, message, data });
}
```

```typescript
// NestJS : dans chaque service qui broadcast
constructor(private readonly events: EventsGateway) {}

// Dans la méthode :
this.events.server.emit('notification', { type, title, message, data });
```

`EventsGateway` doit être exporté depuis `EventsModule` et importé dans chaque module
qui l'utilise.

```typescript
// src/core/events/events.module.ts — ajouter exports:
@Module({
  providers: [EventsGateway],
  exports:   [EventsGateway],   // ← AJOUTER
})
export class EventsModule {}
```

### Décision 3 — eventBus → EventEmitter2

En Express, `eventBus.emit('invoice.paid', ...)` déclenche des listeners asynchrones
(ex: mise à jour comptable). En NestJS, utiliser `@nestjs/event-emitter`.

Ajouter dans `AppModule` :

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
// Dans imports[] :
EventEmitterModule.forRoot(),
```

Dans les services qui émettent :
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
constructor(private readonly emitter: EventEmitter2) {}
// Remplacer : eventBus.emit('invoice.paid', data)
// Par :       this.emitter.emit('invoice.paid', data)
```

### Décision 4 — PDF → StreamableFile

En Express, les routes PDF font `res.setHeader(...); res.send(buffer)`.
En NestJS, utiliser `StreamableFile` avec `@Res({ passthrough: true })`.

```typescript
import { StreamableFile } from '@nestjs/common';
import { Response }       from 'express';

@Get(':id/pdf')
@SkipResponseWrapper()
async getPdf(
  @Param('id') id: string,
  @Res({ passthrough: true }) res: Response,
) {
  const { buffer, filename } = await this.svc.generatePdf(id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return new StreamableFile(buffer);
}
```

> `@SkipResponseWrapper()` est obligatoire ici : le ResponseInterceptor ne doit
> pas envelopper un StreamableFile dans `{ success: true, data: ... }`.

### Décision 5 — Rate limiting PDF → @nestjs/throttler

En Express, `rateLimitByUser({ max: 10, windowMs: 60_000 })` sur les routes PDF.
En NestJS, utiliser ThrottlerModule.

Ajouter dans `AppModule` :

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Dans imports[] :
ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),

// Dans providers[] (garde global optionnel, ou par route) :
// Ne pas l'ajouter globalement — appliquer uniquement sur les routes PDF.
```

Sur chaque route PDF protégée par rate limit :
```typescript
import { UseGuards }  from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Get(':id/pdf')
@UseGuards(ThrottlerGuard)   // rate limiting par IP (10 req/min)
@Permission('invoices:read')
@SkipResponseWrapper()
async getPdf(...) { ... }
```

Installer : `pnpm add @nestjs/throttler`

### Décision 6 — Multi-permissions (Approvals)

En Express : `authorizePermission('approvals:view', 'approvals:view_own')` —
l'utilisateur qui a l'UNE OU L'AUTRE peut accéder.

Le `@Permission('x')` de Phase 1 gère une seule permission.
Créer `@Permissions('x', 'y')` pour la logique OR.

```typescript
// src/core/decorators/permissions.decorator.ts (plural)
import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
```

Mettre à jour `RbacGuard` pour lire les deux clés :

```typescript
// src/core/guards/rbac.guard.ts
const singlePerm = this.reflector.get<string>('permission', context.getHandler());
const multiPerms = this.reflector.get<string[]>('permissions', context.getHandler());

const required = multiPerms ?? (singlePerm ? [singlePerm] : []);
if (required.length === 0) return true;

// OR logic : l'utilisateur a au moins une des permissions requises
const userPerms: string[] = request.user?.permissions ?? [];
const hasWildcard = userPerms.includes('*');
const hasPermission = required.some(p =>
  hasWildcard || userPerms.includes(p) || userPerms.includes(p.split(':')[0] + ':*')
);
if (!hasPermission) throw new ForbiddenException('Permission insuffisante');
return true;
```

### Décision 7 — POST /invoices/:id/payment dans InvoicesController

En Express, cette route est dans `invoices.routes.ts` et délègue à `paymentsController`.
En NestJS, ajouter la route dans `InvoicesController`, injecter `PaymentsService`.
`InvoicesModule` importera `PaymentsModule` (qui exporte `PaymentsService`).

### Décision 8 — Products : deux controllers, un module

En Express : `categoriesRouter` → `/api/product-categories`, `productsRouter` → `/api/products`.
En NestJS : deux controllers dans `ProductsModule`.

```typescript
@Module({
  controllers: [CategoriesController, ProductsController],
  providers:   [ProductsService],
})
export class ProductsModule {}
```

### Décision 9 — Attachment payments → StreamableFile

```typescript
@Get(':id/attachment')
@Permission('payments:read')
@SkipResponseWrapper()
async getAttachment(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
  const { filePath, filename } = await this.svc.getAttachment(id);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.pdf' ? 'application/pdf'
    : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg'
    : ext === '.png' ? 'image/png' : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return new StreamableFile(fs.createReadStream(filePath));
}
```

---

## Packages à installer avant de commencer

```bash
pnpm add @nestjs/throttler @nestjs/event-emitter
```

---

## MODULES SIMPLES — Code complet

### MODULE 1 — Clients

**Fichiers** : `src/modules/clients/{clients.module,service,controller,schema}.ts`

#### `clients.schema.ts` (identique à Express)

```typescript
import { z } from 'zod';

export const createClientSchema = z.object({
  type:                z.enum(['company', 'individual']).default('company'),
  name:                z.string().min(1).max(255),
  email:               z.string().email().optional(),
  phone:               z.string().max(50).optional(),
  phone2:              z.string().max(50).optional(),
  address:             z.string().optional(),
  city:                z.string().max(100).optional(),
  country:             z.string().max(100).default('Cameroun'),
  postalBox:           z.string().max(50).optional(),
  taxNumber:           z.string().max(100).optional(),
  rccm:                z.string().max(100).optional(),
  bankName:            z.string().max(255).optional(),
  bankAccount:         z.string().max(100).optional(),
  currency:            z.string().length(3).default('XAF'),
  defaultPaymentTerms: z.string().optional(),
  internalNotes:       z.string().optional(),
  metadata:            z.record(z.unknown()).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listClientsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(500).default(20),
  type:   z.enum(['company', 'individual']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  search: z.string().optional(),
  city:   z.string().optional(),
});

export const importClientRowSchema = z.object({
  type:                z.enum(['company', 'individual']).optional(),
  name:                z.string().min(1),
  email:               z.string().optional(),
  phone:               z.string().optional(),
  phone2:              z.string().optional(),
  address:             z.string().optional(),
  city:                z.string().optional(),
  country:             z.string().optional(),
  postalBox:           z.string().optional(),
  taxNumber:           z.string().optional(),
  rccm:                z.string().optional(),
  bankName:            z.string().optional(),
  bankAccount:         z.string().optional(),
  currency:            z.string().optional(),
  defaultPaymentTerms: z.string().optional(),
  internalNotes:       z.string().optional(),
});

export const importClientsSchema = z.object({
  rows: z.array(importClientRowSchema).min(1).max(1000),
});

export type CreateClientInput  = z.infer<typeof createClientSchema>;
export type UpdateClientInput  = z.infer<typeof updateClientSchema>;
export type ListClientsInput   = z.infer<typeof listClientsSchema>;
export type ImportClientRow    = z.infer<typeof importClientRowSchema>;
```

#### `clients.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma }        from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import type { CreateClientInput, UpdateClientInput, ListClientsInput, ImportClientRow } from './clients.schema';

export interface ImportClientResult {
  created:    number;
  duplicates: { index: number; name: string; reason: string }[];
  errors:     { index: number; name: string; message: string }[];
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListClientsInput) {
    const { page, limit, type, status, search, city } = input;
    const skip  = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      deletedAt: status === 'archived' ? { not: null } : null,
      ...(type   && { type }),
      ...(status && { status }),
      ...(city   && { city: { contains: city, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { name:      { contains: search, mode: 'insensitive' } },
          { email:     { contains: search, mode: 'insensitive' } },
          { phone:     { contains: search, mode: 'insensitive' } },
          { taxNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw AppError.notFound('Client introuvable');
    return client;
  }

  async create(input: CreateClientInput, createdById: string) {
    const conditions: Prisma.ClientWhereInput[] = [
      { name: { equals: input.name, mode: 'insensitive' } },
    ];
    if (input.email)     conditions.push({ email:     { equals: input.email,     mode: 'insensitive' } });
    if (input.taxNumber) conditions.push({ taxNumber: { equals: input.taxNumber } });

    const existing = await this.prisma.client.findFirst({
      where: { deletedAt: null, OR: conditions },
      select: { id: true, name: true, email: true, taxNumber: true },
    });

    if (existing) {
      const reason =
        input.taxNumber && existing.taxNumber === input.taxNumber
          ? `numéro fiscal "${input.taxNumber}"`
          : input.email && existing.email?.toLowerCase() === input.email.toLowerCase()
          ? `adresse email "${input.email}"`
          : `nom "${existing.name}"`;
      throw AppError.conflict(`Un client avec le même ${reason} existe déjà (id: ${existing.id}).`);
    }

    return this.prisma.client.create({
      data: { ...input, createdById, metadata: (input.metadata ?? {}) as object },
    });
  }

  async update(id: string, input: UpdateClientInput) {
    await this.findById(id);
    return this.prisma.client.update({ where: { id }, data: input as any });
  }

  async archive(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.client.update({
      where: { id },
      data:  { deletedAt: new Date(), status: 'archived' },
    });
  }

  // quickFill, getRiskScore, getSummary, importClients :
  // Copier EXACTEMENT depuis clients.service.ts Express,
  // en remplaçant `prisma.` par `this.prisma.` partout.
  // La logique SQL raw et les calculs sont identiques.
  async quickFill(clientId: string) {
    // [copier depuis clients.service.ts Express - ligne 99 à 206]
    // Remplacer prisma. → this.prisma.
  }

  async getRiskScore(id: string) {
    // [copier depuis clients.service.ts Express - ligne 218 à 307]
    // Remplacer prisma. → this.prisma.
  }

  async getSummary(id: string) {
    // [copier depuis clients.service.ts Express - ligne 309 à 358]
    // Remplacer prisma. → this.prisma.
  }

  async importClients(rows: ImportClientRow[], createdById: string): Promise<ImportClientResult> {
    // [copier depuis clients.service.ts Express - ligne 366 à 461]
    // Remplacer prisma. → this.prisma.
  }
}
```

#### `clients.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ClientsService }  from './clients.service';
import { Permission }      from '../../core/decorators/permission.decorator';
import { GetUser }         from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }    from '../../core/guards/jwt-auth.guard';
import {
  createClientSchema, updateClientSchema,
  listClientsSchema, importClientsSchema,
} from './clients.schema';

@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get()
  @Permission('clients:read')
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listClientsSchema.parse(query));
    return { success: true, ...result };
  }

  // Routes statiques AVANT /:id
  @Post('import')
  @Permission('clients:create')
  async importClients(@Body() body: unknown, @GetUser() user: JwtUser) {
    const { rows } = importClientsSchema.parse(body);
    return this.svc.importClients(rows, user.id);
  }

  @Get(':id')
  @Permission('clients:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('clients:create')
  create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.create(createClientSchema.parse(body), user.id);
  }

  @Put(':id')
  @Permission('clients:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateClientSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('clients:delete')
  async archive(@Param('id') id: string) {
    await this.svc.archive(id);
    return { message: 'Client archivé' };
  }

  @Get(':id/quick-fill')
  @Permission('clients:read')
  quickFill(@Param('id') id: string) {
    return this.svc.quickFill(id);
  }

  @Get(':id/summary')
  @Permission('clients:read')
  getSummary(@Param('id') id: string) {
    return this.svc.getSummary(id);
  }

  @Get(':id/risk-score')
  @Permission('clients:read')
  getRiskScore(@Param('id') id: string) {
    return this.svc.getRiskScore(id);
  }
}
```

#### `clients.module.ts`

```typescript
import { Module }           from '@nestjs/common';
import { PrismaModule }     from '../../core/prisma/prisma.module';
import { ClientsService }   from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [ClientsService],
  controllers: [ClientsController],
  exports:     [ClientsService],
})
export class ClientsModule {}
```

---

### MODULE 2 — Products (inclut Categories)

**Deux controllers, un service, un module.**

```
src/modules/products/
├── products.module.ts
├── products.service.ts
├── products.controller.ts      ← @Controller('products')
├── categories.controller.ts    ← @Controller('product-categories')
└── products.schema.ts
```

#### `products.schema.ts` (identique à Express)

```typescript
import { z } from 'zod';

export const createCategorySchema = z.object({
  name:      z.string().min(1).max(100),
  description: z.string().optional(),
  icon:      z.string().max(50).optional(),
  color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().default(0),
  isActive:  z.boolean().default(true),
});
export const updateCategorySchema = createCategorySchema.partial();

export const createProductSchema = z.object({
  categoryId:   z.string().uuid().optional(),
  name:         z.string().min(1).max(255),
  reference:    z.string().max(100).optional(),
  type:         z.enum(['product', 'service']).default('product'),
  description:  z.string().optional(),
  unit:         z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
  unitPriceHt:  z.coerce.number().min(0).default(0),
  taxRateId:    z.string().uuid().optional(),
  taxRateValue: z.coerce.number().min(0).max(100).default(19.25),
  isActive:     z.boolean().default(true),
  metadata:     z.record(z.unknown()).optional(),
});
export const updateProductSchema = createProductSchema.partial();

export const listProductsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  categoryId: z.string().uuid().optional(),
  type:       z.enum(['product', 'service']).optional(),
  isActive:   z.coerce.boolean().optional(),
  search:     z.string().optional(),
  clientId:   z.string().uuid().optional(),
});

export const importProductsSchema = z.object({
  rows: z.array(z.object({
    name:         z.string().min(1).max(255),
    reference:    z.string().max(100).optional(),
    type:         z.enum(['product', 'service']).default('product'),
    categoryName: z.string().max(100).optional(),
    unitPriceHt:  z.coerce.number().min(0).default(0),
    taxRateValue: z.coerce.number().min(0).max(100).default(19.25),
    unit:         z.enum(['heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee']).default('piece'),
    description:  z.string().optional(),
    isActive:     z.boolean().default(true),
  })).min(1).max(500),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput  = z.infer<typeof createProductSchema>;
export type UpdateProductInput  = z.infer<typeof updateProductSchema>;
export type ListProductsInput   = z.infer<typeof listProductsSchema>;
```

#### `products.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma }        from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import type { CreateCategoryInput, UpdateCategoryInput, CreateProductInput, UpdateProductInput, ListProductsInput } from './products.schema';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ────────────────────────────────────────────────────────────────

  listCategories() {
    return this.prisma.productCategory.findMany({
      where: { deletedAt: null }, orderBy: { sortOrder: 'asc' },
    });
  }

  async findCategoryById(id: string) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!cat) throw AppError.notFound('Catégorie introuvable');
    return cat;
  }

  async createCategory(input: CreateCategoryInput, createdById: string) {
    return this.prisma.productCategory.create({ data: { ...input, createdById } });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    await this.findCategoryById(id);
    return this.prisma.productCategory.update({ where: { id }, data: input });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.findCategoryById(id);
    const hasProducts = await this.prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (hasProducts > 0) throw AppError.conflict('Impossible de supprimer une catégorie contenant des produits actifs');
    await this.prisma.productCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  // ── Products ──────────────────────────────────────────────────────────────────

  async list(input: ListProductsInput) {
    const { page, limit, categoryId, type, isActive, search } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(type       && { type }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name:        { contains: search, mode: 'insensitive' } },
          { reference:   { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return { data: products, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findFirst({
      where:   { id, deletedAt: null },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) throw AppError.notFound('Produit introuvable');
    return product;
  }

  async create(input: CreateProductInput, createdById: string) {
    return this.prisma.product.create({
      data: { ...input, createdById, metadata: (input.metadata ?? {}) as object },
    });
  }

  async update(id: string, input: UpdateProductInput) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data: input as any });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async lineDefaults(id: string) {
    // Retourne les valeurs par défaut pour pré-remplir une ligne de document
    const product = await this.findById(id);
    return {
      productId:    product.id,
      description:  product.name + (product.description ? ` — ${product.description}` : ''),
      unit:         product.unit,
      unitPriceHt:  Number(product.unitPriceHt),
      taxRateValue: Number(product.taxRateValue),
      taxRateId:    product.taxRateId,
    };
  }

  async importProducts(rows: any[], createdById: string) {
    // [copier depuis products.service.ts Express]
    // Remplacer prisma. → this.prisma.
  }
}
```

#### `categories.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ProductsService }  from './products.service';
import { Permission }       from '../../core/decorators/permission.decorator';
import { GetUser }          from '../../core/decorators/get-user.decorator';
import type { JwtUser }     from '../../core/guards/jwt-auth.guard';
import { createCategorySchema, updateCategorySchema } from './products.schema';

@Controller('product-categories')
export class CategoriesController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  list() { return this.svc.listCategories(); }

  @Get(':id')
  findById(@Param('id') id: string) { return this.svc.findCategoryById(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('products:create')
  create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.createCategory(createCategorySchema.parse(body), user.id);
  }

  @Put(':id')
  @Permission('products:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateCategory(id, updateCategorySchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('products:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteCategory(id);
    return { message: 'Catégorie supprimée' };
  }
}
```

#### `products.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Permission }      from '../../core/decorators/permission.decorator';
import { GetUser }         from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }    from '../../core/guards/jwt-auth.guard';
import { createProductSchema, updateProductSchema, listProductsSchema, importProductsSchema } from './products.schema';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listProductsSchema.parse(query));
    return { success: true, ...result };
  }

  // ⚠️ Routes statiques AVANT /:id (respecter l'ordre !)
  @Post('import')
  @Permission('products:create')
  async importProducts(@Body() body: unknown, @GetUser() user: JwtUser) {
    const { rows } = importProductsSchema.parse(body);
    return this.svc.importProducts(rows, user.id);
  }

  @Get(':id/line-defaults')
  lineDefaults(@Param('id') id: string) {
    return this.svc.lineDefaults(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('products:create')
  create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.create(createProductSchema.parse(body), user.id);
  }

  @Put(':id')
  @Permission('products:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateProductSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('products:delete')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { message: 'Produit supprimé' };
  }
}
```

#### `products.module.ts`

```typescript
import { Module }                from '@nestjs/common';
import { PrismaModule }          from '../../core/prisma/prisma.module';
import { ProductsService }       from './products.service';
import { ProductsController }    from './products.controller';
import { CategoriesController }  from './categories.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [ProductsService],
  controllers: [ProductsController, CategoriesController],
  exports:     [ProductsService],
})
export class ProductsModule {}
```

---

### MODULE 3 — Recurring

Aucune dépendance externe. Module indépendant.

```
src/modules/recurring/
├── recurring.module.ts
├── recurring.service.ts
├── recurring.controller.ts
└── recurring.schema.ts
```

#### `recurring.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService }       from '../../core/prisma/prisma.service';
import { AppError }            from '../../core/errors/app-error';
import { generateDocumentNumber, getDefaultOfficeId } from '../../lib/documentNumber';
import { computeLine, computeTotals } from '../../lib/document-math';
// Les fonctions lib restent des imports directs (fonctions pures, pas besoin de DI)

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  // Copier EXACTEMENT les méthodes depuis recurring.service.ts Express
  // (list, findById, create, update, delete, activate, deactivate, generate)
  // En remplaçant :
  //   prisma.  →  this.prisma.
  //   La fonction nextDate() reste définie au niveau module (non classe)
}
```

#### `recurring.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { Permission }       from '../../core/decorators/permission.decorator';
import { GetUser }          from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }     from '../../core/guards/jwt-auth.guard';

// Importer et réutiliser les schémas depuis recurring.schema.ts Express

@Controller('recurring')
export class RecurringController {
  constructor(private readonly svc: RecurringService) {}

  @Get()
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(/* schema.parse(query) */);
    return { success: true, ...result };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('invoices:create')
  create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.create(/* schema.parse(body), user.id */);
  }

  @Get(':id')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Put(':id')
  @Permission('invoices:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, /* schema.parse(body) */);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('invoices:delete')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { message: 'Gabarit supprimé' };
  }

  @Post(':id/activate')
  @Permission('invoices:create')
  activate(@Param('id') id: string) { return this.svc.activate(id); }

  @Post(':id/deactivate')
  @Permission('invoices:create')
  deactivate(@Param('id') id: string) { return this.svc.deactivate(id); }

  @Post(':id/generate')
  @Permission('invoices:create')
  generate(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.svc.generate(id, user.id);
  }
}
```

#### `recurring.module.ts`

```typescript
import { Module }              from '@nestjs/common';
import { PrismaModule }        from '../../core/prisma/prisma.module';
import { RecurringService }    from './recurring.service';
import { RecurringController } from './recurring.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [RecurringService],
  controllers: [RecurringController],
  exports:     [RecurringService],
})
export class RecurringModule {}
```

---

### MODULE 4 — Approvals

**Point d'attention** : multi-permissions avec `@Permissions()` (OR logic).

```
src/modules/approvals/
├── approvals.module.ts
├── approvals.service.ts
├── approvals.controller.ts
└── approvals.schema.ts
```

#### `approvals.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { Permission }       from '../../core/decorators/permission.decorator';
import { Permissions }      from '../../core/decorators/permissions.decorator';  // PLURAL
import { GetUser }          from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }     from '../../core/guards/jwt-auth.guard';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  // ── Workflows (admin only) ────────────────────────────────────────────────────

  @Get('workflows')
  @Permission('approvals:admin')
  listWorkflows() { return this.svc.listWorkflows(); }

  @Post('workflows')
  @HttpCode(HttpStatus.CREATED)
  @Permission('approvals:admin')
  createWorkflow(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.createWorkflow(body, user.id);
  }

  @Get('workflows/:id')
  @Permission('approvals:admin')
  findWorkflow(@Param('id') id: string) { return this.svc.findWorkflow(id); }

  @Put('workflows/:id')
  @Permission('approvals:admin')
  updateWorkflow(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateWorkflow(id, body);
  }

  @Delete('workflows/:id')
  @HttpCode(HttpStatus.OK)
  @Permission('approvals:admin')
  async deleteWorkflow(@Param('id') id: string) {
    await this.svc.deleteWorkflow(id);
    return { message: 'Workflow supprimé' };
  }

  // ── Demandes d'approbation ────────────────────────────────────────────────────

  // @Permissions (plural) → OR logic : l'utilisateur a view OU view_own
  @Get('requests')
  @Permissions('approvals:view', 'approvals:view_own')
  @SkipResponseWrapper()
  async listRequests(@Query() query: unknown, @GetUser() user: JwtUser) {
    const result = await this.svc.listRequests(query, user.id);
    return { success: true, ...result };
  }

  @Get('pending-count')
  @Permissions('approvals:view', 'approvals:view_own')
  pendingCount(@GetUser() user: JwtUser) {
    return this.svc.pendingCount(user.id);
  }

  @Get('requests/:id')
  @Permissions('approvals:view', 'approvals:view_own')
  findRequest(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.svc.findRequest(id, user.id);
  }

  @Post('requests/:id/approve')
  @Permission('approvals:approve')
  approve(@Param('id') id: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.approve(id, body, user.id);
  }

  @Post('requests/:id/reject')
  @Permission('approvals:approve')
  reject(@Param('id') id: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.reject(id, body, user.id);
  }

  @Post('requests/:id/delegate')
  @Permission('approvals:approve')
  delegate(@Param('id') id: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.delegate(id, body, user.id);
  }

  @Post('requests/:id/cancel')
  @Permissions('approvals:view', 'approvals:view_own')
  cancel(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.svc.cancel(id, user.id);
  }
}
```

#### `approvals.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
// Copier le service Express en remplaçant prisma. → this.prisma.

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}
  // [copier depuis approvals.service.ts Express]
}
```

#### `approvals.module.ts`

```typescript
import { Module }              from '@nestjs/common';
import { PrismaModule }        from '../../core/prisma/prisma.module';
import { ApprovalsService }    from './approvals.service';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [ApprovalsService],
  controllers: [ApprovalsController],
  exports:     [ApprovalsService],   // exporté pour injection dans InvoicesService
})
export class ApprovalsModule {}
```

---

## MODULES COMPLEXES — Injection + Patterns

Les services Proformas, Invoices, Payments sont les plus longs (~500-1200 lignes).
La logique métier est **identique** à Express — seule l'injection change.

### MODULE 5 — Payments

#### Dépendances à injecter

```typescript
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly cache:     DashboardCacheService,
    private readonly events:    EventsGateway,
    private readonly emitter:   EventEmitter2,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
  ) {}
```

#### Remplacements dans le corps du service

| Express | NestJS |
|---|---|
| `prisma.` | `this.prisma.` |
| `DashboardService.invalidateCache()` | `await this.cache.invalidate()` |
| `broadcastNotification({...})` | `this.events.server.emit('notification', {...})` |
| `eventBus.emit('invoice.paid', ...)` | `this.emitter.emit('invoice.paid', ...)` |
| `notificationQueue.add(...)` | `this.notifQueue.add(...)` |
| `generatePdf(...)` | `generatePdf(...)` (import direct) |
| `accountingEngine.*` | `accountingEngine.*` (import direct) |

#### `payments.module.ts`

```typescript
import { Module }              from '@nestjs/common';
import { BullModule }          from '@nestjs/bullmq';
import { EventEmitterModule }  from '@nestjs/event-emitter';
import { PrismaModule }        from '../../core/prisma/prisma.module';
import { EventsModule }        from '../../core/events/events.module';
import { CoreServicesModule }  from '../../core/services/core-services.module';
import { PaymentsService, NOTIFICATION_QUEUE } from './payments.service';
import { PaymentsController }  from './payments.controller';

@Module({
  imports: [
    PrismaModule,
    EventsModule,          // pour EventsGateway
    CoreServicesModule,    // pour DashboardCacheService
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers:   [PaymentsService],
  controllers: [PaymentsController],
  exports:     [PaymentsService],   // exporté pour InvoicesController
})
export class PaymentsModule {}
```

#### `payments.controller.ts` — Patterns clés

```typescript
import { Controller, Get, Post, Delete, Param, Body, Query,
         UseInterceptors, UploadedFile, Res, HttpCode, HttpStatus,
         StreamableFile, UseGuards } from '@nestjs/common';
import { FileInterceptor }     from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { diskStorage }         from 'multer';
import { v4 as uuidv4 }        from 'uuid';
import { Response }            from 'express';
import path                    from 'path';
import fs                      from 'fs';
import { PaymentsService }     from './payments.service';
import { Permission }          from '../../core/decorators/permission.decorator';
import { GetUser }             from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }        from '../../core/guards/jwt-auth.guard';
import { createPaymentSchema, listPaymentsSchema } from './payments.schema';

const PAYMENT_DIR = path.resolve(process.cwd(), 'uploads', 'payments');
fs.mkdirSync(PAYMENT_DIR, { recursive: true });

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @Permission('payments:read')
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listPaymentsSchema.parse(query));
    return { success: true, ...result };
  }

  @Get(':id/receipt')
  @Permission('payments:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  async getReceipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.svc.generateReceipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('payments:delete')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Paiement supprimé' };
  }

  @Post(':id/attachment')
  @Permission('payments:create')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, PAYMENT_DIR),
      filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.bin'}`),
    }),
    limits:     { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Format non accepté. Utilisez PDF, JPEG ou PNG.'));
    },
  }))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new Error('Aucun fichier reçu');
    try {
      await this.svc.uploadAttachment(id, file.path);
      return null;
    } catch (err) {
      fs.unlink(file.path, () => {});
      throw err;
    }
  }

  @Get(':id/attachment')
  @Permission('payments:read')
  @SkipResponseWrapper()
  async getAttachment(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filePath, filename } = await this.svc.getAttachment(id);
    const ext  = path.extname(filePath).toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf'
      : ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg'
      : ext === '.png' ? 'image/png' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Delete(':id/attachment')
  @HttpCode(HttpStatus.OK)
  @Permission('payments:create')
  async deleteAttachment(@Param('id') id: string) {
    await this.svc.deleteAttachment(id);
    return { message: 'Justificatif supprimé' };
  }
}
```

---

### MODULE 6 — Proformas

#### Dépendances à injecter

```typescript
@Injectable()
export class ProformasService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly cache:      DashboardCacheService,
    private readonly events:     EventsGateway,
    @InjectQueue(EMAIL_QUEUE)        private readonly emailQueue:  Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue:  Queue,
  ) {}
```

#### `proformas.module.ts`

```typescript
import { Module }              from '@nestjs/common';
import { BullModule }          from '@nestjs/bullmq';
import { PrismaModule }        from '../../core/prisma/prisma.module';
import { EventsModule }        from '../../core/events/events.module';
import { CoreServicesModule }  from '../../core/services/core-services.module';
import { ProformasService, EMAIL_QUEUE, NOTIFICATION_QUEUE } from './proformas.service';
import { ProformasController } from './proformas.controller';

@Module({
  imports: [
    PrismaModule, EventsModule, CoreServicesModule,
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: NOTIFICATION_QUEUE },
    ),
  ],
  providers:   [ProformasService],
  controllers: [ProformasController],
  exports:     [ProformasService],
})
export class ProformasModule {}
```

#### Routes clés dans `proformas.controller.ts`

```typescript
@Controller('proformas')
export class ProformasController {
  constructor(private readonly svc: ProformasService) {}

  // Statiques AVANT /:id
  @Get('counts')
  @Permission('proformas:read')
  counts() { return this.svc.counts(); }

  // PDF avec rate limiting
  @Get(':id/pdf')
  @Permission('proformas:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  // quick-confirm → alias vers la même méthode send()
  @Post(':id/quick-confirm-sent')
  @Permission('proformas:update')
  quickConfirmSent(@Param('id') id: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.send(id, body, user.id);
  }

  @Post(':id/quick-confirm-accepted')
  @Permission('proformas:update')
  quickConfirmAccepted(@Param('id') id: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.accept(id, user.id);
  }

  // ... autres routes : send, accept, reject, convert, duplicate
}
```

---

### MODULE 7 — Invoices

Le plus complexe — inclut la route `POST /:id/payment` qui délègue à `PaymentsService`.

#### Dépendances à injecter

```typescript
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly cache:        DashboardCacheService,
    private readonly events:       EventsGateway,
    private readonly emitter:      EventEmitter2,
    private readonly payments:     PaymentsService,      // cross-module
    private readonly approvals:    ApprovalsService,     // cross-module
    @InjectQueue(EMAIL_QUEUE)        private readonly emailQueue:  Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue:  Queue,
  ) {}
```

#### `invoices.module.ts`

```typescript
import { Module }              from '@nestjs/common';
import { BullModule }          from '@nestjs/bullmq';
import { PrismaModule }        from '../../core/prisma/prisma.module';
import { EventsModule }        from '../../core/events/events.module';
import { CoreServicesModule }  from '../../core/services/core-services.module';
import { PaymentsModule }      from '../payments/payments.module';
import { ApprovalsModule }     from '../approvals/approvals.module';
import { InvoicesService, EMAIL_QUEUE, NOTIFICATION_QUEUE } from './invoices.service';
import { InvoicesController }  from './invoices.controller';

@Module({
  imports: [
    PrismaModule, EventsModule, CoreServicesModule,
    PaymentsModule,    // exporte PaymentsService
    ApprovalsModule,   // exporte ApprovalsService
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: NOTIFICATION_QUEUE },
    ),
  ],
  providers:   [InvoicesService],
  controllers: [InvoicesController],
  exports:     [InvoicesService],
})
export class InvoicesModule {}
```

#### Routes clés dans `invoices.controller.ts`

```typescript
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly svc:      InvoicesService,
    private readonly payments: PaymentsService,  // injection directe pour la sous-route
  ) {}

  // Statiques AVANT /:id
  @Post('compute')
  @Permission('invoices:read')
  compute(@Body() body: unknown) { return this.svc.compute(body); }

  @Get('counts')
  @Permission('invoices:read')
  counts() { return this.svc.counts(); }

  // PDF avec rate limiting
  @Get(':id/pdf')
  @Permission('invoices:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  // Paiement comme sous-route de la facture (même URL qu'en Express)
  @Post(':id/payment')
  @HttpCode(HttpStatus.CREATED)
  @Permission('payments:create')
  createPayment(@Param('id') invoiceId: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.payments.create(invoiceId, createPaymentSchema.parse(body), user.id);
  }

  // quick-confirm → aliases
  @Post(':id/quick-confirm-payment')
  @Permission('payments:create')
  quickConfirmPayment(@Param('id') invoiceId: string, @Body() body: unknown, @GetUser() user: JwtUser) {
    return this.payments.create(invoiceId, createPaymentSchema.parse(body), user.id);
  }

  @Post(':id/quick-confirm-issued')
  @Permission('invoices:update')
  quickConfirmIssued(@Param('id') id: string, @GetUser() user: JwtUser) {
    return this.svc.issue(id, user.id);
  }

  // ... autres : issue, cancel, duplicate, avoir, history, soldePrefill, getPaymentPrediction
}
```

---

## Mise à jour AppModule

```typescript
// src/app.module.ts — ajouter dans imports[]
import { EventEmitterModule }  from '@nestjs/event-emitter';
import { ThrottlerModule }     from '@nestjs/throttler';
import { CoreServicesModule }  from './core/services/core-services.module';
import { ClientsModule }       from './modules/clients/clients.module';
import { ProductsModule }      from './modules/products/products.module';
import { RecurringModule }     from './modules/recurring/recurring.module';
import { ApprovalsModule }     from './modules/approvals/approvals.module';
import { PaymentsModule }      from './modules/payments/payments.module';
import { ProformasModule }     from './modules/proformas/proformas.module';
import { InvoicesModule }      from './modules/invoices/invoices.module';

@Module({
  imports: [
    // Infrastructure (Phase 1)
    ConfigModule.forRoot({ isGlobal: true, validate: cfg => envSchema.parse(cfg) }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),      // ← NOUVEAU (remplace eventBus)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),  // ← NOUVEAU (PDF rate limit)
    PrismaModule, RedisModule, EventsModule, JobsModule, HealthModule,
    // Modules Phase 2
    TaxRatesModule, OfficesModule, RolesModule,
    EmailTemplatesModule, NotificationsModule, GuideModule,
    // Modules Phase 3
    AuthModule, UsersModule,
    // Services transverses Phase 4
    CoreServicesModule,
    // Modules métier Phase 4
    ClientsModule, ProductsModule, RecurringModule,
    ApprovalsModule, PaymentsModule, ProformasModule, InvoicesModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },
    { provide: APP_GUARD,       useClass: RbacGuard },
    { provide: APP_FILTER,      useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_PIPE,        useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
```

---

## Récapitulatif des pièges Phase 4

| Problème | Cause | Solution |
|---|---|---|
| DashboardService non migré | Phase 7 pas encore faite | `DashboardCacheService` dans `CoreServicesModule` |
| `broadcastNotification` introuvable | Lib Express, pas NestJS | Injecter `EventsGateway`, `.server.emit()` |
| `eventBus.emit` introuvable | Lib Express | `EventEmitter2` de `@nestjs/event-emitter` |
| PDF : JSON dans la réponse | `ResponseInterceptor` wrap | `@SkipResponseWrapper()` + `StreamableFile` |
| Rate limit PDF | `rateLimitByUser` absent en NestJS | `@UseGuards(ThrottlerGuard)` |
| `authorizePermission('x', 'y')` | `@Permission` ne supporte qu'une valeur | Créer `@Permissions()` plural |
| Circularité InvoicesModule ↔ PaymentsModule | Import mutuel | Injecting PaymentsService dans InvoicesController |
| Deux routers Express → un module NestJS | Deux préfixes différents | Deux controllers dans ProductsModule |
| `/invoices/:id/payment` disparaît | Route dans invoices.routes.ts Express | Ajouter dans InvoicesController |
| Statique avant paramètre | `GET /compute` après `GET /:id` | Ordre de déclaration dans le controller |
