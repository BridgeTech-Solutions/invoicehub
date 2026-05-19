# PHASE 7 — MODULES TRANSVERSAUX : NestJS MIGRATION PROMPT (Partie 2/2)

---

## 4. AuditModule

### 4.1 AuditService

```typescript
// src/modules/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListAuditLogsInput {
  page: number; limit: number;
  userId?: string; entityType?: string; action?: AuditAction;
  dateFrom?: Date; dateTo?: Date;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async list(input: ListAuditLogsInput) {
    const { page, limit, userId, entityType, action, dateFrom, dateTo } = input;
    const skip  = (page - 1) * limit;
    const where = {
      ...(userId     && { userId }),
      ...(entityType && { entityType }),
      ...(action     && { action }),
      ...((dateFrom || dateTo) && { createdAt: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }),
    };
    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: limit,
      }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listAll(input: Omit<ListAuditLogsInput, 'page' | 'limit'>) {
    const { userId, entityType, action, dateFrom, dateTo } = input;
    const where = {
      ...(userId     && { userId }),
      ...(entityType && { entityType }),
      ...(action     && { action }),
      ...((dateFrom || dateTo) && { createdAt: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }),
    };
    return this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async stats() {
    const [topUsers, topTables, topActions, dailyActivity] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { not: null } }, _count: true, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
      this.prisma.auditLog.groupBy({ by: ['entityType'], where: { entityType: { not: null } }, _count: true, orderBy: { _count: { entityType: 'desc' } }, take: 10 }),
      this.prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } } }),
      this.prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE(created_at) AS day, COUNT(*)::bigint AS count
        FROM audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC`,
    ]);
    const userIds  = topUsers.map(u => u.userId).filter(Boolean) as string[];
    const users    = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const userMap  = new Map(users.map(u => [u.id, u]));
    return {
      topUsers:      topUsers.map(u => ({ user: userMap.get(u.userId!), count: u._count })),
      topTables:     topTables.map(t => ({ table: t.entityType, count: t._count })),
      topActions:    topActions.map(a => ({ action: a.action, count: a._count })),
      dailyActivity: dailyActivity.map(d => ({ day: d.day, count: Number(d.count) })),
    };
  }
}
```

### 4.2 AuditController

```typescript
// src/modules/audit/audit.controller.ts
import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { AuditService } from './audit.service';
import { sendCsvResponse } from '../../lib/csv';

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

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('audit:read')
export class AuditController {
  constructor(private auditService: AuditService) {}

  // ↓ GET /audit-logs/stats — static avant /:id potentiel
  @Get('stats')
  async stats() {
    return this.auditService.stats();
  }

