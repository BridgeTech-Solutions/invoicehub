# PHASE 1 — Infrastructure NestJS (Bootstrap complet)

## Contexte

Tu migres le backend **InvoiceHub v2.0** de Express vers NestJS.
C'est la **Phase 1 sur 7** — la plus critique. Tout le reste dépend de ce qui est construit ici.
L'objectif est d'avoir un serveur NestJS qui démarre, avec toute l'infrastructure transversale prête
(auth, RBAC, audit, erreurs, queues, socket) — **sans aucun module métier** pour l'instant.

**Projet** : Plateforme de facturation enterprise SYSCOHADA pour Bridge Technologies Solutions (BTS), Douala, Cameroun.
**Monnaie** : XAF. **DB** : PostgreSQL 15+ avec Prisma. **Auth** : JWT (access 15m + refresh 7d) + 2FA TOTP.

---

## Ce qui existe déjà (Express — à NE PAS toucher)

Le backend Express fonctionnel est dans `bridge-backend/`.
**Ne pas modifier les fichiers Express existants.**
Créer un nouveau dossier `bridge-backend-nest/` à côté.

Le schema Prisma (`bridge-backend/prisma/schema.prisma`) et les seeds sont **identiques** — tu les copies.

---

## Tâches à réaliser dans l'ordre

### TÂCHE 1 — Initialiser le projet NestJS

```bash
cd D:/Bel/projets/BRIDGE
nest new bridge-backend-nest --package-manager pnpm --strict
cd bridge-backend-nest
```

Supprimer les fichiers de démarrage inutiles générés par NestJS :
- `src/app.controller.ts`
- `src/app.controller.spec.ts`
- `src/app.service.ts`

Garder uniquement :
- `src/app.module.ts` (à vider et reconstruire)
- `src/main.ts` (à réécrire)

---

### TÂCHE 2 — Installer toutes les dépendances

```bash
# NestJS core
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/bullmq @nestjs/websockets @nestjs/platform-socket.io @nestjs/swagger @nestjs/schedule

# Auth
pnpm add passport passport-jwt

# Métier (inchangés vs Express)
pnpm add @prisma/client prisma zod bullmq ioredis socket.io @socket.io/redis-adapter nodemailer bcryptjs jsonwebtoken otplib puppeteer pino pino-http helmet multer date-fns iconv-lite uuid qrcode pdf-lib iconv-lite

# Cloud storage (backups)
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @azure/storage-blob @google-cloud/storage

# Dev
pnpm add -D @types/passport-jwt @types/multer @types/nodemailer @types/bcryptjs @types/jsonwebtoken @types/qrcode @types/uuid @types/supertest supertest pino-pretty prisma

# Générer le client Prisma
cp ../bridge-backend/prisma/schema.prisma ./prisma/schema.prisma
cp ../bridge-backend/prisma/seed.ts ./prisma/seed.ts
npx prisma generate
```

---

### TÂCHE 3 — Configurer `tsconfig.json`

