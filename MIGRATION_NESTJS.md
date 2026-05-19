# Prompt Maître — Migration InvoiceHub v2.0 Express → NestJS

## Contexte du projet

**InvoiceHub v2.0** — Plateforme de facturation enterprise pour Bridge Technologies Solutions (BTS), Douala, Cameroun. Conforme SYSCOHADA. Monnaie : XAF (Franc CFA).

**Ce qui EXISTE déjà et doit être migré (pas réécrit) :**
- Backend Express + TypeScript + Prisma + PostgreSQL 15+
- Répertoire : `bridge-backend/`
- 32 modules métier implémentés et fonctionnels
- Schema Prisma complet (`prisma/schema.prisma`) — **ne pas toucher**
- Logique métier dans les services — **copier telle quelle**
- Frontend Next.js 15 complet dans `bridge-frontend/` — **ne pas toucher**
- Docker Compose existant — à adapter

**Ce qui NE CHANGE PAS :**
- Base de données PostgreSQL + schema Prisma → identique
- Contrat API REST (mêmes routes, mêmes réponses `{ success, data, meta }`)
- BullMQ + Redis → même configuration
- Socket.io → même événements
- Zod schemas → conservés tels quels
- Frontend → ne voit aucune différence

---

## Stack cible NestJS

```
@nestjs/core              ^10.x
@nestjs/common            ^10.x
@nestjs/platform-express  ^10.x   (NestJS reste sur Express sous le capot)
@nestjs/config            ^3.x    (remplace src/config/env.ts)
@nestjs/jwt               ^10.x   (remplace lib/jwt.ts)
@nestjs/passport          ^10.x
@nestjs/bullmq            ^10.x   (remplace jobs/queues.ts + workers.ts)
@nestjs/websockets        ^10.x   (remplace lib/socket.ts)
@nestjs/platform-socket.io ^10.x
@nestjs/swagger           ^7.x    (documentation API auto)
passport                  ^0.7
passport-jwt              ^4.x
prisma                    ^5.22   (inchangé)
@prisma/client            ^5.22   (inchangé)
zod                       ^3.23   (inchangé — pipe de validation custom)
bullmq                    ^5.4    (inchangé)
ioredis                   ^5.3    (inchangé)
socket.io                 ^4.8    (inchangé)
nodemailer                ^6.9    (inchangé)
bcryptjs                  ^2.4    (inchangé)
jsonwebtoken              ^9.0    (inchangé)
otplib                    ^12.0   (inchangé)
puppeteer                 ^23.0   (inchangé)
pino                      ^9.x    (remplace winston — structured logging)
pino-http                 ^10.x
helmet                    ^8.x    (inchangé)
multer                    ^1.4    (inchangé)
```

---

## Structure de répertoires cible

```
bridge-backend/
├── prisma/                          ← INCHANGÉ
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── main.ts                      ← point d'entrée NestJS (remplace server.ts)
│   ├── app.module.ts                ← module racine
│   │
│   ├── config/                      ← configuration globale
│   │   ├── env.validation.ts        ← validation Zod des variables d'env
│   │   └── configuration.ts         ← ConfigModule factory
│   │
│   ├── prisma/                      ← PrismaService global
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   │
│   ├── common/                      ← éléments partagés
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── permission.decorator.ts
│   │   │   └── public.decorator.ts
│   │   ├── dto/
│   │   │   └── pagination.dto.ts
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts   ← remplace errorHandler middleware
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts          ← remplace authenticate middleware
│   │   │   └── rbac.guard.ts              ← remplace authorizePermission middleware
│   │   ├── interceptors/
│   │   │   ├── audit.interceptor.ts       ← remplace auditMiddleware
│   │   │   └── response.interceptor.ts   ← wrap auto { success: true, data }
│   │   ├── pipes/
│   │   │   └── zod-validation.pipe.ts    ← pipe Zod custom
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   │
│   ├── lib/                         ← utilitaires (copiés de Express)
│   │   ├── bcrypt.ts                ← COPIE
│   │   ├── document-number.ts       ← COPIE
│   │   ├── document-math.ts         ← COPIE
│   │   ├── mailer.ts                ← COPIE
│   │   ├── pdf.ts                   ← COPIE
│   │   ├── totp.ts                  ← COPIE
│   │   ├── sanitize.ts              ← COPIE
│   │   └── csv.ts                   ← COPIE
│   │
│   ├── jobs/                        ← BullMQ (adapté @nestjs/bullmq)
│   │   ├── jobs.module.ts
│   │   ├── processors/
│   │   │   ├── email.processor.ts         ← COPIE logique
│   │   │   ├── notification.processor.ts  ← COPIE logique
│   │   │   ├── backup.processor.ts        ← COPIE logique
│   │   │   ├── recurring.processor.ts     ← COPIE logique
│   │   │   ├── reminder.processor.ts      ← COPIE logique
│   │   │   └── approval.processor.ts      ← COPIE logique
│   │   └── schedulers/
│   │       └── cron.scheduler.ts          ← @Cron() NestJS
│   │
│   ├── gateway/                     ← Socket.io gateway
│   │   └── events.gateway.ts        ← remplace lib/socket.ts
│   │
│   └── modules/                     ← 32 modules métier
│       ├── auth/
│       ├── users/
│       ├── roles/
│       ├── clients/
│       ├── products/
│       ├── invoices/
│       ├── proformas/
│       ├── payments/
│       ├── recurring/
│       ├── approvals/
│       ├── bank/
│       ├── accounting/
│       ├── suppliers/
│       ├── supplier-invoices/
│       ├── purchase-orders/
│       ├── expenses/
│       ├── stock/
│       ├── dashboard/
│       ├── reports/
│       ├── search/
│       ├── audit/
│       ├── backups/
│       ├── notifications/
│       ├── email-templates/
│       ├── settings/
│       ├── settings-advanced/
│       ├── offices/
│       ├── tax-rates/
│       ├── guide/
│       ├── ai/
│       └── health/
│
├── test/                            ← tests e2e NestJS
├── .env.example                     ← INCHANGÉ
├── docker-compose.yml               ← adapter service backend
├── nest-cli.json
├── tsconfig.json                    ← remplacer
└── package.json                     ← remplacer
```

