# PHASE 2 — MODULES SIMPLES (6 modules)

## Contexte

Tu migres une API Express/TypeScript vers NestJS. La Phase 1 a posé l'infrastructure
(PrismaModule, JwtAuthGuard global, RbacGuard global, ResponseInterceptor, AllExceptionsFilter,
ZodValidationPipe, RedisModule, EventsGateway, JobsModule, AppModule, main.ts).

Cette phase migre **6 modules sans dépendances métier circulaires** :
`tax-rates`, `offices`, `roles`, `email-templates`, `notifications`, `guide`.

Répertoire NestJS cible : `bridge-nestjs/src/`

---

## CORRECTION CRITIQUE — AppModule (Phase 1 oubli fréquent)

Avant de commencer les modules, vérifie que `src/app.module.ts` contient bien
les APP_GUARD en `providers`. Sans ça, JwtAuthGuard et RbacGuard ne sont **pas globaux**.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule }      from '@nestjs/config';
import { ScheduleModule }    from '@nestjs/schedule';
import { PrismaModule }      from './core/prisma/prisma.module';
import { RedisModule }       from './core/redis/redis.module';
import { EventsModule }      from './core/events/events.module';
import { JobsModule }        from './jobs/jobs.module';
import { HealthModule }      from './modules/health/health.module';
import { JwtAuthGuard }      from './core/guards/jwt-auth.guard';
import { RbacGuard }         from './core/guards/rbac.guard';
import { AllExceptionsFilter }  from './core/filters/all-exceptions.filter';
import { ResponseInterceptor }  from './core/interceptors/response.interceptor';
import { AuditInterceptor }     from './core/interceptors/audit.interceptor';
import { ZodValidationPipe }    from './core/pipes/zod-validation.pipe';
import { envSchema }            from './config/env.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: cfg => envSchema.parse(cfg) }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EventsModule,
    JobsModule,
    HealthModule,
    // ← Les modules Phase 2 seront ajoutés ici au fur et à mesure
  ],
  providers: [
    // ── Guards globaux ────────────────────────────────────────────────────────
    { provide: APP_GUARD,       useClass: JwtAuthGuard },   // authentification JWT
    { provide: APP_GUARD,       useClass: RbacGuard },      // vérification permission
    // ── Filtre global ─────────────────────────────────────────────────────────
    { provide: APP_FILTER,      useClass: AllExceptionsFilter },
    // ── Intercepteurs globaux ─────────────────────────────────────────────────
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // ── Pipe global ───────────────────────────────────────────────────────────
    { provide: APP_PIPE,        useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
```

> **Règle** : deux `APP_GUARD` dans `providers[]` → NestJS les applique dans l'ordre
> déclaré sur chaque requête. JwtAuthGuard d'abord (pose `req.user`), RbacGuard
> ensuite (lit `req.user.permissions`).

---

## Rappel des décorateurs créés en Phase 1

```typescript
// src/core/decorators/public.decorator.ts
export const Public = () => SetMetadata('isPublic', true);

// src/core/decorators/permission.decorator.ts
export const Permission = (perm: string) => SetMetadata('permission', perm);

// src/core/decorators/get-user.decorator.ts
export const GetUser = createParamDecorator(
  (_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

// src/core/decorators/skip-response-wrapper.decorator.ts
export const SKIP_RESPONSE_WRAPPER_KEY = 'skipResponseWrapper';
export const SkipResponseWrapper = () => SetMetadata(SKIP_RESPONSE_WRAPPER_KEY, true);
```

---

## MODULE 1 — TaxRates

### Pourquoi simple

CRUD pur sur `tax_rates`. Pas de dépendances inter-modules. Pattern de base
pour tous les modules de référentiel de l'application.

### Fichiers à créer

```
src/modules/tax-rates/
├── tax-rates.module.ts
├── tax-rates.service.ts
├── tax-rates.controller.ts
└── tax-rates.schema.ts
```

### `tax-rates.schema.ts`

```typescript
import { z } from 'zod';

export const createTaxRateSchema = z.object({
  name:        z.string().min(1).max(100),
  code:        z.string().min(1).max(20).transform(v => v.toUpperCase()),
  rate:        z.number().min(0).max(100),
  description: z.string().optional(),
  isDefault:   z.boolean().optional(),
  isActive:    z.boolean().optional(),
});

export const updateTaxRateSchema = createTaxRateSchema.partial();

export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
```

### `tax-rates.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import type { CreateTaxRateInput, UpdateTaxRateInput } from './tax-rates.schema';

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.taxRate.findMany({
      where:   { ...(includeInactive ? {} : { isActive: true }), deletedAt: null },
      orderBy: { rate: 'asc' },
    });
  }

  async findById(id: string) {
    const data = await this.prisma.taxRate.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Taux de taxe introuvable');
    return data;
  }

  async create(input: CreateTaxRateInput) {
    if (input.isDefault) {
      await this.prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.taxRate.create({ data: input });
  }

  async update(id: string, input: UpdateTaxRateInput) {
    await this.findById(id);
    if (input.isDefault) {
      await this.prisma.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.taxRate.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le taux par défaut');
    await this.prisma.taxRate.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
```

### `tax-rates.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { TaxRatesService }    from './tax-rates.service';
import { Permission }         from '../../core/decorators/permission.decorator';
import { createTaxRateSchema, updateTaxRateSchema } from './tax-rates.schema';

@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly svc: TaxRatesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list(includeInactive === 'true');
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('settings:update')
  create(@Body() body: unknown) {
    return this.svc.create(createTaxRateSchema.parse(body));
  }

  @Put(':id')
  @Permission('settings:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateTaxRateSchema.parse(body));
  }

  @Delete(':id')
  @Permission('settings:update')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { message: 'Taux de taxe supprimé' };
  }
}
```

> **Note** : `@Body() body: unknown` + `.parse(body)` manuel = on bypasse le
> `ZodValidationPipe` global (qui ne connaît pas le schéma). C'est intentionnel :
> la validation est faite dans le service via le schéma Zod importé directement.
> Alternative : créer un `ZodBody(schema)` pipe custom — non nécessaire ici.

### `tax-rates.module.ts`

```typescript
import { Module }           from '@nestjs/common';
import { PrismaModule }     from '../../core/prisma/prisma.module';
import { TaxRatesService }  from './tax-rates.service';
import { TaxRatesController } from './tax-rates.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [TaxRatesService],
  controllers: [TaxRatesController],
  exports:     [TaxRatesService],
})
export class TaxRatesModule {}
```

### Ajout dans AppModule

```typescript
// src/app.module.ts — ajouter dans imports[]
import { TaxRatesModule } from './modules/tax-rates/tax-rates.module';
// ...
imports: [ ..., TaxRatesModule ],
```

---

## MODULE 2 — Offices

### Pourquoi légèrement différent de TaxRates

- Le champ `code` doit passer en majuscules (transform Zod)
- La suppression vérifie que le bureau n'est pas `isDefault`
- Soft-delete via `deletedAt + isActive: false`
- Les routes GET (list + findById) sont accessibles à tout utilisateur authentifié
  (pas de `@Permission`), seules les routes d'écriture nécessitent `settings:update`

### Fichiers à créer

```
src/modules/offices/
├── offices.module.ts
├── offices.service.ts
├── offices.controller.ts
└── offices.schema.ts
```

### `offices.schema.ts`

```typescript
import { z } from 'zod';

export const createOfficeSchema = z.object({
  code:      z.string().min(1).max(10).transform(v => v.toUpperCase()),
  name:      z.string().min(1).max(255),
  city:      z.string().max(100).optional(),
  address:   z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateOfficeSchema = createOfficeSchema.partial();

export type CreateOfficeInput = z.infer<typeof createOfficeSchema>;
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>;
```

### `offices.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService }     from '../../core/prisma/prisma.service';
import { AppError }          from '../../core/errors/app-error';
import type { CreateOfficeInput, UpdateOfficeInput } from './offices.schema';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.agencyOffice.findMany({
      where:   { deletedAt: null },
      orderBy: { isDefault: 'desc' },
    });
  }

  async findById(id: string) {
    const data = await this.prisma.agencyOffice.findFirst({ where: { id, deletedAt: null } });
    if (!data) throw AppError.notFound('Bureau introuvable');
    return data;
  }

  async create(input: CreateOfficeInput) {
    if (input.isDefault) {
      await this.prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.agencyOffice.create({ data: input });
  }

  async update(id: string, input: UpdateOfficeInput) {
    await this.findById(id);
    if (input.isDefault) {
      await this.prisma.agencyOffice.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.agencyOffice.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isDefault) throw AppError.badRequest('Impossible de supprimer le bureau par défaut');
    await this.prisma.agencyOffice.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
```

### `offices.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OfficesService }  from './offices.service';
import { Permission }      from '../../core/decorators/permission.decorator';
import { createOfficeSchema, updateOfficeSchema } from './offices.schema';

@Controller('offices')
export class OfficesController {
  constructor(private readonly svc: OfficesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('settings:update')
  create(@Body() body: unknown) {
    return this.svc.create(createOfficeSchema.parse(body));
  }

  @Put(':id')
  @Permission('settings:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateOfficeSchema.parse(body));
  }

  @Delete(':id')
  @Permission('settings:update')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { message: 'Bureau supprimé' };
  }
}
```

### `offices.module.ts`

```typescript
import { Module }          from '@nestjs/common';
import { PrismaModule }    from '../../core/prisma/prisma.module';
import { OfficesService }  from './offices.service';
import { OfficesController } from './offices.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [OfficesService],
  controllers: [OfficesController],
  exports:     [OfficesService],
})
export class OfficesModule {}
```

---

## MODULE 3 — Roles

### Pourquoi plus complexe

- Après `updateRole()`, il faut **invalider le cache RBAC Redis** pour tous les
  utilisateurs ayant ce rôle (`rbac:user:{userId}` → TTL 300s dans Phase 1).
- `deleteRole()` interdit la suppression d'un rôle système (`isSystem: true`) ou
  d'un rôle encore assigné.
- La route `GET /permissions` retourne la liste statique `ALL_PERMISSIONS` (constante
  exportée depuis le service).
- En Express, le service était des **fonctions libres** (pas une classe). En NestJS
  on utilise un `@Injectable()` pour le DI Redis.

### Injection Redis

Le `RedisModule` créé en Phase 1 expose `IORedis` sous le token
`REDIS_CLIENT` (ou via `@InjectRedis()` de `@nestjs-modules/ioredis`).
Adapter selon ce qui a été implémenté en Phase 1 :

```typescript
// Si Phase 1 a utilisé @nestjs-modules/ioredis
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
// Dans le constructeur : @InjectRedis() private readonly redis: Redis

// Si Phase 1 a créé un RedisService custom
import { RedisService } from '../../core/redis/redis.service';
// Dans le constructeur : private readonly redis: RedisService
```

### Fichiers à créer

```
src/modules/roles/
├── roles.module.ts
├── roles.service.ts
├── roles.controller.ts
└── roles.schema.ts
```

### `roles.schema.ts`

```typescript
import { z } from 'zod';

export const createRoleSchema = z.object({
  name:        z.string().min(2).max(100).regex(/^[a-z_]+$/, 'Minuscules et underscores uniquement'),
  displayName: z.string().min(2).max(255),
  permissions: z.array(z.string().min(1)).default([]),
});

export const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  permissions: z.array(z.string().min(1)).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
```

### `roles.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRedis }   from '@nestjs-modules/ioredis';
import Redis             from 'ioredis';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema';

