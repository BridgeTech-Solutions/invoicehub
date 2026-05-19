import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { createWriteStream, createReadStream } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { format } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { getStorageAdapter } from './storage';
import { BACKUP_QUEUE } from '../../jobs/constants';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    @InjectQueue(BACKUP_QUEUE) private readonly backupQueue: Queue,
  ) {}

  generateFilename(): string {
    const ts = format(new Date(), 'yyyyMMdd_HHmmss');
    return this.config.get<boolean>('BACKUP_INCLUDE_FILES')
      ? `invoicehub_full_${ts}.tar.gz`
      : `invoicehub_db_${ts}.sql.gz`;
  }

  async trigger(userId: string) {
    const inProgress = await this.prisma.backup.findFirst({
      where: { status: { in: ['pending', 'running'] } },
    });
    if (inProgress) {
      throw AppError.conflict(
        `Un backup est déjà en cours (statut : ${inProgress.status}). Attendez sa fin avant d'en lancer un nouveau.`,
      );
    }

    const filename = this.generateFilename();
    const backup   = await this.prisma.backup.create({
      data: {
        filename,
        storageDisk: this.config.get<string>('BACKUP_STORAGE_DISK', 'local'),
        status:      'pending',
        type:        'manual',
        createdById: userId,
      },
      include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });

    await this.backupQueue.add('backup', { backupId: backup.id }, {
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 100 },
    });

    return this.formatBackup(backup);
  }

  async list(params: { page?: number; limit?: number; status?: string }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const skip  = (page - 1) * limit;
    const where = params.status ? { status: params.status as any } : {};

    const [total, backups] = await Promise.all([
      this.prisma.backup.count({ where }),
      this.prisma.backup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    return { data: backups.map(b => this.formatBackup(b)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const backup = await this.prisma.backup.findUnique({
      where: { id },
      include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!backup) throw AppError.notFound('Backup introuvable');
    return this.formatBackup(backup);
  }

  async getDownloadInfo(id: string): Promise<{ url: string | null; localPath: string | null; filename: string }> {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status !== 'success') throw AppError.badRequest('Le backup n\'est pas encore disponible');

    const adapter     = getStorageAdapter(this.config);
    const storagePath = backup.storagePath ?? '';
    const url         = await adapter.getDownloadUrl(storagePath);
    const localPath   = adapter.getLocalPath(storagePath);

    if (localPath && backup.checksum && fs.existsSync(localPath)) {
      const computed = await this.computeSha256(localPath);
      if (computed !== backup.checksum) {
        this.logger.error(`[Backup] Intégrité corrompue pour ${backup.filename}`);
        throw AppError.internal(
          `Le fichier de backup ${backup.filename} est corrompu (checksum invalide). Veuillez créer un nouveau backup.`,
        );
      }
    }

    return { url, localPath, filename: backup.filename };
  }

  async delete(id: string): Promise<void> {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status === 'running') throw AppError.badRequest('Impossible de supprimer un backup en cours d\'exécution');

    if (backup.storagePath) {
      const adapter = getStorageAdapter(this.config);
      await adapter.delete(backup.storagePath).catch(() => {});
    }
    await this.prisma.backup.delete({ where: { id } });
  }

  async runBackup(backupId: string): Promise<void> {
    await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'running', startedAt: new Date() } });

    const backupDir = path.resolve(process.cwd(), this.config.get<string>('BACKUP_DIR', './uploads/backups'));
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const tempDir = path.join(backupDir, `tmp_${backupId}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const backup  = await this.prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
      const db      = this.parseDatabaseUrl();
      const adapter = getStorageAdapter(this.config);

      const archivePath = path.join(backupDir, `${backup.filename}.tmp`);

      if (this.config.get<boolean>('BACKUP_INCLUDE_FILES')) {
        const sqlPath    = path.join(tempDir, 'database.sql');
        const uploadsDir = path.resolve(process.cwd(), this.config.get<string>('UPLOADS_DIR', './uploads'));
        await this.dumpDatabase(db, sqlPath, false);
        await this.createTarGz(archivePath, tempDir, 'database.sql', uploadsDir);
      } else {
        await this.dumpDatabase(db, archivePath, true);
      }

      const stat        = fs.statSync(archivePath);
      const checksum    = await this.computeSha256(archivePath);
      const storagePath = await adapter.upload(archivePath, backup.filename);

      await this.prisma.backup.update({
        where: { id: backupId },
        data:  { status: 'success', storagePath, sizeBytes: stat.size, checksum, completedAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.backup.update({
        where: { id: backupId },
        data:  { status: 'failed', errorMessage: err?.message ?? 'Erreur inconnue', completedAt: new Date() },
      });
      throw err;
    } finally {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      await this.purgeOldBackups();
    }
  }

  async purgeOldBackups(): Promise<void> {
    const retentionDays = this.config.get<number>('BACKUP_RETENTION_DAYS', 30);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const old = await this.prisma.backup.findMany({ where: { createdAt: { lt: cutoff }, status: 'success' } });
    for (const b of old) {
      if (b.storagePath) {
        const adapter = getStorageAdapter(this.config);
        await adapter.delete(b.storagePath).catch(() => {});
      }
      await this.prisma.backup.delete({ where: { id: b.id } }).catch(() => {});
    }
  }

  private parseDatabaseUrl() {
    const url = new URL(this.config.getOrThrow<string>('DATABASE_URL'));
    return {
      host:     url.hostname,
      port:     url.port || '5432',
      user:     url.username,
      password: decodeURIComponent(url.password),
      dbName:   url.pathname.replace(/^\//, ''),
    };
  }

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash   = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end',  ()    => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async dumpDatabase(
    db: { host: string; port: string; user: string; password: string; dbName: string },
    outputPath: string,
    gzipOutput = true,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseArgs = ['-U', db.user, '-d', db.dbName, '--no-password', '-F', 'p', '-v'];
      const dockerContainer = this.config.get<string>('PGDUMP_DOCKER_CONTAINER');
      const pgdumpPath      = this.config.get<string>('PGDUMP_PATH', 'pg_dump');

      let pgdump: ReturnType<typeof spawn>;
      if (dockerContainer) {
        pgdump = spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${db.password}`, dockerContainer, 'pg_dump', ...baseArgs], { env: process.env });
      } else {
        pgdump = spawn(pgdumpPath, ['-h', db.host, '-p', db.port, ...baseArgs], { env: { ...process.env, PGPASSWORD: db.password } });
      }

      if (!pgdump.stdout) { reject(new Error('pg_dump stdout is null')); return; }

      const output = createWriteStream(outputPath);
      const p = gzipOutput
        ? pipeline(pgdump.stdout, createGzip({ level: 6 }), output)
        : pipeline(pgdump.stdout, output);

      p.then(resolve).catch(reject);
      pgdump.on('error', reject);
      pgdump.on('close', (code) => { if (code !== 0) reject(new Error(`pg_dump a terminé avec le code ${code}`)); });
    });
  }

  private createTarGz(outputPath: string, sqlDir: string, sqlFilename: string, uploadsDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-czf', outputPath, '-C', sqlDir, sqlFilename];
      if (fs.existsSync(uploadsDir)) {
        args.push('-C', path.dirname(uploadsDir), path.basename(uploadsDir));
      }
      const tar = spawn('tar', args);
      tar.on('error', reject);
      tar.stderr?.on('data', () => {});
      tar.on('close', (code) => { if (code !== 0) reject(new Error(`tar a terminé avec le code ${code}`)); else resolve(); });
    });
  }

  private formatBackup(b: any) {
    const sizeBytes   = b.sizeBytes ? Number(b.sizeBytes) : null;
    const completedAt = b.completedAt ? new Date(b.completedAt) : null;
    const createdAt   = new Date(b.createdAt);
    const durationSec = completedAt ? Math.round((completedAt.getTime() - createdAt.getTime()) / 1000) : null;
    return {
      id:              b.id,
      filename:        b.filename,
      storageDisk:     b.storageDisk,
      storagePath:     b.storagePath,
      sizeBytes,
      sizeMb:          sizeBytes ? (sizeBytes / 1024 / 1024).toFixed(2) : null,
      status:          b.status,
      errorMessage:    b.errorMessage,
      createdAt:       b.createdAt,
      completedAt:     b.completedAt,
      durationSeconds: durationSec,
      createdBy:       b.createdBy ?? null,
    };
  }
}