Remplacer le `tsconfig.json` généré par :

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "paths": {
      "@common/*": ["src/common/*"],
      "@lib/*": ["src/lib/*"],
      "@prisma-service": ["src/prisma/prisma.service"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

---

### TÂCHE 4 — Créer le `ConfigModule` avec validation Zod

**Fichier : `src/config/env.validation.ts`**

Copier exactement ce schema Zod depuis l'app Express (il valide toutes les variables d'env) :

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@bts.cm'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),
  BACKEND_URL: z.string().url(),
  TOTP_ISSUER: z.string().default('InvoiceHub BTS'),

  BACKUP_STORAGE_DISK: z.enum(['local', 's3', 'google', 'azure', 'onedrive']).default('local'),
  BACKUP_DIR: z.string().default('./uploads/backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  BACKUP_CRON: z.string().default('30 15 * * *'),
  BACKUP_INCLUDE_FILES: z.string().transform(v => v === 'true').default('false'),
  UPLOADS_DIR: z.string().default('./uploads'),
  PGDUMP_PATH: z.string().default('pg_dump'),
  PGDUMP_DOCKER_CONTAINER: z.string().optional(),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  GCS_BUCKET: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional(),

  ONEDRIVE_TENANT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().optional(),
  ONEDRIVE_DRIVE_ID: z.string().optional(),
  ONEDRIVE_FOLDER_PATH: z.string().default('InvoiceHub/Backups'),

  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('phi3:mini'),
  OLLAMA_ENABLED: z.string().transform(v => v === 'true').default('false'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Variables d\'environnement invalides :');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
```

---

### TÂCHE 5 — Créer `PrismaModule` et `PrismaService`

**Fichier : `src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**Fichier : `src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()   // Disponible partout sans l'importer dans chaque module
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
```

---

### TÂCHE 6 — Créer les types partagés

**Fichier : `src/common/types/jwt-payload.type.ts`**

```typescript
export interface JwtPayload {
  sub:         string;   // userId
  email:       string;
  roleId:      string;
  roleName:    string;
  permissions: string[];
  firstName:   string;
  lastName:    string;
}
```

**Fichier : `src/common/types/express.d.ts`** (augmentation de type pour req.user)

```typescript
import { JwtPayload } from './jwt-payload.type';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
```

---

### TÂCHE 7 — Créer la `JwtStrategy` et `JwtAuthGuard`

La logique de chargement RBAC depuis Redis existe dans l'Express actuel (`src/core/middleware/auth.ts`).
**La copier intégralement** dans la strategy.

**Fichier : `src/common/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '../decorators/inject-redis.decorator';
import type { Redis } from 'ioredis';
import type { JwtPayload } from '../types/jwt-payload.type';

const RBAC_TTL = 300;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: { sub: string }): Promise<JwtPayload> {
    const cacheKey = `rbac:user:${payload.sub}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as JwtPayload;

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'active' },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        roleId: true,
        role: { select: { name: true, permissions: true } },
      },
    });

    if (!user || !user.role) {
      throw new UnauthorizedException('Compte introuvable ou suspendu');
    }

    const data: JwtPayload = {
      sub:         user.id,
      email:       user.email,
      firstName:   user.firstName,
      lastName:    user.lastName,
      roleId:      user.roleId,
      roleName:    user.role.name,
      permissions: user.role.permissions,
    };

    await this.redis.setex(cacheKey, RBAC_TTL, JSON.stringify(data));
    return data;
  }
}
```

**Fichier : `src/common/guards/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

---

### TÂCHE 8 — Créer le `RbacGuard`

Logique copiée depuis `src/core/middleware/rbac.ts` de l'app Express.
Supporte : `*` (admin total), `module:*` (wildcard module), `module:action` (granulaire).

**Fichier : `src/common/guards/rbac.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

function hasPermission(userPerms: string[], required: string[]): boolean {
  if (userPerms.includes('*')) return true;
  return required.some(perm => {
    if (userPerms.includes(perm)) return true;
    const [module] = perm.split(':');
    return userPerms.includes(`${module}:*`);
  });
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permissions || permissions.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException('Non authentifié');

    if (hasPermission(user.permissions, permissions)) return true;

    throw new ForbiddenException(
      `Permission requise : ${permissions.join(' ou ')}. Votre rôle (${user.roleName}) ne l'inclut pas.`,
    );
  }
}
```

---

### TÂCHE 9 — Créer les décorateurs communs

**Fichier : `src/common/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**Fichier : `src/common/decorators/permission.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'permissions';
export const Permission = (...permissions: string[]) => SetMetadata(PERMISSION_KEY, permissions);
```

**Fichier : `src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest().user as JwtPayload;
  },
);
```

**Fichier : `src/common/decorators/audit.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '@prisma/client';
export const AUDIT_KEY = 'audit';
export const Audit = (entity: string, action: AuditAction) =>
  SetMetadata(AUDIT_KEY, { entity, action });
```