  @Get()
  @SkipResponseWrapper()
  async list(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { page, limit, userId, entityType, action, dateFrom, dateTo, export: fmt } = listSchema.parse(query);

    if (fmt === 'csv') {
      const data = await this.auditService.listAll({ userId, entityType, action, dateFrom, dateTo });
      sendCsvResponse(res, 'audit-logs.csv',
        ['Date','Utilisateur','Email','Action','Table','Enregistrement','IP'],
        data.map(l => [
          l.createdAt.toISOString(),
          l.user ? `${l.user.firstName} ${l.user.lastName}` : 'Système',
          (l.user as any)?.email ?? '',
          l.action, l.entityType ?? '', l.entityId ?? '', (l as any).ipAddress ?? '',
        ]),
      );
      return;
    }

    const result = await this.auditService.list({ page, limit, userId, entityType, action, dateFrom, dateTo });
    res.json({ success: true, ...result });
  }
}
```

### 4.3 AuditModule

```typescript
// src/modules/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  providers:   [AuditService],
  controllers: [AuditController],
  exports:     [AuditService],
})
export class AuditModule {}
```

---

## 5. BackupsModule

### 5.1 BackupRateLimitGuard (custom — 3 backups/heure par userId)

```typescript
// src/core/guards/backup-rate-limit.guard.ts
import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Injectable()
export class BackupRateLimitGuard implements CanActivate {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req    = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) return false;

    const key     = `backup_rl:${userId}`;
    const current = await this.redis.incr(key);
    if (current === 1) await this.redis.expire(key, 3600); // fenêtre 1 heure
    if (current > 3) {
      throw new HttpException('Limite de 3 backups manuels par heure atteinte.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
```

### 5.2 BackupsService

```typescript
// src/modules/backups/backups.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { format } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../core/errors/AppError';
import { env } from '../../config/env';
import { getStorageAdapter } from './storage';

export const BACKUP_QUEUE_NAME = 'backup';

function parseDatabaseUrl() {
  const url = new URL(env.DATABASE_URL);
  return { host: url.hostname, port: url.port || '5432', user: url.username, password: decodeURIComponent(url.password), dbName: url.pathname.replace(/^\//, '') };
}

export function generateFilename(): string {
  const ts = format(new Date(), 'yyyyMMdd_HHmmss');
  return env.BACKUP_INCLUDE_FILES ? `invoicehub_full_${ts}.tar.gz` : `invoicehub_db_${ts}.sql.gz`;
}

@Injectable()
export class BackupsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(BACKUP_QUEUE_NAME) private backupQueue: Queue<{ backupId: string }>,
  ) {}

  async trigger(userId: string) {
    const inProgress = await this.prisma.backup.findFirst({ where: { status: { in: ['pending', 'running'] } } });
    if (inProgress) throw AppError.conflict(`Un backup est déjà en cours (statut : ${inProgress.status}).`);

    const filename = generateFilename();
    const backup   = await this.prisma.backup.create({
      data: { filename, storageDisk: env.BACKUP_STORAGE_DISK, status: 'pending', type: 'manual', createdById: userId },
      include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });

    await this.backupQueue.add('backup', { backupId: backup.id }, { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
    return this.formatBackup(backup);
  }

  async list(params: { page?: number; limit?: number; status?: string }) {
    const page  = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const where = params.status ? { status: params.status as any } : {};
    const [total, backups] = await Promise.all([
      this.prisma.backup.count({ where }),
      this.prisma.backup.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit, include: { createdBy: { select: { firstName: true, lastName: true, email: true } } } }),
    ]);
    return { data: backups.map(b => this.formatBackup(b)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id }, include: { createdBy: { select: { firstName: true, lastName: true, email: true } } } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    return this.formatBackup(backup);
  }

  async getDownloadInfo(id: string): Promise<{ url: string | null; localPath: string | null; filename: string }> {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status !== 'success') throw AppError.badRequest("Le backup n'est pas encore disponible");
    const adapter     = getStorageAdapter();
    const storagePath = backup.storagePath ?? '';
    const url         = await adapter.getDownloadUrl(storagePath);
    const localPath   = adapter.getLocalPath(storagePath);
    if (localPath && backup.checksum && fs.existsSync(localPath)) {
      const computed = await this.computeSha256(localPath);
      if (computed !== backup.checksum) throw AppError.internal(`Le fichier de backup ${backup.filename} est corrompu.`);
    }
    return { url, localPath, filename: backup.filename };
  }

  async delete(id: string): Promise<void> {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status === 'running') throw AppError.badRequest("Impossible de supprimer un backup en cours d'exécution");
    if (backup.storagePath) { const adapter = getStorageAdapter(); await adapter.delete(backup.storagePath).catch(() => {}); }
    await this.prisma.backup.delete({ where: { id } });
  }

  // ── Appelée depuis BackupProcessor ────────────────────────────────────────
  async runBackup(backupId: string): Promise<void> {
    await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'running', startedAt: new Date() } });
    const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const tempDir = path.join(backupDir, `tmp_${backupId}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const backup      = await this.prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
      const db          = parseDatabaseUrl();
      const adapter     = getStorageAdapter();
      const archivePath = path.join(backupDir, `${backup.filename}.tmp`);

      if (env.BACKUP_INCLUDE_FILES) {
        const sqlPath    = path.join(tempDir, 'database.sql');
        const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
        await this.dumpDatabase(db, sqlPath, false);
        await this.createTarGz(archivePath, tempDir, 'database.sql', uploadsDir);
      } else {
        await this.dumpDatabase(db, archivePath, true);
      }

      const stat        = fs.statSync(archivePath);
      const checksum    = await this.computeSha256(archivePath);
      const storagePath = await adapter.upload(archivePath, backup.filename);
      await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'success', storagePath, sizeBytes: stat.size, checksum, completedAt: new Date() } });
    } catch (err: any) {
      await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'failed', errorMessage: err?.message ?? 'Erreur inconnue', completedAt: new Date() } });
      throw err;
    } finally {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      await this.purgeOldBackups();
    }
  }

  async purgeOldBackups(): Promise<void> {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - env.BACKUP_RETENTION_DAYS);
    const old = await this.prisma.backup.findMany({ where: { createdAt: { lt: cutoff }, status: 'success' } });
    for (const b of old) {
      if (b.storagePath) { const adapter = getStorageAdapter(); await adapter.delete(b.storagePath).catch(() => {}); }
      await this.prisma.backup.delete({ where: { id: b.id } }).catch(() => {});
    }
  }

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end',  ()    => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async dumpDatabase(db: { host: string; port: string; user: string; password: string; dbName: string }, outputPath: string, gzipOutput = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseArgs = ['-U', db.user, '-d', db.dbName, '--no-password', '-F', 'p', '-v'];
      let pgdump: ReturnType<typeof spawn>;
      if ((env as any).PGDUMP_DOCKER_CONTAINER) {
        pgdump = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${db.password}`, (env as any).PGDUMP_DOCKER_CONTAINER, 'pg_dump', ...baseArgs], { env: process.env });
      } else {
        pgdump = spawn((env as any).PGDUMP_PATH ?? 'pg_dump', ['-h', db.host, '-p', db.port, ...baseArgs], { env: { ...process.env, PGPASSWORD: db.password } });
      }
      if (!pgdump.stdout) { reject(new Error('pg_dump stdout is null')); return; }
      const output = createWriteStream(outputPath);
      const p = gzipOutput ? pipeline(pgdump.stdout, createGzip({ level: 6 }), output) : pipeline(pgdump.stdout, output);
      p.then(resolve).catch(reject);
      pgdump.on('error', reject);
      pgdump.on('close', code => { if (code !== 0) reject(new Error(`pg_dump a terminé avec le code ${code}`)); });
    });
  }

  private createTarGz(outputPath: string, sqlDir: string, sqlFilename: string, uploadsDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-czf', outputPath, '-C', sqlDir, sqlFilename];
      if (fs.existsSync(uploadsDir)) { const p = path.dirname(uploadsDir); args.push('-C', p, path.basename(uploadsDir)); }
      const tar = spawn('tar', args);
      tar.on('error', reject);
      tar.stderr?.on('data', () => {});
      tar.on('close', code => { if (code !== 0) reject(new Error(`tar code ${code}`)); else resolve(); });
    });
  }

  private formatBackup(b: any) {
    const sizeBytes = b.sizeBytes ? Number(b.sizeBytes) : null;
    const completedAt = b.completedAt ? new Date(b.completedAt) : null;
    const durationSec = completedAt ? Math.round((completedAt.getTime() - new Date(b.createdAt).getTime()) / 1000) : null;
    return { id: b.id, filename: b.filename, storageDisk: b.storageDisk, storagePath: b.storagePath, sizeBytes, sizeMb: sizeBytes ? (sizeBytes/1024/1024).toFixed(2) : null, status: b.status, errorMessage: b.errorMessage, createdAt: b.createdAt, completedAt: b.completedAt, durationSeconds: durationSec, createdBy: b.createdBy ?? null };
  }
}
```

### 5.3 BackupProcessor

```typescript
// src/modules/backups/backup.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BackupsService, BACKUP_QUEUE_NAME } from './backups.service';

@Processor(BACKUP_QUEUE_NAME)
export class BackupProcessor extends WorkerHost {
  constructor(private backupsService: BackupsService) { super(); }

  async process(job: Job<{ backupId: string }>): Promise<void> {
    await this.backupsService.runBackup(job.data.backupId);
  }
}
```

### 5.4 BackupsController

```typescript
// src/modules/backups/backups.controller.ts
import { Controller, Get, Post, Delete, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import fs from 'fs';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { BackupsService } from './backups.service';
import { BackupRateLimitGuard } from '../../core/guards/backup-rate-limit.guard';
import { NotFoundException } from '@nestjs/common';

@Controller('backups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('backups:manage')
export class BackupsController {
  constructor(private backupsService: BackupsService) {}

  @Post()
  @UseGuards(BackupRateLimitGuard)
  async trigger(@Req() req: Request & { user: any }) {
    const backup = await this.backupsService.trigger(req.user.id);
    return { data: backup, message: 'Backup en cours de création...', statusCode: 202 };
  }

  @Get()
  async list(@Req() req: Request) {
    const q = req.query as Record<string, string>;
    return this.backupsService.list({ page: Number(q['page']) || 1, limit: Number(q['limit']) || 20, status: q['status'] });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.backupsService.findById(id);
  }

  @Get(':id/download')
  @SkipResponseWrapper()
  async download(@Param('id') id: string, @Res() res: Response) {
    const { url, localPath, filename } = await this.backupsService.getDownloadInfo(id);

    if (url) { res.redirect(302, url); return; }

    if (localPath && fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(localPath).pipe(res);
      return;
    }

    throw new NotFoundException('Fichier de backup introuvable sur le disque');
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.backupsService.delete(id);
    return { message: 'Backup supprimé' };
  }
}
```

### 5.5 BackupsModule

```typescript
// src/modules/backups/backups.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConnection } from '../../config/redis';
import { BackupsService, BACKUP_QUEUE_NAME } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupProcessor } from './backup.processor';
import { BackupRateLimitGuard } from '../../core/guards/backup-rate-limit.guard';

@Module({
  imports: [
    BullModule.registerQueue({ name: BACKUP_QUEUE_NAME, connection: redisConnection }),
  ],
  providers: [
    BackupsService,
    BackupProcessor,
    BackupRateLimitGuard,
    { provide: 'REDIS_CLIENT', useValue: redisConnection },
  ],
  controllers: [BackupsController],
})
export class BackupsModule {}
```

---

## 6. SettingsModule

### 6.1 SettingsService

```typescript
// src/modules/settings/settings.service.ts
import { Injectable } from '@nestjs/common';
import path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateSettingsInput } from './settings.schema';