---

## Patterns NestJS à appliquer systématiquement

### Pattern Module
```typescript
// modules/invoices/invoices.module.ts
@Module({
  imports:     [PrismaModule, BullModule.registerQueue({ name: 'notification' })],
  controllers: [InvoicesController],
  providers:   [InvoicesService],
  exports:     [InvoicesService],   // si utilisé par d'autres modules
})
export class InvoicesModule {}
```

### Pattern Controller
```typescript
// modules/invoices/invoices.controller.ts
@ApiTags('Factures')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  @Permission('invoices:read')
  list(@Query() query: ListInvoicesDto, @CurrentUser() user: JwtPayload) {
    return this.svc.list(query);
  }

  @Post()
  @Permission('invoices:create')
  @UseInterceptors(AuditInterceptor('invoice', 'CREATE'))
  @HttpCode(201)
  create(@Body() body: CreateInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(body, user.id);
  }
}
```

### Pattern Service
```typescript
// modules/invoices/invoices.service.ts
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma:  PrismaService,
    @InjectQueue('notification') private notifQueue: Queue,
    @InjectQueue('email')        private emailQueue: Queue,
  ) {}

  async list(params: ListInvoicesDto) {
    // COPIER la logique depuis l'ancien invoices.service.ts
  }
}
```

### Pattern DTO (garder Zod)
```typescript
// modules/invoices/dto/create-invoice.dto.ts
import { createZodDto } from 'nestjs-zod';   // ou pipe custom
import { createInvoiceSchema } from '../invoices.schema';

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
```

### Pattern Guard JWT
```typescript
// common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get('isPublic', context.getHandler());
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

### Pattern Guard RBAC
```typescript
// common/guards/rbac.guard.ts
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>('permission', context.getHandler());
    if (!permission) return true;
    const user = context.switchToHttp().getRequest().user;
    // COPIER logique depuis src/core/middleware/rbac.ts
    return this.checkPermission(user.roleId, permission);
  }
}
```

### Pattern Exception Filter
```typescript
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx  = host.switchToHttp();
    const res  = ctx.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : (exception as any)?.statusCode ?? 500;
    const message = (exception as any)?.message ?? 'Erreur interne';
    res.status(status).json({ success: false, error: message });
  }
}
```

### Pattern Response Interceptor
```typescript
// common/interceptors/response.interceptor.ts
// Wrap automatiquement toutes les réponses en { success: true, data: ... }
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map(data => ({ success: true, data }))
    );
  }
}
```

### Pattern PrismaService
```typescript
// prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

### Pattern BullMQ Processor
```typescript
// jobs/processors/email.processor.ts
@Processor('email')
export class EmailProcessor {
  @Process()
  async handle(job: Job<EmailJobData>) {
    // COPIER logique depuis jobs/processors/email.processor.ts
  }
}
```

### Pattern Socket.io Gateway
```typescript
// gateway/events.gateway.ts
@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
```

---

## Décisions techniques importantes

### 1. Validation — garder Zod
Ne PAS migrer vers class-validator. Tous les schemas Zod sont déjà écrits.
Utiliser `nestjs-zod` ou un `ZodValidationPipe` custom :
```typescript
// common/pipes/zod-validation.pipe.ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}
  transform(value: unknown) {
    return this.schema.parse(value);
  }
}
```