---

### TÂCHE 10 — Créer le `RedisModule` (provider injectable)

**Fichier : `src/common/decorators/inject-redis.decorator.ts`**

```typescript
import { Inject } from '@nestjs/common';
export const REDIS_CLIENT = 'REDIS_CLIENT';
export const InjectRedis = () => Inject(REDIS_CLIENT);
```

**Fichier : `src/redis/redis.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { REDIS_CLIENT } from '../common/decorators/inject-redis.decorator';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
```

---

### TÂCHE 11 — Créer l'`AllExceptionsFilter`

Traite dans l'ordre : ZodError → AppError → Prisma P2002/P2025/P2003 → erreur inconnue.
Logique copiée depuis `src/core/middleware/errorHandler.ts` de l'app Express.

**Fichier : `src/common/filters/all-exceptions.filter.ts`**

```typescript
import {
  ArgumentsHost, Catch, ExceptionFilter,
  HttpException, HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    // 1. Zod
    if (exception instanceof ZodError) {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        errors: exception.flatten().fieldErrors,
      });
    }

    // 2. AppError (erreur métier)
    if (exception instanceof AppError) {
      return res.status(exception.statusCode).json({
        success: false, code: exception.code, message: exception.message,
      });
    }

    // 3. NestJS HttpException
    if (exception instanceof HttpException) {
      const status   = exception.getStatus();
      const response = exception.getResponse();
      const message  = typeof response === 'object' && 'message' in (response as object)
        ? (response as { message: string }).message
        : exception.message;
      return res.status(status).json({ success: false, code: 'HTTP_ERROR', message });
    }

    // 4. Prisma
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(409).json({ success: false, code: 'DUPLICATE_KEY', message: 'Cette ressource existe déjà' });
      }
      if (exception.code === 'P2025') {
        return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Ressource introuvable' });
      }
      if (exception.code === 'P2003') {
        return res.status(409).json({ success: false, code: 'FOREIGN_KEY_VIOLATION', message: 'Référence vers une ressource inexistante' });
      }
    }

    // 5. Erreur inconnue
    const err = exception as Error;
    if (process.env.NODE_ENV !== 'test') {
      console.error('[UnhandledError]', { path: req.path, method: req.method, error: err?.message, stack: err?.stack });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false, code: 'INTERNAL_ERROR',
      message: isProd ? 'Erreur interne du serveur' : (err?.message ?? 'Unknown error'),
    });
  }
}
```