export const ALL_PERMISSIONS = [
  'clients:read', 'clients:create', 'clients:update', 'clients:delete', 'clients:*',
  'invoices:read', 'invoices:create', 'invoices:update', 'invoices:delete', 'invoices:cancel', 'invoices:*',
  'proformas:read', 'proformas:create', 'proformas:update', 'proformas:delete', 'proformas:*',
  'payments:read', 'payments:create', 'payments:delete',
  'products:read', 'products:create', 'products:update', 'products:delete', 'products:*',
  'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete', 'suppliers:*',
  'purchases:read', 'purchases:create', 'purchases:update', 'purchases:approve', 'purchases:delete',
  'expenses:read', 'expenses:create', 'expenses:update', 'expenses:approve', 'expenses:delete',
  'stock:read', 'stock:create', 'stock:adjust',
  'bank:read', 'bank:create', 'bank:update', 'bank:reconcile', 'bank:manage',
  'bank:import-parse', 'bank:import-confirm', 'bank:auto-match', 'bank:rules',
  'accounting:read', 'accounting:create', 'accounting:validate', 'accounting:close', 'accounting:export',
  'users:read', 'users:manage',
  'roles:read', 'roles:manage',
  'reports:read', 'reports:export',
  'dashboard:read',
  'settings:read', 'settings:update',
  'audit:read',
  'notifications:read',
  'search:read',
  'backups:read', 'backups:manage',
  'approvals:admin', 'approvals:approve', 'approvals:view', 'approvals:view_own',
  '*',
];

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  list() {
    return this.prisma.role.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findFirst({
      where:   { id, deletedAt: null },
      include: {
        _count: { select: { users: true } },
        users: {
          where:  { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true },
          take:   20,
        },
      },
    });
    if (!role) throw AppError.notFound('Rôle introuvable');
    return role;
  }

  async create(data: CreateRoleInput, createdById: string) {
    const existing = await this.prisma.role.findUnique({ where: { name: data.name } });
    if (existing) throw AppError.conflict('Un rôle avec ce nom existe déjà');
    return this.prisma.role.create({ data: { ...data, createdById } });
  }

  async update(id: string, data: UpdateRoleInput) {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw AppError.notFound('Rôle introuvable');

    const updated = await this.prisma.role.update({ where: { id }, data });

    // Invalider le cache RBAC pour tous les utilisateurs ayant ce rôle
    await this.invalidateRoleCacheForUsers(id);

    return updated;
  }

  async delete(id: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where:   { id, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw AppError.notFound('Rôle introuvable');
    if (role.isSystem) throw AppError.forbidden('Les rôles système ne peuvent pas être supprimés');
    if (role._count.users > 0) {
      throw AppError.conflict(`Ce rôle est assigné à ${role._count.users} utilisateur(s)`);
    }
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Cache Redis RBAC ──────────────────────────────────────────────────────────

  private async invalidateRoleCacheForUsers(roleId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where:  { roleId, deletedAt: null },
      select: { id: true },
    });
    if (users.length === 0) return;

    // Pipeline Redis : supprime tous les clés en une seule commande réseau
    const pipeline = this.redis.pipeline();
    for (const { id } of users) {
      pipeline.del(`rbac:user:${id}`);
    }
    await pipeline.exec();
  }
}
```

### `roles.controller.ts`

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RolesService }  from './roles.service';
import { Permission }    from '../../core/decorators/permission.decorator';
import { GetUser }       from '../../core/decorators/get-user.decorator';
import type { JwtUser }  from '../../core/guards/jwt-auth.guard';
import { createRoleSchema, updateRoleSchema } from './roles.schema';
import { ALL_PERMISSIONS } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  // IMPORTANT : /permissions AVANT /:id pour éviter que NestJS
  // interprète "permissions" comme un paramètre :id
  @Get('permissions')
  @Permission('roles:read')
  listPermissions() {
    return ALL_PERMISSIONS;
  }

  @Get()
  @Permission('roles:read')
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @Permission('roles:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('roles:manage')
  create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.svc.create(createRoleSchema.parse(body), user.id);
  }

  @Put(':id')
  @Permission('roles:manage')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateRoleSchema.parse(body));
  }

  @Delete(':id')
  @Permission('roles:manage')
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { message: 'Rôle supprimé' };
  }
}
```