### 2. Format de réponse — ResponseInterceptor global
Toutes les réponses actuelles retournent `{ success: true, data }`.
Appliquer `ResponseInterceptor` globalement dans `main.ts` pour ne pas le répéter dans chaque controller.

### 3. Auth — JWT Strategy + Guard global
Appliquer `JwtAuthGuard` globalement dans `app.module.ts`.
Utiliser `@Public()` decorator pour les routes sans auth (`/auth/login`, `/health`).

### 4. Audit — Intercepteur avec décorateur
```typescript
@UseInterceptors(new AuditInterceptor('invoice', 'CREATE'))
// remplace : auditMiddleware('invoice', 'CREATE')
```

### 5. Pagination — DTO commun
```typescript
// common/dto/pagination.dto.ts
export class PaginationDto {
  @Transform(({ value }) => Math.max(1, parseInt(value ?? '1')))
  page: number = 1;

  @Transform(({ value }) => Math.min(100, Math.max(1, parseInt(value ?? '20'))))
  limit: number = 20;
}
```

### 6. Upload fichiers — Multer intercepteur NestJS
```typescript
@Post('import/detect')
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5_000_000 } }))
detectFormat(@UploadedFile() file: Express.Multer.File, @Body() body: DetectFormatDto) { ... }
```

### 7. Swagger — auto-généré
```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('InvoiceHub API')
  .setVersion('2.0')
  .addBearerAuth()
  .build();
SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
```

---

## Plan de migration — 7 phases

### Phase 1 — Infrastructure (Priorité absolue, débloquer tout le reste)
**Tâches :**
1. Initialiser projet NestJS avec pnpm (`nest new bridge-backend-v2`)
2. Configurer `tsconfig.json` (strict, paths, decoratorMetadata)
3. Installer toutes les dépendances listées ci-dessus
4. Créer `PrismaModule` + `PrismaService` (copier schema existant)
5. Créer `ConfigModule` avec validation Zod des env vars
6. Créer `JwtStrategy` + `JwtAuthGuard`
7. Créer `RbacGuard` + `@Permission()` decorator (copier logique rbac.ts)
8. Créer `AuditInterceptor` (copier logique audit.ts)
9. Créer `AllExceptionsFilter` (copier logique errorHandler.ts)
10. Créer `ResponseInterceptor` (wrap { success, data })
11. Créer `ZodValidationPipe`
12. Créer `@CurrentUser()` decorator
13. Créer `@Public()` decorator
14. Configurer `main.ts` (Helmet, CORS, global pipes/filters/interceptors, Swagger)
15. Créer `EventsGateway` Socket.io (copier lib/socket.ts)
16. Créer `JobsModule` BullMQ avec tous les processors (copier logique)
17. Copier tous les fichiers `src/lib/` tels quels

**Critère de succès :** `pnpm start:dev` démarre sans erreur, `/health` répond 200.

---

### Phase 2 — Modules utilitaires simples
**Modules :** `health`, `tax-rates`, `offices`, `roles`, `email-templates`, `notifications`, `guide`

**Tâches pour chaque module :**
1. Créer `xxx.module.ts`
2. Créer `xxx.service.ts` @Injectable — copier logique service existant
3. Créer `xxx.controller.ts` @Controller — copier logique controller existant
4. Créer DTOs depuis schemas Zod existants
5. Enregistrer dans `AppModule`

**Critère de succès :** toutes les routes de ces modules répondent identiquement à la v1.

---

### Phase 3 — Auth & Users
**Modules :** `auth`, `users`

**Tâches :**
1. `AuthModule` — login, refresh, logout, 2FA (TOTP + backup codes), reset password, sessions
2. `UsersModule` — CRUD users, avatar, password change
3. Routes `/auth/*` marquées `@Public()`
4. Copier toute la logique depuis `auth.service.ts` (580 lignes) et `users.service.ts`

**Critère de succès :** login retourne access + refresh token, 2FA fonctionne.

---

### Phase 4 — Modules métier core
**Modules :** `clients`, `products`, `proformas`, `invoices`, `payments`, `recurring`, `approvals`

**Tâches pour chaque module :**
1. Module + Service @Injectable (copier logique)
2. Controller avec guards + permissions
3. DTOs Zod
4. Enqueue BullMQ via `@InjectQueue()`
5. Tester les routes critiques (lifecycle complet)

**Points d'attention :**
- `invoices` : logique avoir auto, acompte/solde, numérotation SYSCOHADA
- `proformas` : conversion → invoice
- `payments` : mise à jour solde facture
- `approvals` : workflow multi-étapes avec notifications

**Critère de succès :** cycle complet proforma → facture → paiement fonctionne.

---

### Phase 5 — Module Bank
**Module :** `bank`