**Fichier : `src/common/errors/app-error.ts`** (copie exacte de l'Express)

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg: string, code = 'BAD_REQUEST')       { return new AppError(msg, 400, code); }
  static unauthorized(msg = 'Non autorisé', code = 'UNAUTHORIZED') { return new AppError(msg, 401, code); }
  static forbidden(msg = 'Accès refusé', code = 'FORBIDDEN') { return new AppError(msg, 403, code); }
  static notFound(msg = 'Ressource introuvable', code = 'NOT_FOUND') { return new AppError(msg, 404, code); }
  static conflict(msg: string, code = 'CONFLICT')            { return new AppError(msg, 409, code); }
  static unprocessable(msg: string, code = 'UNPROCESSABLE')  { return new AppError(msg, 422, code); }
  static serviceUnavailable(msg: string, code = 'SERVICE_UNAVAILABLE') { return new AppError(msg, 503, code); }
  static internal(msg: string, code = 'INTERNAL_ERROR')      { return new AppError(msg, 500, code); }
}
```

---

### TÂCHE 12 — Créer le `ResponseInterceptor`

Wrappe automatiquement toutes les réponses en `{ success: true, data: ... }`.
Les réponses de streaming (PDF, fichiers) doivent bypasser cet intercepteur via `@SkipResponseWrapper()`.

**Fichier : `src/common/interceptors/response.interceptor.ts`**

```typescript
import {
  CallHandler, ExecutionContext, Injectable,
  NestInterceptor, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const SKIP_RESPONSE_WRAPPER = 'skipResponseWrapper';
export const SkipResponseWrapper = () => SetMetadata(SKIP_RESPONSE_WRAPPER, true);

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAPPER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      map(data => {
        // Si le handler retourne déjà { success, data } ne pas double-wrapper
        if (data && typeof data === 'object' && 'success' in data) return data;
        return { success: true, data };
      }),
    );
  }
}
```

---

### TÂCHE 13 — Créer le `AuditInterceptor`

Logique copiée depuis `src/core/middleware/audit.ts` de l'app Express.
S'utilise avec le décorateur `@Audit('entity', 'CREATE')`.

**Fichier : `src/common/interceptors/audit.interceptor.ts`**

```typescript
import {
  CallHandler, ExecutionContext, Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY } from '../decorators/audit.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const audit = this.reflector.get<{ entity: string; action: AuditAction }>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!audit) return next.handle();

    const req      = context.switchToHttp().getRequest();
    const user     = req.user as JwtPayload | undefined;
    const recordId = (req.params?.id as string | undefined) ?? null;
    const body     = req.body;

    return next.handle().pipe(
      tap(() => {
        // Créé après la réponse réussie — asynchrone, ne bloque pas
        this.prisma.auditLog.create({
          data: {
            userId:    user?.sub     ?? null,
            userEmail: user?.email   ?? null,
            userRole:  user?.roleName ?? null,
            action:    audit.action,
            entityType: audit.entity,
            entityId:   recordId,
            newState:   (body && Object.keys(body).length > 0 ? body : undefined) as Prisma.InputJsonValue | undefined,
            ipAddress:  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null,
            userAgent:  req.get('user-agent') ?? null,
          },
        }).catch((err: Error) => {
          console.warn('[AuditInterceptor] Audit log failed:', err.message);
        });
      }),
    );
  }
}
```

---

### TÂCHE 14 — Créer le `ZodValidationPipe`

**Fichier : `src/common/pipes/zod-validation.pipe.ts`**

```typescript
import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Données invalides',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
```

---

### TÂCHE 15 — Créer le `PaginationDto`

**Fichier : `src/common/dto/pagination.dto.ts`**

```typescript
import { Transform } from 'class-transformer';

export class PaginationDto {
  @Transform(({ value }) => Math.max(1, parseInt(String(value ?? '1'))))
  page: number = 1;

  @Transform(({ value }) => Math.min(100, Math.max(1, parseInt(String(value ?? '20')))))
  limit: number = 20;
}
```

---

### TÂCHE 16 — Créer le `EventsGateway` (Socket.io)

Logique copiée depuis `src/lib/socket.ts` de l'app Express.
Auth JWT dans le handshake + rooms `user:{userId}` + adapter Redis.

**Fichier : `src/gateway/events.gateway.ts`**

```typescript
import {
  ConnectedSocket, MessageBody,
  OnGatewayConnection, OnGatewayDisconnect,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config:     ConfigService,
  ) {}

  afterInit(server: Server) {
    const redisUrl  = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const pubClient = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    server.adapter(createAdapter(pubClient, subClient));

    // Middleware d'auth JWT sur le handshake
    server.use((socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error('Token manquant'));
        const payload = this.jwtService.verify<{ sub: string }>(token, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        socket.data.userId = payload.sub;
        next();
      } catch {
        next(new Error('Token invalide'));
      }
    });
  }

  handleConnection(socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) socket.join(`user:${userId}`);
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) socket.leave(`user:${userId}`);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToAll(event: string, data: unknown) {
    this.server.emit(event, data);
  }
}
```

**Fichier : `src/gateway/gateway.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [EventsGateway],
  exports:   [EventsGateway],
})
export class GatewayModule {}
```

---

### TÂCHE 17 — Créer le `JobsModule` (BullMQ)

9 queues à déclarer avec les mêmes noms et options que l'app Express.

**Types des jobs** — Fichier : `src/jobs/job-types.ts`

Copier exactement les interfaces depuis `src/jobs/queues.ts` de l'app Express :
`EmailJobData`, `NotificationJobData`, `OverdueJobData`, `RecurringJobData`,
`ReminderJobData`, `BackupJobData`, `CleanupJobData`, `ExportJobData`,
`BankImportJobData`, `ApprovalJobData`.

**Fichier : `src/jobs/jobs.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