### `roles.module.ts`

```typescript
import { Module }          from '@nestjs/common';
import { PrismaModule }    from '../../core/prisma/prisma.module';
import { RedisModule }     from '../../core/redis/redis.module';
import { RolesService }    from './roles.service';
import { RolesController } from './roles.controller';

@Module({
  imports:     [PrismaModule, RedisModule],
  providers:   [RolesService],
  controllers: [RolesController],
  exports:     [RolesService],
})
export class RolesModule {}
```

---

## MODULE 4 — EmailTemplates

### Pourquoi l'ordre des routes est critique

Express enregistre les routes dans l'ordre où elles sont définies. NestJS fait
pareil **mais à l'intérieur d'un controller la priorité suit l'ordre de déclaration
des méthodes dans la classe**.

Le problème : `GET /by-type/:type` vs `GET /:id`

Si `/:id` est défini en premier, NestJS va essayer de résoudre `"by-type"` comme
un UUID et le service va lever une 404. **`by-type/:type` doit être déclaré avant
`/:id`** dans la classe controller.

### Fonctionnalités

- `list()` : tous les templates (admin/settings)
- `findByType(type)` : cherche par enum type (ex: `invoice_issued`)
- `findById(id)` : cherche par UUID
- `update(id)` : met à jour sujet + HTML
- `preview(id, vars)` : substitue `{{variable}}` dans sujet + HTML, retourne le rendu