const ASSET_PATH_FIELDS = ['logoPath', 'stampPath', 'signaturePath', 'headerImagePath', 'footerImagePath'] as const;

function toRelativePath(absPath: string | null): string | null {
  if (!absPath) return null;
  if (!path.isAbsolute(absPath)) return absPath.replace(/\\/g, '/');
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}

function formatSettings<T extends Record<string, unknown>>(settings: T): T {
  if (!settings) return settings;
  const result = { ...settings };
  for (const field of ASSET_PATH_FIELDS) {
    if (field in result) (result as Record<string, unknown>)[field] = toRelativePath(result[field] as string | null);
  }
  return result;
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.companySettings.findFirst();
    return settings ? formatSettings(settings as any) : null;
  }

  async update(input: UpdateSettingsInput) {
    const existing = await this.prisma.companySettings.findFirst();

    if (existing) {
      const updated = await this.prisma.companySettings.update({
        where: { id: existing.id },
        data: {
          ...(input.companyName                !== undefined && { companyName:                input.companyName }),
          ...(input.legalForm                  !== undefined && { legalForm:                  input.legalForm }),
          ...(input.taxNumber                  !== undefined && { taxNumber:                  input.taxNumber }),
          ...(input.rccm                       !== undefined && { rccm:                       input.rccm }),
          ...(input.address                    !== undefined && { address:                    input.address }),
          ...(input.city                       !== undefined && { city:                       input.city }),
          ...(input.country                    !== undefined && { country:                    input.country }),
          ...(input.postalBox                  !== undefined && { postalBox:                  input.postalBox }),
          ...(input.phone                      !== undefined && { phone:                      input.phone }),
          ...(input.email                      !== undefined && { email:                      input.email }),
          ...(input.website                    !== undefined && { website:                    input.website || null }),
          ...(input.defaultCurrency            !== undefined && { defaultCurrency:            input.defaultCurrency }),
          ...(input.defaultTaxRate             !== undefined && { defaultTaxRate:             input.defaultTaxRate }),
          ...(input.defaultProformaValidityDays !== undefined && { defaultProformaValidityDays: input.defaultProformaValidityDays }),
          ...(input.defaultInvoiceDueDays      !== undefined && { defaultInvoiceDueDays:      input.defaultInvoiceDueDays }),
          ...(input.sessionTimeoutMinutes      !== undefined && { sessionTimeoutMinutes:      input.sessionTimeoutMinutes }),
          ...(input.maxLoginAttempts           !== undefined && { maxLoginAttempts:           input.maxLoginAttempts }),
          ...(input.require2FA                 !== undefined && { require2FA:                 input.require2FA }),
          ...(input.companyCode                !== undefined && { companyCode:                input.companyCode }),
          ...(input.autoReminderDays           !== undefined && { autoReminderDays:           input.autoReminderDays }),
          ...(input.footerSafeZonePx           !== undefined && { footerSafeZonePx:           input.footerSafeZonePx }),
          ...(input.reminderEscalation         !== undefined && { reminderEscalation:         input.reminderEscalation }),
        },
      });
      return formatSettings(updated as any);
    }

    const created = await this.prisma.companySettings.create({
      data: {
        companyName:  input.companyName  ?? 'Bridge Technologies Solutions',
        address:      input.address      ?? 'Douala, Cameroun',
        phone:        input.phone        ?? '',
        email:        input.email        ?? 'contact@bridgetech-solutions.com',
        legalForm:    input.legalForm,
        taxNumber:    input.taxNumber,
        rccm:         input.rccm,
        city:         input.city         ?? 'Douala',
        country:      input.country      ?? 'Cameroun',
        postalBox:    input.postalBox,
        website:      input.website      || undefined,
        defaultCurrency:             input.defaultCurrency             ?? 'XAF',
        defaultTaxRate:              input.defaultTaxRate              ?? 19.25,
        defaultProformaValidityDays: input.defaultProformaValidityDays ?? 30,
        defaultInvoiceDueDays:       input.defaultInvoiceDueDays       ?? 30,
        sessionTimeoutMinutes:       input.sessionTimeoutMinutes       ?? 30,
        maxLoginAttempts:            input.maxLoginAttempts            ?? 5,
        require2FA:                  input.require2FA                  ?? false,
        companyCode:                 input.companyCode                 ?? 'BTS',
        autoReminderDays:            input.autoReminderDays            ?? [7, 14, 30],
        footerSafeZonePx:            input.footerSafeZonePx            ?? 0,
      },
    });
    return formatSettings(created as any);
  }
}
```

### 6.2 SettingsController

```typescript
// src/modules/settings/settings.controller.ts
import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { Audit } from '../../core/decorators/audit.decorator';
import { SettingsService } from './settings.service';
import { updateSettingsSchema } from './settings.schema';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  async get() {
    return this.settingsService.get();
  }

  @Put()
  @UseGuards(PermissionsGuard)
  @Permission('settings:update')
  @Audit('company_settings', 'UPDATE')
  async update(@Req() req: any, @Body() body: unknown) {
    // Capture avant-état pour l'AuditInterceptor (miroir du comportement Express)
    const before = await this.settingsService.get();
    req['auditPreviousData'] = before;

    const input = updateSettingsSchema.parse(body);
    return this.settingsService.update(input);
  }
}
```

### 6.3 SettingsModule

```typescript
// src/modules/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  providers:   [SettingsService],
  controllers: [SettingsController],
  exports:     [SettingsService],
})
export class SettingsModule {}
```

---

## 7. SettingsAdvancedModule

> **Pattern** : 6 `@Controller` dans 1 `@Module`, 1 `@Injectable` service.  
> Miroir des 6 routers Express séparés montés à des paths distincts.

### 7.1 Constante queue Export

```typescript
export const EXPORT_QUEUE_NAME = 'export';
```

### 7.2 SettingsAdvancedService

```typescript
// src/modules/settings-advanced/settings-advanced.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes, createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../core/errors/AppError';
import {
  CreateWebhookInput, UpdateWebhookInput, CreateApiKeyInput, CreateCustomFieldInput,
  CreateWorkflowRuleInput, CreateIpWhitelistInput, CreateExportJobInput,
} from './settings-advanced.schema';

export const EXPORT_QUEUE_NAME = 'export';