const QUEUES = [
  { name: 'email',       attempts: 3, delay: 5_000,       backoff: 'exponential' },
  { name: 'notification',attempts: 2, delay: 2_000,       backoff: 'fixed'       },
  { name: 'overdue',     attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'recurring',   attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'reminder',    attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'backup',      attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'cleanup',     attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'export',      attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'bank-import', attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'approval',    attempts: 3, delay: 5_000,        backoff: 'exponential' },
];

@Module({
  imports: [
    BullModule.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
      }),
    }),
    ...QUEUES.map(q =>
      BullModule.registerQueue({
        name: q.name,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail:     { count: 500 },
          ...(q.attempts > 1 ? {
            attempts: q.attempts,
            backoff: { type: q.backoff as 'exponential' | 'fixed', delay: q.delay },
          } : {}),
        },
      }),
    ),
  ],
  exports: [BullModule],
})
export class JobsModule {}
```

**Processeurs** — Fichier : `src/jobs/processors/*.processor.ts`

Copier la logique de chaque processor depuis `bridge-backend/src/jobs/processors/` :
- `email.processor.ts`
- `notification.processor.ts`
- `backup.processor.ts`
- `recurring.processor.ts`
- `reminder.processor.ts`
- `overdue.processor.ts`
- `approval.processor.ts`

Adapter le décorateur de classe :
```typescript
// Avant (Express worker)
const worker = new Worker('email', processEmailJob, { connection });

// Après (NestJS)
@Processor('email')
export class EmailProcessor {
  @Process()
  async handle(job: Job<EmailJobData>) {
    // copier la logique de processEmailJob ici
  }
}
```

**Scheduler Cron** — Fichier : `src/jobs/schedulers/cron.scheduler.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CronScheduler {
  constructor(
    @InjectQueue('overdue')   private overdueQueue:   Queue,
    @InjectQueue('recurring') private recurringQueue: Queue,
    @InjectQueue('reminder')  private reminderQueue:  Queue,
    @InjectQueue('backup')    private backupQueue:    Queue,
    @InjectQueue('cleanup')   private cleanupQueue:   Queue,
    @InjectQueue('approval')  private approvalQueue:  Queue,
  ) {}

  @Cron('45 7 * * *', { timeZone: 'UTC' })   // 08:45 WAT
  async runOverdue() {
    await this.overdueQueue.add('overdue', { triggeredAt: new Date().toISOString() });
  }

  @Cron('50 7 * * *', { timeZone: 'UTC' })   // 08:50 WAT
  async runRecurring() {
    await this.recurringQueue.add('recurring', { triggeredAt: new Date().toISOString() });
  }

  @Cron('0 8 * * *', { timeZone: 'UTC' })    // 09:00 WAT
  async runReminders() {
    await this.reminderQueue.add('reminder', { triggeredAt: new Date().toISOString() });
  }

  @Cron('30 16 * * *', { timeZone: 'UTC' })  // backup 16:30 UTC
  async runBackup() {
    await this.backupQueue.add('backup', { backupId: '' });
  }

  @Cron('0 15 * * 5', { timeZone: 'UTC' })   // cleanup vendredi 15:00 UTC
  async runCleanup() {
    await this.cleanupQueue.add('cleanup', { triggeredAt: new Date().toISOString() });
  }

  @Cron('0 * * * *')                         // approval check toutes les heures
  async runApprovalCheck() {
    await this.approvalQueue.add('check-expired', { type: 'check-expired' });
  }
}
```

---

### TÂCHE 18 — Copier les fichiers `lib/`

Copier **tels quels** depuis `bridge-backend/src/lib/` vers `bridge-backend-nest/src/lib/` :

```bash
cp bridge-backend/src/lib/bcrypt.ts      bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/jwt.ts         bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/totp.ts        bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/mailer.ts      bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/pdf.ts         bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/documentNumber.ts bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/document-math.ts  bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/sanitize.ts    bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/csv.ts         bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/broadcast.ts   bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/eventBus.ts    bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/ollama.ts      bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/rbacCache.ts   bridge-backend-nest/src/lib/
cp bridge-backend/src/lib/accountingEngine.ts bridge-backend-nest/src/lib/
```

**Attention** : Dans `mailer.ts`, l'import `import { prisma } from '../config/database'` doit
être remplacé par une injection via `PrismaService`. Adapter le fichier pour accepter
`PrismaService` en paramètre ou utiliser un provider global.

---

### TÂCHE 19 — Créer le `AuthModule` minimal (pour JWT)

Ce module sera complété en Phase 3 avec la logique complète.
Ici on déclare juste le JWT pour que `JwtStrategy` fonctionne.

**Fichier : `src/common/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:      config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, RbacGuard, AuditInterceptor],
  exports:   [JwtModule, JwtAuthGuard, RbacGuard, AuditInterceptor],
})
export class CommonAuthModule {}
```

---

### TÂCHE 20 — Créer `AppModule` racine

**Fichier : `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CommonAuthModule } from './common/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    CommonAuthModule,
    GatewayModule,
    JobsModule,

    // Module santé — seul module métier de la Phase 1
    HealthModule,

    // Les autres modules seront ajoutés phase par phase
  ],
})
export class AppModule {}
```

---

### TÂCHE 21 — Créer `main.ts`

Reproduire exactement la configuration de `src/app.ts` de l'app Express :
- Helmet (sans HSTS, sans upgrade-insecure-requests)
- CORS avec liste d'origines depuis env
- Rate limiting global (300 req/15min)
- Rate limiting strict auth (`/auth/login` 10/15min, `/auth/forgot-password` 5/h, `/auth/refresh` 50/15min)
- Static files : `/uploads/avatars`, `/uploads/company`
- Trust proxy : 1 (derrière Nginx)
- Body parser JSON 10mb
- Swagger sur `/api/docs`
- Graceful shutdown

**Fichier : `src/main.ts`**

```typescript
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Trust proxy (derrière Nginx) ─────────────────────────────────
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);

  // ── Préfixe global des routes ─────────────────────────────────────
  const apiPrefix = process.env.API_PREFIX ?? '/api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/health', '/uploads/(.*)'],
  });

  // ── Sécurité ──────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null,
      },
    },
    strictTransportSecurity: false,
  }));

  // ── CORS ──────────────────────────────────────────────────────────
  const normalize = (url: string) => url.replace(/\/$/, '').toLowerCase();
  const appUrl    = process.env.APP_URL ?? '';
  const extra     = process.env.CORS_ORIGINS?.split(',').map(normalize).filter(Boolean) ?? [];
  const allowed   = [normalize(appUrl), ...extra];

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.includes(normalize(origin))) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  // ── Rate limiting ─────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 300,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
  });
  app.use(globalLimiter);

  app.use(`${apiPrefix}/auth/login`, rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de connexion.' },
  }));
  app.use(`${apiPrefix}/auth/forgot-password`, rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de demandes de réinitialisation.' },
  }));
  app.use(`${apiPrefix}/auth/refresh`, rateLimit({
    windowMs: 15 * 60 * 1000, max: 50,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de renouvellement de token.' },
  }));

  // ── Fichiers statiques ────────────────────────────────────────────
  const setCrossOrigin: express.RequestHandler = (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };
  app.use('/uploads/avatars', setCrossOrigin, express.static(path.join(process.cwd(), 'uploads/avatars')));
  app.use('/uploads/company', setCrossOrigin, express.static(path.join(process.cwd(), 'uploads/company')));

  // ── Global pipes / filters / interceptors ─────────────────────────
  const reflector = app.get(Reflector);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));

  // ── Swagger ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('InvoiceHub API')
      .setDescription('API InvoiceHub v2.0 — Bridge Technologies Solutions')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  // ── Graceful shutdown ─────────────────────────────────────────────
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3000');
  await app.listen(port);
  console.log(`🚀 InvoiceHub NestJS démarré sur le port ${port}`);
}

bootstrap();
```

---

### TÂCHE 22 — Créer le module `Health`

**Fichier : `src/modules/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '../../common/decorators/inject-redis.decorator';
import type { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get()
  @Public()
  async check() {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const db    = dbResult.status    === 'fulfilled' ? 'ok' : 'error';
    const redis = redisResult.status === 'fulfilled' ? 'ok' : 'error';
    const healthy = db === 'ok' && redis === 'ok';

    return {
      status:    healthy ? 'ok' : 'degraded',
      db, redis,
      uptime:    Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      env:       process.env.NODE_ENV,
    };
  }
}
```

---

## Critère de succès Phase 1

```bash
pnpm start:dev
```

✅ Serveur démarre sans erreur
✅ `GET /health` → `{ status: 'ok', db: 'ok', redis: 'ok' }`
✅ `GET /api/docs` → Swagger UI s'affiche
✅ `GET /api/invoices` (sans token) → `401 { success: false, code: 'UNAUTHORIZED' }`
✅ `GET /api/inexistant` → `404 { success: false, code: 'NOT_FOUND' }`
✅ TypeScript compile sans erreur : `pnpm build`

---

## Structure finale attendue après Phase 1

```
bridge-backend-nest/src/
├── main.ts
├── app.module.ts
├── config/
│   └── env.validation.ts
├── prisma/
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── redis/
│   └── redis.module.ts
├── common/
│   ├── auth.module.ts
│   ├── decorators/
│   │   ├── audit.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   ├── inject-redis.decorator.ts
│   │   ├── permission.decorator.ts
│   │   └── public.decorator.ts
│   ├── dto/
│   │   └── pagination.dto.ts
│   ├── errors/
│   │   └── app-error.ts
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── rbac.guard.ts
│   ├── interceptors/
│   │   ├── audit.interceptor.ts
│   │   └── response.interceptor.ts
│   ├── pipes/
│   │   └── zod-validation.pipe.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   └── types/
│       ├── express.d.ts
│       └── jwt-payload.type.ts
├── gateway/
│   ├── events.gateway.ts
│   └── gateway.module.ts
├── jobs/
│   ├── jobs.module.ts
│   ├── job-types.ts
│   ├── processors/
│   │   ├── email.processor.ts
│   │   ├── notification.processor.ts
│   │   ├── backup.processor.ts
│   │   ├── recurring.processor.ts
│   │   ├── reminder.processor.ts
│   │   ├── overdue.processor.ts
│   │   └── approval.processor.ts
│   └── schedulers/
│       └── cron.scheduler.ts
├── lib/                        ← copie depuis Express
│   ├── bcrypt.ts
│   ├── broadcast.ts
│   ├── csv.ts
│   ├── document-math.ts
│   ├── documentNumber.ts
│   ├── eventBus.ts
│   ├── jwt.ts
│   ├── mailer.ts
│   ├── ollama.ts
│   ├── pdf.ts
│   ├── rbacCache.ts
│   ├── sanitize.ts
│   ├── totp.ts
│   └── accountingEngine.ts
└── modules/
    └── health/
        ├── health.controller.ts
        └── health.module.ts
```