Pas de `create` ni de `delete` : les templates sont pré-définis en base via seed.

### Fichiers à créer

```
src/modules/email-templates/
├── email-templates.module.ts
├── email-templates.service.ts
├── email-templates.controller.ts
└── email-templates.schema.ts
```

### `email-templates.schema.ts`

```typescript
import { z } from 'zod';

export const updateEmailTemplateSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  subject:  z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const previewEmailTemplateSchema = z.record(z.string(), z.string());

export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;
```

### `email-templates.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import type { UpdateEmailTemplateInput } from './email-templates.schema';

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async findById(id: string) {
    const data = await this.prisma.emailTemplate.findFirst({ where: { id } });
    if (!data) throw AppError.notFound('Template introuvable');
    return data;
  }

  async findByType(type: string) {
    const data = await this.prisma.emailTemplate.findFirst({ where: { type: type as never } });
    if (!data) throw AppError.notFound(`Template introuvable pour le type : ${type}`);
    return data;
  }

  async update(id: string, input: UpdateEmailTemplateInput) {
    await this.findById(id);
    return this.prisma.emailTemplate.update({ where: { id }, data: input });
  }

  async preview(id: string, vars: Record<string, string>) {
    const template = await this.findById(id);
    let subject = template.subject;
    let html    = template.bodyHtml;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      html    = html.replace(regex, value);
    }
    return { subject, html };
  }
}
```

### `email-templates.controller.ts`

```typescript
import { Controller, Get, Put, Post, Param, Body } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { Permission }            from '../../core/decorators/permission.decorator';
import { updateEmailTemplateSchema, previewEmailTemplateSchema } from './email-templates.schema';