@Injectable()
export class SettingsAdvancedService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(EXPORT_QUEUE_NAME) private exportQueue: Queue<{ exportJobId: string }>,
  ) {}

  // ── Webhooks ────────────────────────────────────────────────────────────────

  async listWebhooks() {
    return this.prisma.webhook.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { deliveries: true } } } });
  }
  async getWebhookById(id: string) {
    const wh = await this.prisma.webhook.findUnique({ where: { id }, include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    return wh;
  }
  async createWebhook(data: CreateWebhookInput, userId: string) {
    return this.prisma.webhook.create({ data: { ...data, createdById: userId } });
  }
  async updateWebhook(id: string, data: Partial<CreateWebhookInput>) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    return this.prisma.webhook.update({ where: { id }, data: data as any });
  }
  async deleteWebhook(id: string) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } });
    if (!wh) throw AppError.notFound('Webhook introuvable');
    await this.prisma.webhook.delete({ where: { id } });
  }

  // ── API Keys ────────────────────────────────────────────────────────────────

  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({ where: { createdById: userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, keyPrefix: true, permissions: true, expiresAt: true, lastUsedAt: true, createdAt: true, isActive: true } });
  }
  async createApiKey(data: CreateApiKeyInput, userId: string) {
    const rawKey   = `bts_${randomBytes(32).toString('hex')}`;
    const keyHash  = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);
    const apiKey   = await this.prisma.apiKey.create({ data: { name: data.name, permissions: data.permissions, expiresAt: data.expiresAt, keyHash, keyPrefix, createdById: userId, isActive: true } });
    return { ...apiKey, rawKey };
  }
  async revokeApiKey(id: string, userId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, createdById: userId } });
    if (!key) throw AppError.notFound('Clé API introuvable');
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false, revokedAt: new Date(), revokedById: userId } });
  }

  // ── Custom Fields ────────────────────────────────────────────────────────────

  async listCustomFields(entityType?: string) {
    return this.prisma.customField.findMany({ where: { ...(entityType ? { entityType: entityType as any } : {}), isActive: true }, orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }] });
  }
  async createCustomField(data: CreateCustomFieldInput) {
    const exists = await this.prisma.customField.findFirst({ where: { entityType: data.entityType as any, name: data.fieldName } });
    if (exists) throw AppError.conflict(`Le champ "${data.fieldName}" existe déjà pour ce type d'entité`);
    return this.prisma.customField.create({ data: { entityType: data.entityType as any, name: data.fieldName, label: data.label, fieldType: data.fieldType as any, isRequired: data.isRequired, sortOrder: data.displayOrder, options: data.options ? data.options as any : undefined, defaultValue: data.defaultValue, isActive: true } });
  }
  async deleteCustomField(id: string) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw AppError.notFound('Champ personnalisé introuvable');
    await this.prisma.customField.update({ where: { id }, data: { isActive: false } });
  }
  async getCustomFieldValues(entityType: string, entityId: string) {
    return this.prisma.customFieldValue.findMany({ where: { entityType: entityType as any, entityId }, include: { customField: true } });
  }
  async setCustomFieldValue(entityType: string, entityId: string, customFieldId: string, value: { valueText?: string | null; valueNumber?: number | null; valueDate?: Date | null; valueBoolean?: boolean | null; valueJson?: unknown }) {
    return this.prisma.customFieldValue.upsert({ where: { customFieldId_entityId: { customFieldId, entityId } }, update: value as any, create: { customFieldId, entityType: entityType as any, entityId, ...value as any } });
  }

  // ── Workflow Rules ───────────────────────────────────────────────────────────

  async listWorkflowRules(module?: string) {
    return this.prisma.workflowRule.findMany({ where: { ...(module ? { module } : {}) }, orderBy: { createdAt: 'desc' } });
  }
  async createWorkflowRule(data: CreateWorkflowRuleInput, userId: string) {
    return this.prisma.workflowRule.create({ data: { name: data.name, module: data.entityType, triggerEvent: data.triggerEvent, conditions: (data.conditions ?? {}) as any, actions: (data.actions ?? []) as any, isActive: true, createdById: userId } });
  }
  async toggleWorkflowRule(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id } });
    if (!rule) throw AppError.notFound('Règle introuvable');
    return this.prisma.workflowRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  }
  async deleteWorkflowRule(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id } });
    if (!rule) throw AppError.notFound('Règle introuvable');
    await this.prisma.workflowRule.delete({ where: { id } });
  }

  // ── IP Whitelist ─────────────────────────────────────────────────────────────

  async listIpWhitelist() { return this.prisma.ipWhitelist.findMany({ orderBy: { createdAt: 'desc' } }); }
  async addIpWhitelist(data: CreateIpWhitelistInput, userId: string) {
    return this.prisma.ipWhitelist.create({ data: { ipAddress: data.ipAddress, label: data.description ?? data.ipAddress, isActive: data.isActive, createdById: userId } });
  }
  async removeIpWhitelist(id: string) { await this.prisma.ipWhitelist.delete({ where: { id } }); }

  // ── Export Jobs ──────────────────────────────────────────────────────────────

  async listExportJobs(userId: string) { return this.prisma.exportJob.findMany({ where: { createdById: userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  async getExportJob(id: string, userId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, createdById: userId } });
    if (!job) throw AppError.notFound('Export introuvable');
    return job;
  }
  async createExportJob(data: CreateExportJobInput, userId: string) {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const job = await this.prisma.exportJob.create({ data: { module: data.entityType, format: data.format as any, filters: (data.filters ?? {}) as any, status: 'pending' as any, expiresAt, createdById: userId } });
    await this.exportQueue.add('export', { exportJobId: job.id });
    return job;
  }
  async getExportDownload(id: string, userId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, createdById: userId } });
    if (!job) throw AppError.notFound('Export introuvable');
    if (job.status !== 'completed') throw AppError.badRequest('Export non terminé');
    if (!job.filePath) throw AppError.badRequest('Fichier non disponible');
    const absolutePath = path.join(process.cwd(), job.filePath);
    if (!fs.existsSync(absolutePath)) throw AppError.notFound('Fichier introuvable sur le serveur');
    return { absolutePath, filename: path.basename(absolutePath), format: job.format };
  }
}
```

### 7.3 Les 6 Controllers

```typescript
// src/modules/settings-advanced/webhooks.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { Audit } from '../../core/decorators/audit.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createWebhookSchema, updateWebhookSchema } from './settings-advanced.schema';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('webhooks:manage')
export class WebhooksController {
  constructor(private service: SettingsAdvancedService) {}
  @Get()                                                                           listWebhooks()                                                         { return this.service.listWebhooks(); }
  @Get(':id')                                                                      getWebhook(@Param('id') id: string)                                    { return this.service.getWebhookById(id); }
  @Post()        @Audit('webhook', 'CREATE')                                       createWebhook(@Body() body: unknown, @Req() req: any)                  { return this.service.createWebhook(createWebhookSchema.parse(body), req.user.id); }
  @Put(':id')    @Audit('webhook', 'UPDATE')                                       updateWebhook(@Param('id') id: string, @Body() body: unknown)          { return this.service.updateWebhook(id, updateWebhookSchema.parse(body)); }
  @Delete(':id') @Audit('webhook', 'SOFT_DELETE')                                  deleteWebhook(@Param('id') id: string)                                 { return this.service.deleteWebhook(id).then(() => ({ message: 'Webhook supprimé' })); }
}
```

```typescript
// src/modules/settings-advanced/api-keys.controller.ts
import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { Audit } from '../../core/decorators/audit.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createApiKeySchema } from './settings-advanced.schema';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('api-keys:manage')
export class ApiKeysController {
  constructor(private service: SettingsAdvancedService) {}
  @Get()                               listApiKeys(@Req() req: any)                                 { return this.service.listApiKeys(req.user.id); }
  @Post()   @Audit('api_key','CREATE') createApiKey(@Body() body: unknown, @Req() req: any)         { return this.service.createApiKey(createApiKeySchema.parse(body), req.user.id); }
  @Delete(':id') @Audit('api_key','SOFT_DELETE') revokeApiKey(@Param('id') id: string, @Req() req: any) { return this.service.revokeApiKey(id, req.user.id).then(() => ({ message: 'Clé révoquée' })); }
}
```

```typescript
// src/modules/settings-advanced/custom-fields.controller.ts
import { Controller, Get, Post, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createCustomFieldSchema, setCustomFieldValueSchema } from './settings-advanced.schema';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(private service: SettingsAdvancedService) {}

  @Get()
  @UseGuards(PermissionsGuard) @Permission('settings:read')
  listCustomFields(@Query('entityType') entityType?: string) { return this.service.listCustomFields(entityType); }

  @Post()
  @UseGuards(PermissionsGuard) @Permission('settings:manage')
  createCustomField(@Body() body: unknown) { return this.service.createCustomField(createCustomFieldSchema.parse(body)); }

  @Delete(':id')
  @UseGuards(PermissionsGuard) @Permission('settings:manage')
  deleteCustomField(@Param('id') id: string) { return this.service.deleteCustomField(id).then(() => ({ message: 'Champ supprimé' })); }

  // ↓ /values/:entityType/:entityId — GET différent de DELETE /:id → pas de conflit
  @Get('values/:entityType/:entityId')
  @UseGuards(PermissionsGuard) @Permission('settings:read')
  getCustomFieldValues(@Param('entityType') et: string, @Param('entityId') id: string) { return this.service.getCustomFieldValues(et, id); }

  @Post('values/:entityType/:entityId')
  @UseGuards(PermissionsGuard) @Permission('settings:manage')
  setCustomFieldValue(@Param('entityType') et: string, @Param('entityId') eid: string, @Body() body: unknown) {
    const { fieldId, ...value } = setCustomFieldValueSchema.parse(body);
    return this.service.setCustomFieldValue(et, eid, fieldId, value);
  }
}
```

```typescript
// src/modules/settings-advanced/workflow-rules.controller.ts
import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createWorkflowRuleSchema } from './settings-advanced.schema';