**Tâches :**
1. `BankModule` avec tous les sous-fichiers :
   - `bank.service.ts` → `BankService` @Injectable
   - `bank.matching.ts` → copie directe (fonctions pures, pas de DI)
   - `bank.parsers.ts` → copie directe
   - `bank.profiles.ts` → copie directe
2. Controller avec upload Multer (FileInterceptor)
3. Permissions granulaires : `bank:read`, `bank:manage`, `bank:reconcile`, `bank:import-parse`, `bank:import-confirm`, `bank:auto-match`, `bank:rules`
4. `BankImportQueue` processor via `@nestjs/bullmq`

**Critère de succès :** import CSV, rapprochement, auto-match fonctionnent.

---

### Phase 6 — Modules avancés
**Modules :** `accounting`, `suppliers`, `supplier-invoices`, `purchase-orders`, `expenses`, `stock`

**Tâches :**
- Même pattern que Phase 4
- `accounting` : extourne SYSCOHADA, export PDF balance

**Critère de succès :** toutes les routes répondent.

---

### Phase 7 — Modules transversaux
**Modules :** `dashboard`, `reports`, `search`, `audit`, `backups`, `settings`, `settings-advanced`, `ai`

**Tâches :**
- `dashboard` : cache Redis via `@nestjs/cache-manager` ou `ioredis` direct
- `reports` : PDF generation avec Puppeteer
- `search` : parser langage naturel (copier search.parser.ts)
- `backups` : S3/Azure/GCS (copier storage.ts)
- `ai` : Ollama integration (copier ai.service.ts)

**Critère de succès :** dashboard KPIs avec cache Redis, export PDF rapport.

---

## Règles à respecter pendant la migration

1. **Ne jamais modifier `prisma/schema.prisma`** — la DB ne change pas
2. **Copier la logique métier des services, ne pas la réécrire** — elle est déjà testée
3. **Garder le même contrat API** — même routes, même format de réponse
4. **Un module à la fois** — tester avant de passer au suivant
5. **Zod schemas** — copier tels quels depuis les anciens fichiers `*.schema.ts`
6. **Pas de `any`** — si l'ancien code en a, typer correctement
7. **PrismaService injecté** — jamais `import { prisma } from '../../config/database'` directement dans un service

---

## Variables d'environnement (inchangées)

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FRONTEND_URL=
NODE_ENV=
PORT=3000
```

---

## Références fichiers source (Express → NestJS)

| Fichier Express source | Destination NestJS |
|------------------------|-------------------|
| `src/server.ts` | `src/main.ts` |
| `src/app.ts` | `src/app.module.ts` |
| `src/config/env.ts` | `src/config/env.validation.ts` |
| `src/config/database.ts` | `src/prisma/prisma.service.ts` |
| `src/core/middleware/auth.ts` | `src/common/strategies/jwt.strategy.ts` + `guards/jwt-auth.guard.ts` |
| `src/core/middleware/rbac.ts` | `src/common/guards/rbac.guard.ts` |
| `src/core/middleware/audit.ts` | `src/common/interceptors/audit.interceptor.ts` |
| `src/core/middleware/errorHandler.ts` | `src/common/filters/all-exceptions.filter.ts` |
| `src/lib/socket.ts` | `src/gateway/events.gateway.ts` |
| `src/jobs/queues.ts` + `workers.ts` + `scheduler.ts` | `src/jobs/jobs.module.ts` |
| `src/jobs/processors/*.ts` | `src/jobs/processors/*.ts` (logique copiée) |
| `src/modules/xxx/xxx.routes.ts` | supprimé — remplacé par decorators @Controller |
| `src/modules/xxx/xxx.controller.ts` | `src/modules/xxx/xxx.controller.ts` (adapté) |
| `src/modules/xxx/xxx.service.ts` | `src/modules/xxx/xxx.service.ts` (@Injectable) |
| `src/modules/xxx/xxx.schema.ts` | `src/modules/xxx/xxx.schema.ts` (copie) + DTOs |

---

## Commandes de démarrage du projet NestJS

```bash
# Initialisation
nest new bridge-backend --package-manager pnpm
cd bridge-backend

# Dépendances NestJS
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/bullmq @nestjs/websockets @nestjs/platform-socket.io @nestjs/swagger passport passport-jwt

# Dépendances métier (copier depuis l'ancien package.json)
pnpm add @prisma/client prisma zod bullmq ioredis socket.io nodemailer bcryptjs jsonwebtoken otplib puppeteer pino pino-http helmet multer date-fns iconv-lite

# Dev
pnpm add -D @types/passport-jwt @types/multer @types/nodemailer @types/bcryptjs pino-pretty

# ORM
npx prisma generate   # depuis le schema.prisma existant copié
```