@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly svc: EmailTemplatesService) {}

  @Get()
  @Permission('settings:read')
  list() {
    return this.svc.list();
  }

  // ⚠️ ORDRE CRITIQUE : by-type/:type AVANT /:id
  // Si /:id est défini en premier, "by-type" est interprété comme un UUID → 404
  @Get('by-type/:type')
  @Permission('settings:read')
  findByType(@Param('type') type: string) {
    return this.svc.findByType(type);
  }

  @Get(':id')
  @Permission('settings:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('settings:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateEmailTemplateSchema.parse(body));
  }

  @Post(':id/preview')
  @Permission('settings:read')
  preview(@Param('id') id: string, @Body() body: unknown) {
    const vars = previewEmailTemplateSchema.parse(body ?? {});
    return this.svc.preview(id, vars);
  }
}
```

### `email-templates.module.ts`

```typescript
import { Module }                    from '@nestjs/common';
import { PrismaModule }              from '../../core/prisma/prisma.module';
import { EmailTemplatesService }     from './email-templates.service';
import { EmailTemplatesController }  from './email-templates.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [EmailTemplatesService],
  controllers: [EmailTemplatesController],
  exports:     [EmailTemplatesService],
})
export class EmailTemplatesModule {}
```

---

## MODULE 5 — Notifications

### Deux problèmes spécifiques à ce module

#### Problème 1 : réponse paginée avec champ extra `unreadCount`

La réponse Express est :
```json
{ "success": true, "data": [...], "total": 42, "page": 1,
  "limit": 20, "totalPages": 3, "unreadCount": 5 }
```

Le `ResponseInterceptor` de Phase 1 wrappe automatiquement en
`{ success: true, data: <valeur retournée> }`. Si le controller retourne
`{ data: [...], total, page, limit, totalPages, unreadCount }`, on obtiendrait :
```json
{ "success": true, "data": { "data": [...], "total": 42, ... } }
```
— ce que le frontend n'attend **pas** (il lit `response.data.data` et `response.data.unreadCount`
au même niveau, pas imbriqués).

**Solution** : décorer la méthode `list()` avec `@SkipResponseWrapper()` et construire
la réponse manuellement.

#### Problème 2 : méthode statique `NotificationsService.create()`

Dans le code Express, `NotificationsService.create()` est une méthode **statique**
appelée directement depuis `notification.processor.ts` :
```typescript
await NotificationsService.create(userId, type, title, message, data);
```

En NestJS, les méthodes statiques cassent le pattern DI : le processor ne pourrait
pas injecter PrismaService via le constructeur si c'est une méthode statique appelée
sans instance.

**Solution** : renommer en `createNotification()` **instance method**. Le
`NotificationProcessor` (Phase 1 / JobsModule) devra injecter `NotificationsService` :

```typescript
// Dans jobs/processors/notification.processor.ts (Phase 1)
@Processor('notification')
export class NotificationProcessor {
  constructor(
    private readonly notificationsService: NotificationsService, // ← injection
  ) {}