@Controller('workflow-rules')
@UseGuards(JwtAuthGuard)
export class WorkflowRulesController {
  constructor(private service: SettingsAdvancedService) {}
  @Get()                                  @UseGuards(PermissionsGuard) @Permission('settings:read')   listWorkflowRules(@Query('entityType') m?: string) { return this.service.listWorkflowRules(m); }
  @Post()                                 @UseGuards(PermissionsGuard) @Permission('settings:manage') createWorkflowRule(@Body() body: unknown, @Param() p: any, req?: any) { return this.service.createWorkflowRule(createWorkflowRuleSchema.parse(body), (req as any)?.user?.id ?? ''); }
  @Post(':id/toggle')                     @UseGuards(PermissionsGuard) @Permission('settings:manage') toggleWorkflowRule(@Param('id') id: string) { return this.service.toggleWorkflowRule(id); }
  @Delete(':id')                          @UseGuards(PermissionsGuard) @Permission('settings:manage') deleteWorkflowRule(@Param('id') id: string) { return this.service.deleteWorkflowRule(id).then(() => ({ message: 'Règle supprimée' })); }
}
```

```typescript
// src/modules/settings-advanced/ip-whitelist.controller.ts
import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/guards/permissions.guard';
import { Permission } from '../../core/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createIpWhitelistSchema } from './settings-advanced.schema';

@Controller('ip-whitelist')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permission('settings:manage')
export class IpWhitelistController {
  constructor(private service: SettingsAdvancedService) {}
  @Get()           listIpWhitelist()                                               { return this.service.listIpWhitelist(); }
  @Post()          addIpWhitelist(@Body() body: unknown, @Req() req: any)          { return this.service.addIpWhitelist(createIpWhitelistSchema.parse(body), req.user.id); }
  @Delete(':id')   removeIpWhitelist(@Param('id') id: string)                      { return this.service.removeIpWhitelist(id).then(() => ({ message: 'IP supprimée' })); }
}
```

```typescript
// src/modules/settings-advanced/export-jobs.controller.ts
import { Controller, Get, Post, Delete, Param, Body, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createExportJobSchema } from './settings-advanced.schema';

const MIME_TYPES: Record<string, string> = { csv: 'text/csv', excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sage_csv: 'text/plain', ciel_csv: 'text/plain', dsf_xml: 'application/xml' };

@Controller('exports')
@UseGuards(JwtAuthGuard)
export class ExportJobsController {
  constructor(private service: SettingsAdvancedService) {}

  @Get()                               listExportJobs(@Req() req: any)                          { return this.service.listExportJobs(req.user.id); }
  @Get(':id')                          getExportJob(@Param('id') id: string, @Req() req: any)   { return this.service.getExportJob(id, req.user.id); }
  @Post()                              createExportJob(@Body() body: unknown, @Req() req: any)   { return this.service.createExportJob(createExportJobSchema.parse(body), req.user.id); }

  @Get(':id/download')
  @SkipResponseWrapper()
  async downloadExport(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { absolutePath, filename, format } = await this.service.getExportDownload(id, req.user.id);
    res.setHeader('Content-Type', MIME_TYPES[String(format)] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(absolutePath);
  }
}
```

### 7.4 SettingsAdvancedModule

```typescript
// src/modules/settings-advanced/settings-advanced.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConnection } from '../../config/redis';
import { SettingsAdvancedService, EXPORT_QUEUE_NAME } from './settings-advanced.service';
import { WebhooksController }     from './webhooks.controller';
import { ApiKeysController }      from './api-keys.controller';
import { CustomFieldsController } from './custom-fields.controller';
import { WorkflowRulesController } from './workflow-rules.controller';
import { IpWhitelistController }  from './ip-whitelist.controller';
import { ExportJobsController }   from './export-jobs.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: EXPORT_QUEUE_NAME, connection: redisConnection }),
  ],
  providers: [SettingsAdvancedService],
  controllers: [
    WebhooksController,
    ApiKeysController,
    CustomFieldsController,
    WorkflowRulesController,
    IpWhitelistController,
    ExportJobsController,
  ],
  exports: [SettingsAdvancedService],
})
export class SettingsAdvancedModule {}
```

---

## 8. AiModule

> **Décision critique** : `ai.tools.ts` utilise `prisma` global → ses fonctions deviennent des **méthodes privées** de `AiService` qui injecte `PrismaService`. Les prompts LLM (CORE, INTENT, USAGE_GUIDE) restent des **constantes de module** dans `ai.service.ts`.

### 8.1 AiService (avec outils DB intégrés)

```typescript
// src/modules/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ollamaGenerate, ollamaStream, ollamaHealthCheck } from '../../lib/ollama';
import type { ChatMessage } from './ai.schema';