  @Process()
  async handle(job: Job) {
    const { userId, type, title, message, data } = job.data;
    await this.notificationsService.createNotification(userId, type, title, message, data);
    // ... émettre via Socket.io
  }
}
```

Pour que cette injection fonctionne, `NotificationsModule` doit **exporter**
`NotificationsService` et `JobsModule` doit **importer** `NotificationsModule`.

### Fichiers à créer

```
src/modules/notifications/
├── notifications.module.ts
├── notifications.service.ts
└── notifications.controller.ts
```

### `notifications.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma, NotificationStatus, NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const skip  = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly && { isRead: false }),
    };

    const [total, data, unreadCount] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), unreadCount };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) throw AppError.notFound('Notification introuvable');
    await this.prisma.notification.update({
      where: { id },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async getSettings(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    return allTypes.map(type => ({
      type,
      channel: savedMap.get(type)?.channel ?? ('both' as NotificationChannel),
      enabled: savedMap.get(type)?.enabled ?? true,
    }));
  }

  async updateSettings(
    userId:   string,
    settings: Array<{ type: NotificationStatus; channel: NotificationChannel; enabled: boolean }>,
  ) {
    await this.prisma.$transaction(
      settings.map(s =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type: s.type } },
          create: { userId, type: s.type, channel: s.channel, enabled: s.enabled },
          update: { channel: s.channel, enabled: s.enabled },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  async disableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await this.prisma.$transaction(
      allTypes.map(type =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type } },
          create: { userId, type, channel: 'both', enabled: false },
          update: { enabled: false, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  async enableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await this.prisma.$transaction(
      allTypes.map(type =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type } },
          create: { userId, type, channel: 'both', enabled: true },
          update: { enabled: true, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  // ── Anciennement méthode statique — désormais instance pour le DI ─────────────
  async createNotification(
    userId:  string,
    type:    NotificationStatus,
    title:   string,
    message: string,
    data:    Record<string, unknown> = {},
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, title, message, data: data as object },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[NotificationsService.createNotification] Erreur silencieuse :', msg);
    });
  }
}
```

### `notifications.controller.ts`

```typescript
import { Controller, Get, Put, Param, Body, Query } from '@nestjs/common';
import { NotificationStatus, NotificationChannel } from '@prisma/client';
import { z } from 'zod';
import { NotificationsService } from './notifications.service';
import { Permission }           from '../../core/decorators/permission.decorator';
import { GetUser }              from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper }  from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }         from '../../core/guards/jwt-auth.guard';

const updateSettingsSchema = z.object({
  settings: z.array(z.object({
    type:    z.nativeEnum(NotificationStatus),
    channel: z.nativeEnum(NotificationChannel),
    enabled: z.boolean(),
  })).min(1),
});

@Controller('notifications')
@Permission('notifications:read')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // @SkipResponseWrapper() car la réponse contient des champs de pagination à la racine
  // que le frontend lit directement (response.data.total, response.data.unreadCount)
  // Le ResponseInterceptor les niquerait en les imbriquant sous "data"
  @Get()
  @SkipResponseWrapper()
  async list(
    @GetUser() user: JwtUser,
    @Query('page')       page?:      string,
    @Query('limit')      limit?:     string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const result = await this.svc.list(
      user.id,
      Math.max(1, parseInt(page  ?? '1',  10)),
      Math.min(100, Math.max(1, parseInt(limit ?? '20', 10))),
      unreadOnly === 'true',
    );
    return { success: true, ...result };
  }

  @Put('read-all')
  async markAllRead(@GetUser() user: JwtUser) {
    await this.svc.markAllRead(user.id);
    return { message: 'Toutes les notifications marquées comme lues' };
  }

  @Get('settings')
  async getSettings(@GetUser() user: JwtUser) {
    return this.svc.getSettings(user.id);
  }

  @Put('settings')
  async updateSettings(@GetUser() user: JwtUser, @Body() body: unknown) {
    const { settings } = updateSettingsSchema.parse(body);
    return this.svc.updateSettings(user.id, settings);
  }

  @Put('settings/disable-all')
  async disableAll(@GetUser() user: JwtUser) {
    return this.svc.disableAll(user.id);
  }

  @Put('settings/enable-all')
  async enableAll(@GetUser() user: JwtUser) {
    return this.svc.enableAll(user.id);
  }

  // ⚠️ ORDRE IMPORTANT : les routes spécifiques (read-all, settings, settings/*)
  // doivent être définies AVANT /:id pour éviter les conflits de paramètres.
  @Put(':id/read')
  async markRead(@Param('id') id: string, @GetUser() user: JwtUser) {
    await this.svc.markRead(id, user.id);
    return { message: 'Notification marquée comme lue' };
  }
}
```

> **Pourquoi `@Permission('notifications:read')` au niveau de la classe ?**
> Cela l'applique à toutes les routes du controller. C'est équivalent à
> `router.use(authorizePermission('notifications:read'))` en Express.

### `notifications.module.ts`

```typescript
import { Module }                   from '@nestjs/common';
import { PrismaModule }             from '../../core/prisma/prisma.module';
import { NotificationsService }     from './notifications.service';
import { NotificationsController }  from './notifications.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [NotificationsService],
  controllers: [NotificationsController],
  exports:     [NotificationsService],   // exporté pour injection dans JobsModule (NotificationProcessor)
})
export class NotificationsModule {}
```

### Mise à jour JobsModule pour injecter NotificationsService

```typescript
// src/jobs/jobs.module.ts — ajouter NotificationsModule
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [
    // ... BullModule, ScheduleModule déjà présents
    NotificationsModule,  // ← pour que NotificationProcessor puisse injecter NotificationsService
  ],
  providers: [
    NotificationProcessor,
    // ...
  ],
})
export class JobsModule {}
```

```typescript
// src/jobs/processors/notification.processor.ts — utiliser l'instance injectée
import { Processor, Process } from '@nestjs/bullmq';
import { Job }                from 'bullmq';
import { NotificationsService } from '../../modules/notifications/notifications.service';