// ── Copier tels quels depuis ai.service.ts Express ───────────────────────────
//    BTS_CORE_PROMPT, USAGE_GUIDE, INTENT_SYSTEM_PROMPT, buildRoleContext(), buildSystemPrompt()
//    (identiques — pas de dépendances DI)

type ToolName = 'getInvoices'|'getInvoiceDetail'|'getProformas'|'getProformaDetail'|'getClients'|'getPayments'|'getDashboardKpis'|'getClientSummary'|'getProductCatalog'|'detectAnomalies'|'none';
interface ToolCall { tool: ToolName; params: Record<string, unknown>; }

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  async getStatus() { return ollamaHealthCheck(); }

  async chat(messages: ChatMessage[], context?: string, userName?: string, userRole?: string): Promise<string> {
    const toolCall    = await this._detectIntent(messages, context);
    const dataContext = await this._fetchData(toolCall);
    const includeGuide = toolCall.tool === 'none';
    const historyText  = messages.slice(-6).map(m => `${m.role==='user'?'Utilisateur':'BTS Assistant'} : ${m.content}`).join('\n');
    return ollamaGenerate(historyText + dataContext, buildSystemPrompt(userName, userRole, includeGuide), 2048, includeGuide ? 8192 : 6144);
  }

  async *chatStream(messages: ChatMessage[], context?: string, userName?: string, userRole?: string): AsyncGenerator<string, void, unknown> {
    const toolCall    = await this._detectIntent(messages, context);
    const dataContext = await this._fetchData(toolCall);
    const includeGuide = toolCall.tool === 'none';
    const historyText  = messages.slice(-6).map(m => `${m.role==='user'?'Utilisateur':'BTS Assistant'} : ${m.content}`).join('\n');
    yield* ollamaStream(historyText + dataContext, buildSystemPrompt(userName, userRole, includeGuide), includeGuide ? 8192 : 6144);
  }

  // ── Intent detection ───────────────────────────────────────────────────────

  private async _detectIntent(messages: ChatMessage[], context?: string): Promise<ToolCall> {
    const last = messages[messages.length - 1]!.content;
    const intentPrompt = `Message : "${last}"\n${context ? `Page actuelle : ${context}\n` : ''}Quel outil utiliser ?`;
    try {
      const raw   = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT, 150, 2048);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { tool?: ToolName; params?: Record<string, unknown> };
        if (parsed.tool) return { tool: parsed.tool, params: parsed.params ?? {} };
      }
    } catch {}
    return { tool: 'none', params: {} };
  }

  private async _fetchData(call: ToolCall): Promise<string> {
    if (call.tool === 'none') return '';
    try {
      const data = await this._executeTool(call);
      if (data !== null) return `\n\n=== Données de la base de données ===\n${JSON.stringify(data)}\n=== Fin des données ===\n`;
    } catch {}
    return '';
  }

  // ── Dispatcher ─────────────────────────────────────────────────────────────

  private async _executeTool(call: ToolCall): Promise<unknown> {
    switch (call.tool) {
      case 'getInvoices':       return this._getInvoices(call.params as any);
      case 'getInvoiceDetail':  return this._getInvoiceDetail(call.params as any);
      case 'getProformas':      return this._getProformas(call.params as any);
      case 'getProformaDetail': return this._getProformaDetail(call.params as any);
      case 'getClients':        return this._getClients(call.params as any);
      case 'getPayments':       return this._getPayments(call.params as any);
      case 'getDashboardKpis':  return this._getDashboardKpis();
      case 'getClientSummary':  return this._getClientSummary(call.params as any);
      case 'getProductCatalog': return this._getProductCatalog(call.params as any);
      case 'detectAnomalies':   return this._detectAnomalies();
      default:                  return null;
    }
  }

  // ── Tool implementations (copier depuis ai.tools.ts, remplacer `prisma` par `this.prisma`) ──

  private async _getInvoices(params: { clientName?: string; status?: string[]; type?: string[]; limit?: number; overdue?: boolean }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.clientName)   where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    if (params.status?.length)  where['status'] = { in: params.status };
    if (params.type?.length)    where['type']   = { in: params.type };
    if (params.overdue)         where['status'] = 'overdue';
    const invoices = await this.prisma.invoice.findMany({ where: where as any, include: { client: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: params.limit ?? 10 });
    return invoices.map(i => ({ number: i.number, client: (i.client as any).name, type: i.type, status: i.status, issueDate: i.issueDate, dueDate: i.dueDate, totalHt: fmt(i.totalHt), totalTax: fmt(i.totalTax), totalTtc: fmt(i.totalTtc), amountPaid: fmt(i.amountPaid), balanceDue: fmt(i.balanceDue) }));
  }

  private async _getInvoiceDetail(params: { invoiceNumber?: string; clientName?: string }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.invoiceNumber) where['number'] = { contains: params.invoiceNumber, mode: 'insensitive' };
    if (params.clientName)    where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    const invoice = await this.prisma.invoice.findFirst({ where: where as any, include: { client: { select: { name: true, email: true } }, lines: { select: { sortOrder: true, designation: true, description: true, quantity: true, unit: true, unitPriceHt: true, discountType: true, discountValue: true, discountAmount: true, taxRate: true, taxAmount: true, subtotalHt: true, netHt: true, totalTtc: true }, orderBy: { sortOrder: 'asc' } }, payments: { where: { deletedAt: null }, select: { amount: true, method: true, paymentDate: true } } }, orderBy: { createdAt: 'desc' } });
    if (!invoice) return null;
    const inv = invoice as any;
    return { number: invoice.number, client: inv.client.name, type: invoice.type, status: invoice.status, totalHt: fmt(invoice.totalHt), totalTax: fmt(invoice.totalTax), totalTtc: fmt(invoice.totalTtc), amountPaid: fmt(invoice.amountPaid), balanceDue: fmt(invoice.balanceDue), lignes: inv.lines.map((l: any) => ({ designation: l.designation, quantite: fmt(l.quantity), prixUnitaireHt: fmt(l.unitPriceHt), tauxTva: fmt(l.taxRate), netHt: fmt(l.netHt), totalTtc: fmt(l.totalTtc) })), paiements: inv.payments.map((p: any) => ({ montant: fmt(p.amount), methode: p.method, date: p.paymentDate })) };
  }

  private async _getProformas(params: { clientName?: string; status?: string[]; limit?: number }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.clientName)      where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    if (params.status?.length)  where['status'] = { in: params.status };
    const proformas = await this.prisma.proforma.findMany({ where: where as any, include: { client: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: params.limit ?? 10 });
    return proformas.map(p => ({ number: p.number, client: (p.client as any).name, status: p.status, totalTtc: fmt(p.totalTtc) }));
  }

  private async _getProformaDetail(params: { proformaNumber?: string; clientName?: string }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.proformaNumber) where['number'] = { contains: params.proformaNumber, mode: 'insensitive' };
    if (params.clientName)     where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    const pf = await this.prisma.proforma.findFirst({ where: where as any, include: { client: { select: { name: true } }, lines: { select: { sortOrder: true, designation: true, quantity: true, netHt: true, totalTtc: true }, orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    if (!pf) return null;
    return { number: pf.number, client: (pf as any).client.name, status: pf.status, totalTtc: fmt(pf.totalTtc), lignes: (pf as any).lines.map((l: any) => ({ designation: l.designation, quantite: fmt(l.quantity), netHt: fmt(l.netHt), totalTtc: fmt(l.totalTtc) })) };
  }

  private async _getClients(params: { name?: string; limit?: number }) {
    const clients = await this.prisma.client.findMany({ where: { deletedAt: null, ...(params.name ? { name: { contains: params.name, mode: 'insensitive' } } : {}) }, orderBy: { name: 'asc' }, take: params.limit ?? 10, select: { name: true, email: true, phone: true, city: true, taxNumber: true } });
    return clients.map(c => ({ name: c.name, email: c.email, phone: c.phone, ville: c.city, numeroTaxe: c.taxNumber }));
  }

  private async _getPayments(params: { clientName?: string; limit?: number }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const payments = await this.prisma.payment.findMany({ where: { deletedAt: null, ...(params.clientName ? { invoice: { client: { name: { contains: params.clientName, mode: 'insensitive' } } } } : {}) }, include: { invoice: { select: { number: true, totalTtc: true, client: { select: { name: true } } } } }, orderBy: { paymentDate: 'desc' }, take: params.limit ?? 10 });
    return payments.map(p => ({ facture: (p.invoice as any).number, client: (p.invoice as any).client.name, montantPaye: fmt(p.amount), methode: p.method, date: p.paymentDate }));
  }

  private async _getDashboardKpis() {
    const fmt = (n: unknown) => Number(n ?? 0);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const startOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const endOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
    const [total, unpaid, overdue, thisMonth, lastMonth] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' } }, _sum: { totalTtc: true, amountPaid: true, balanceDue: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { in: ['issued','partially_paid','overdue'] } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.invoice.count({ where: { deletedAt: null, status: 'overdue' } }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfMonth } }, _sum: { totalTtc: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { totalTtc: true } }),
    ]);
    const caMois = fmt(thisMonth._sum.totalTtc);
    const caPrec = fmt(lastMonth._sum.totalTtc);
    return { caMoisCourant: caMois, evolutionCAPct: caPrec > 0 ? Math.round((caMois - caPrec) / caPrec * 100) : null, caTotal: fmt(total._sum.totalTtc), impayes: fmt(unpaid._sum.balanceDue), nombreImpayees: unpaid._count, nombreEnRetard: overdue };
  }

  private async _getClientSummary(params: { clientName: string }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const client = await this.prisma.client.findFirst({ where: { deletedAt: null, name: { contains: params.clientName, mode: 'insensitive' } }, include: { invoices: { where: { deletedAt: null, status: { not: 'cancelled' } }, select: { number: true, status: true, type: true, issueDate: true, dueDate: true, totalTtc: true, amountPaid: true, balanceDue: true }, orderBy: { createdAt: 'desc' }, take: 10 } } });
    if (!client) return null;
    return { nom: client.name, email: client.email, totalFacture: (client as any).invoices.reduce((s: number, i: any) => s + fmt(i.totalTtc), 0), totalDu: (client as any).invoices.reduce((s: number, i: any) => s + fmt(i.balanceDue), 0), dernieresFactures: (client as any).invoices.map((i: any) => ({ numero: i.number, statut: i.status, totalTtc: fmt(i.totalTtc), solde: fmt(i.balanceDue) })) };
  }

  private async _getProductCatalog(params: { search?: string; name?: string; limit?: number }) {
    const fmt = (n: unknown) => Number(n ?? 0);
    const keyword = params.search ?? params.name;
    const products = await this.prisma.product.findMany({ where: { deletedAt: null, ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}) }, include: { category: { select: { name: true } } }, orderBy: { name: 'asc' }, take: params.limit ?? 20 });
    return products.map(p => ({ nom: p.name, categorie: (p.category as any)?.name ?? 'Sans catégorie', prix: fmt(p.unitPriceHt), unite: p.unit }));
  }

  private async _detectAnomalies() {
    const fmt = (n: unknown) => Number(n ?? 0);
    const anomalies: string[] = [];
    const avgResult = await this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' } }, _avg: { totalTtc: true } });
    const avg = fmt(avgResult._avg.totalTtc);
    if (avg > 0) {
      const lowInvoices = await this.prisma.invoice.findMany({ where: { deletedAt: null, status: { not: 'cancelled' }, totalTtc: { lt: avg * 0.1 } }, include: { client: { select: { name: true } } }, take: 3 });
      for (const inv of lowInvoices) anomalies.push(`Facture ${inv.number} (${(inv.client as any).name}) : ${fmt(inv.totalTtc).toLocaleString('fr-FR')} XAF — moins de 10% de la moyenne.`);
    }
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const inactiveClients = await this.prisma.client.findMany({ where: { deletedAt: null, invoices: { none: { createdAt: { gte: ninetyDaysAgo }, deletedAt: null } } }, select: { name: true }, take: 3 });
    for (const c of inactiveClients) anomalies.push(`Client ${c.name} : aucune facture depuis plus de 90 jours.`);
    return anomalies.length > 0 ? anomalies : ['Aucune anomalie détectée.'];
  }
}