@Processor('notification')
export class NotificationProcessor {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process()
  async handle(job: Job): Promise<void> {
    const { userId, type, title, message, data } = job.data as {
      userId: string; type: any; title: string; message: string; data?: Record<string, unknown>;
    };
    await this.notificationsService.createNotification(userId, type, title, message, data ?? {});
  }
}
```

---

## MODULE 6 — Guide

### Complexité spécifique : upload avec section dans l'URL

En Express, la `diskStorage` de multer utilise `req.params.section` pour nommer
le fichier **avant** que le handler soit appelé. En NestJS, `FileInterceptor`
traite le fichier **avant** que le handler s'exécute, mais la configuration de
storage est figée à la décoration.

**Solution choisie : `memoryStorage` + écriture manuelle dans le handler**

1. `FileInterceptor` avec `memoryStorage` reçoit le fichier en RAM
2. Le handler valide le paramètre `section`
3. Si section invalide → throw sans écrire sur le disque (pas de nettoyage nécessaire)
4. Si valide → `deleteVideo(section)` (remplace l'ancienne) + `fs.promises.writeFile`

Avantage : pas de fichier orphelin sur le disque en cas d'erreur de validation.

### Fichiers à créer

```
src/modules/guide/
├── guide.module.ts
├── guide.service.ts
└── guide.controller.ts
```

### `guide.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import path from 'path';
import fs   from 'fs';

export const VALID_SECTIONS = new Set([
  'facturation', 'proformas', 'recurrence', 'clients', 'produits',
  'rapports', 'notifications', 'assistant', 'securite', 'audit', 'parametres',
]);

const VIDEOS_DIR = path.resolve(process.cwd(), 'uploads', 'videos');

@Injectable()
export class GuideService {
  constructor() {
    // Créer le dossier au démarrage si inexistant
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  getVideosDir(): string {
    return VIDEOS_DIR;
  }

  findVideoFile(section: string): string | null {
    for (const ext of ['.mp4', '.webm', '.ogv', '.ogg']) {
      const filePath = path.join(VIDEOS_DIR, `${section}${ext}`);
      if (fs.existsSync(filePath)) return `${section}${ext}`;
    }
    return null;
  }

  listVideos(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const section of VALID_SECTIONS) {
      const file = this.findVideoFile(section);
      if (file) result[section] = `uploads/videos/${file}`;
    }
    return result;
  }