// ── Constantes LLM (copier telles quelles depuis ai.service.ts Express) ─────
// BTS_CORE_PROMPT, USAGE_GUIDE, INTENT_SYSTEM_PROMPT
// buildRoleContext(), buildSystemPrompt()
// Ces constantes/fonctions ne dépendent pas de DI → restent en module-level
const INTENT_SYSTEM_PROMPT = `Tu es un dispatcher pour InvoiceHub. /* ... copier complet depuis ai.service.ts ... */`;
function buildSystemPrompt(userName?: string, userRole?: string, includeGuide = false): string { return ''; /* copier depuis ai.service.ts */ }
```

### 8.2 AiController

```typescript
// src/modules/ai/ai.controller.ts
import { Controller, Get, Post, Req, Res, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import { AiService } from './ai.service';
import { chatRequestSchema } from './ai.schema';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('status')
  async status() {
    return this.aiService.getStatus();
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @SkipResponseWrapper()
  async chat(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    const { messages, context, userName, userRole } = chatRequestSchema.parse(body);
    const useStream = req.headers['accept'] === 'text/event-stream';

    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let clientDisconnected = false;
      req.on('close', () => { clientDisconnected = true; });

      try {
        for await (const token of this.aiService.chatStream(messages, context, userName, userRole)) {
          if (clientDisconnected) break;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
        if (!clientDisconnected) res.write('data: [DONE]\n\n');
      } catch (err: unknown) {
        if (!clientDisconnected) res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur interne' })}\n\n`);
      } finally {
        res.end();
      }
    } else {
      const reply = await this.aiService.chat(messages, context, userName, userRole);
      res.json({ success: true, data: { reply } });
    }
  }
}
```

### 8.3 AiModule

```typescript
// src/modules/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  // ThrottlerModule est généralement configuré globalement dans AppModule
  // Si besoin local : imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])]
  providers:   [AiService],
  controllers: [AiController],
})
export class AiModule {}
```

---

## 9. AppModule — mise à jour finale

```typescript
// src/app.module.ts — section imports (ajouter après Phase 6)
import { ThrottlerModule }          from '@nestjs/throttler';
import { DashboardModule }          from './modules/dashboard/dashboard.module';
import { SearchModule }             from './modules/search/search.module';
import { ReportsModule }            from './modules/reports/reports.module';
import { AuditModule }              from './modules/audit/audit.module';
import { BackupsModule }            from './modules/backups/backups.module';
import { SettingsModule }           from './modules/settings/settings.module';
import { SettingsAdvancedModule }   from './modules/settings-advanced/settings-advanced.module';
import { AiModule }                 from './modules/ai/ai.module';