  deleteVideo(section: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = this.findVideoFile(section);
      if (!file) { resolve(); return; }
      fs.unlink(path.join(VIDEOS_DIR, file), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
```

### `guide.controller.ts`

```typescript
import { Controller, Get, Post, Delete, Param, UploadedFile, UseInterceptors, BadRequestException, NotFoundException } from '@nestjs/common';
import { FileInterceptor }  from '@nestjs/platform-express';
import { memoryStorage }    from 'multer';
import path                 from 'path';
import fs                   from 'fs/promises';
import { GuideService, VALID_SECTIONS } from './guide.service';
import { Permission }       from '../../core/decorators/permission.decorator';

const videoFileFilter = (_req: unknown, file: Express.Multer.File, cb: Function) => {
  ['video/mp4', 'video/webm', 'video/ogg'].includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Format non accepté. Utilisez MP4, WebM ou OGG.'));
};

@Controller('guide')
export class GuideController {
  constructor(private readonly svc: GuideService) {}

  @Get('videos')
  listVideos() {
    return this.svc.listVideos();
  }

  @Post('videos/:section')
  @Permission('settings:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage:    memoryStorage(),           // buffer RAM — écriture gérée dans le handler
      limits:     { fileSize: 500 * 1024 * 1024 },
      fileFilter: videoFileFilter,
    }),
  )
  async uploadVideo(
    @Param('section')         section: string,
    @UploadedFile()           file: Express.Multer.File,
  ) {
    if (!VALID_SECTIONS.has(section)) {
      throw new BadRequestException(`Section inconnue : ${section}`);
    }
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }

    const ext      = path.extname(file.originalname).toLowerCase() || '.mp4';
    const filename = `${section}${ext}`;
    const dest     = path.join(this.svc.getVideosDir(), filename);

    // Supprimer l'ancienne vidéo pour cette section (remplacement)
    await this.svc.deleteVideo(section).catch(() => {});

    // Écrire le buffer sur le disque
    await fs.writeFile(dest, file.buffer);

    return { path: `uploads/videos/${filename}`, section };
  }

  @Delete('videos/:section')
  @Permission('settings:update')
  async deleteVideo(@Param('section') section: string) {
    if (!VALID_SECTIONS.has(section)) {
      throw new BadRequestException(`Section inconnue : ${section}`);
    }
    if (!this.svc.findVideoFile(section)) {
      throw new NotFoundException('Aucune vidéo trouvée pour cette section');
    }
    await this.svc.deleteVideo(section);
    return null;  // 200 avec { success: true, data: null }
  }
}
```

### `guide.module.ts`

```typescript
import { Module }          from '@nestjs/common';
import { MulterModule }    from '@nestjs/platform-express';
import { GuideService }    from './guide.service';
import { GuideController } from './guide.controller';

@Module({
  imports:     [MulterModule],
  providers:   [GuideService],
  controllers: [GuideController],
})
export class GuideModule {}
```

> **Prérequis** : `MulterModule` a besoin du package `@nestjs/platform-express`
> (déjà présent si tu utilises Express comme platform NestJS).

---

## Mise à jour finale de AppModule

Après avoir créé tous les modules, mettre à jour `src/app.module.ts` :

```typescript
import { TaxRatesModule }       from './modules/tax-rates/tax-rates.module';
import { OfficesModule }        from './modules/offices/offices.module';
import { RolesModule }          from './modules/roles/roles.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { NotificationsModule }  from './modules/notifications/notifications.module';
import { GuideModule }          from './modules/guide/guide.module';

@Module({
  imports: [
    // Infrastructure (Phase 1)
    ConfigModule.forRoot({ isGlobal: true, validate: cfg => envSchema.parse(cfg) }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EventsModule,
    JobsModule,
    HealthModule,
    // Modules simples (Phase 2)
    TaxRatesModule,
    OfficesModule,
    RolesModule,
    EmailTemplatesModule,
    NotificationsModule,
    GuideModule,
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

## Récapitulatif des pièges par module

| Module | Piège principal | Solution |
|---|---|---|
| `tax-rates` | Aucun | Pattern de référence |
| `offices` | `code.toUpperCase()` oublié | Transform Zod dans schema |
| `roles` | Cache RBAC non invalidé | Redis pipeline dans service |
| `email-templates` | Route `/by-type/:type` après `/:id` | Ordre des méthodes dans le controller |
| `notifications` | Réponse paginée aplatie + méthode statique | `@SkipResponseWrapper()` + instance method |
| `guide` | `req.params.section` inaccessible dans diskStorage | `memoryStorage` + `fs.writeFile` dans handler |

---

## Vérification TypeScript

Après avoir écrit tous les fichiers, lancer :

```bash
cd bridge-nestjs
npx tsc --noEmit  
```

Erreurs courantes :
- `@InjectRedis()` non trouvé → vérifier que `@nestjs-modules/ioredis` est installé
  et que `RedisModule` est importé dans `RolesModule`
- `NotificationsService` non résolu dans `NotificationProcessor` → vérifier que
  `NotificationsModule` est importé dans `JobsModule` et exporté dans `NotificationsModule`
- `Express.Multer.File` non trouvé → ajouter `@types/multer` : `pnpm add -D @types/multer`