@Module({
  imports: [
    // ... modules Phase 1-6 déjà présents ...

    // Phase 7 — Throttler global (requis pour AiController @Throttle)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // défaut général

    // Phase 7 — Modules transversaux
    DashboardModule,
    SearchModule,
    ReportsModule,
    AuditModule,
    BackupsModule,
    SettingsModule,
    SettingsAdvancedModule,
    AiModule,
  ],
})
export class AppModule {}
```

---

## 10. Ordre de création des fichiers

```
src/core/guards/backup-rate-limit.guard.ts

src/modules/dashboard/dashboard.service.ts
src/modules/dashboard/dashboard.controller.ts
src/modules/dashboard/dashboard.module.ts

src/modules/search/search.parser.ts          ← copie identique de search.parser.ts Express
src/modules/search/search.service.ts
src/modules/search/search.controller.ts
src/modules/search/search.module.ts

src/modules/reports/reports.renderer.ts      ← copie identique de reports.renderer.ts Express
src/modules/reports/reports.service.ts
src/modules/reports/reports.controller.ts
src/modules/reports/reports.module.ts

src/modules/audit/audit.service.ts
src/modules/audit/audit.controller.ts
src/modules/audit/audit.module.ts

src/modules/backups/storage.ts               ← copie identique de storage.ts Express
src/modules/backups/backups.service.ts
src/modules/backups/backup.processor.ts
src/modules/backups/backups.controller.ts
src/modules/backups/backups.module.ts

src/modules/settings/settings.schema.ts     ← copie identique de settings.schema.ts Express
src/modules/settings/settings.service.ts
src/modules/settings/settings.controller.ts
src/modules/settings/settings.module.ts

src/modules/settings-advanced/settings-advanced.schema.ts  ← copie identique
src/modules/settings-advanced/settings-advanced.service.ts
src/modules/settings-advanced/webhooks.controller.ts
src/modules/settings-advanced/api-keys.controller.ts
src/modules/settings-advanced/custom-fields.controller.ts
src/modules/settings-advanced/workflow-rules.controller.ts
src/modules/settings-advanced/ip-whitelist.controller.ts
src/modules/settings-advanced/export-jobs.controller.ts
src/modules/settings-advanced/settings-advanced.module.ts

src/modules/ai/ai.schema.ts                 ← copie identique de ai.schema.ts Express
src/modules/ai/ai.service.ts                ← FUSION ai.service.ts + ai.tools.ts
src/modules/ai/ai.controller.ts
src/modules/ai/ai.module.ts

src/app.module.ts                           ← ajouter 8 imports
```

---
         
## 11. Table des pièges

| # | Piège | Solution |
|---|---|---|
| 1 | `DashboardService.invalidateCache()` était **static** en Express | Méthode d'instance en NestJS ; DashboardModule l'exporte ; autres modules émettent un event via `EventEmitter2` plutôt que d'importer DashboardModule (évite dépendances circulaires) |
| 2 | `reports.renderer.ts` importé comme `@Injectable` | Copie pure TS — `import { fmt, reportHtml, ... } from './reports.renderer'` directement dans ReportsController |
| 3 | `search.parser.ts` importé comme `@Injectable` | Copie pure TS — import direct dans SearchService |
| 4 | `ai.tools.ts` importé directement (dépend de `prisma` global) | Fonctions pliées en méthodes privées de `AiService` qui injecte `PrismaService` |
| 5 | AI SSE : utiliser `@Res({ passthrough: true })` | Doit être `@Res()` (sans passthrough) — `res.write()` + `res.end()` sont incompatibles avec le mode passthrough |
| 6 | Reports : `@Res({ passthrough: true })` | Doit être `@Res()` sans passthrough + `@SkipResponseWrapper()` — les 8 méthodes finalisent la réponse directement (`res.json()` / `res.end()`) |
| 7 | Backup download : `fs.createReadStream().pipe(res)` fonctionne-t-il en NestJS ? | Oui, avec `@Res() res: Response` (Express Response). La redirection S3 via `res.redirect(302, url)` aussi. |
| 8 | `BackupRateLimitGuard` injecte `REDIS_CLIENT` | BackupsModule doit fournir `{ provide: 'REDIS_CLIENT', useValue: redisConnection }` ET déclarer `BackupRateLimitGuard` dans providers |
| 9 | 6 controllers SettingsAdvanced dans 1 Module | Tous listés dans `controllers: [Webhooks, ApiKeys, Custom, Workflow, IpWhitelist, ExportJobs]` — manquer l'un = routes 404 silencieuses |
| 10 | `ThrottlerGuard` sur AI chat : `@Throttle({ default: { limit: 20, ttl: 60_000 } })` | `ThrottlerModule.forRoot()` doit être dans AppModule ; sans ça la décoration `@Throttle` est ignorée silencieusement |
| 11 | SettingsController.update() : l'`AuditInterceptor` a besoin de `auditPreviousData` | Capturer avant `update()` : `req['auditPreviousData'] = await this.settingsService.get()` avant le parse/update |
| 12 | `ExportJobsController.downloadExport()` utilise `res.sendFile(absolutePath)` | Requiert un chemin **absolu** ; `path.join(process.cwd(), job.filePath)` — vérifier `fs.existsSync` avant |
