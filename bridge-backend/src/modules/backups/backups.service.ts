/**
 * @module modules/backups/backups.service.ts
 * Gestion des sauvegardes PostgreSQL : déclenchement, suivi, téléchargement, suppression.
 *
 * Le backup lui-même est exécuté dans un worker BullMQ (backup.processor.ts).
 * Ce service expose la logique métier partagée entre le controller et le worker.
 */
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { createWriteStream, createReadStream } from 'fs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { format } from 'date-fns';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';
import { getStorageAdapter } from './storage';
import { backupQueue } from '../../jobs/queues';
import { logger } from '../../core/middleware/requestLogger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDatabaseUrl() {
  const url = new URL(env.DATABASE_URL);
  return {
    host:     url.hostname,
    port:     url.port || '5432',
    user:     url.username,
    password: decodeURIComponent(url.password),
    dbName:   url.pathname.replace(/^\//, ''),
  };
}

/** Génère le nom de fichier selon le type de backup. */
function generateFilename(): string {
  const ts = format(new Date(), 'yyyyMMdd_HHmmss');
  return env.BACKUP_INCLUDE_FILES
    ? `invoicehub_full_${ts}.tar.gz`
    : `invoicehub_db_${ts}.sql.gz`;
}

export { generateFilename };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BackupsService {

  /** Crée un enregistrement Backup pending et enqueue le job BullMQ. */
  async trigger(userId: string) {
    // Empêche de lancer plusieurs backups simultanément
    const inProgress = await prisma.backup.findFirst({
      where: { status: { in: ['pending', 'running'] } },
    });
    if (inProgress) {
      throw AppError.conflict(
        `Un backup est déjà en cours (statut : ${inProgress.status}). Attendez sa fin avant d'en lancer un nouveau.`,
      );
    }

    const filename = generateFilename();

    const backup = await prisma.backup.create({
      data: {
        filename,
        storageDisk:  env.BACKUP_STORAGE_DISK,
        status:       'pending',
        type:         'manual',
        createdById:  userId,
      },
      include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });

    await backupQueue.add('backup', { backupId: backup.id }, {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    });

    return this.formatBackup(backup);
  }

  /** Liste paginée des backups. */
  async list(params: { page?: number; limit?: number; status?: string }) {
    const page  = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const skip  = (page - 1) * limit;

    const where = params.status ? { status: params.status as any } : {};

    const [total, backups] = await Promise.all([
      prisma.backup.count({ where }),
      prisma.backup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    const data = backups.map(b => this.formatBackup(b));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Détail d'un backup. */
  async findById(id: string) {
    const backup = await prisma.backup.findUnique({
      where: { id },
      include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!backup) throw AppError.notFound('Backup introuvable');
    return this.formatBackup(backup);
  }

  /**
   * Retourne un URL de téléchargement.
   * - local  : null  (le controller streame le fichier directement)
   * - s3/gcs : URL signé (expire 5min)
   *
   * Pour le stockage local, vérifie l'intégrité SHA-256 avant de servir le fichier.
   */
  async getDownloadInfo(id: string): Promise<{ url: string | null; localPath: string | null; filename: string }> {
    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status !== 'success') throw AppError.badRequest('Le backup n\'est pas encore disponible');

    const adapter     = getStorageAdapter();
    const storagePath = backup.storagePath ?? '';
    const url         = await adapter.getDownloadUrl(storagePath);
    const localPath   = adapter.getLocalPath(storagePath);

    // Vérification d'intégrité SHA-256 pour le stockage local uniquement
    if (localPath && backup.checksum && fs.existsSync(localPath)) {
      const computed = await this.computeSha256(localPath);
      if (computed !== backup.checksum) {
        logger.error(`[Backup] Intégrité corrompue pour ${backup.filename}`, {
          backupId:         backup.id,
          storedChecksum:   backup.checksum,
          computedChecksum: computed,
        });
        throw AppError.internal(
          `Le fichier de backup ${backup.filename} est corrompu (checksum invalide). Veuillez créer un nouveau backup.`,
        );
      }
    }

    return { url, localPath, filename: backup.filename };
  }

  /** Supprime le fichier ET l'enregistrement en base. */
  async delete(id: string): Promise<void> {
    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) throw AppError.notFound('Backup introuvable');
    if (backup.status === 'running') throw AppError.badRequest('Impossible de supprimer un backup en cours d\'exécution');

    if (backup.storagePath) {
      const adapter = getStorageAdapter();
      await adapter.delete(backup.storagePath).catch(() => {}); // Ignorer si déjà supprimé
    }

    await prisma.backup.delete({ where: { id } });
  }

  // ── Logique d'exécution du backup (appelée depuis le worker BullMQ) ───────

  async runBackup(backupId: string): Promise<void> {
    await prisma.backup.update({ where: { id: backupId }, data: { status: 'running', startedAt: new Date() } });

    const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Dossier temporaire isolé pour ce job
    const tempDir = path.join(backupDir, `tmp_${backupId}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const backup  = await prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
      const db      = parseDatabaseUrl();
      const adapter = getStorageAdapter();

      const archivePath = path.join(backupDir, `${backup.filename}.tmp`);

      if (env.BACKUP_INCLUDE_FILES) {
        // ── Backup complet : BD + uploads ────────────────────────────────
        const sqlPath    = path.join(tempDir, 'database.sql');
        const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);

        // 1. Dump SQL brut (sans gzip — sera compressé dans le tar)
        await this.dumpDatabase(db, sqlPath, false);

        // 2. Archive tar.gz : database.sql + uploads/
        await this.createTarGz(archivePath, tempDir, 'database.sql', uploadsDir);

      } else {
        // ── Backup BD uniquement ──────────────────────────────────────────
        await this.dumpDatabase(db, archivePath, true);
      }

      const stat        = fs.statSync(archivePath);
      const checksum    = await this.computeSha256(archivePath);
      const storagePath = await adapter.upload(archivePath, backup.filename);

      await prisma.backup.update({
        where: { id: backupId },
        data:  { status: 'success', storagePath, sizeBytes: stat.size, checksum, completedAt: new Date() },
      });

    } catch (err: any) {
      await prisma.backup.update({
        where: { id: backupId },
        data:  { status: 'failed', errorMessage: err?.message ?? 'Erreur inconnue', completedAt: new Date() },
      });
      throw err;
    } finally {
      // Nettoyage du dossier temporaire dans tous les cas
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      await this.purgeOldBackups();
    }
  }

  // ── Checksum SHA-256 ─────────────────────────────────────────────────────

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash   = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end',  ()    => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // ── pg_dump ───────────────────────────────────────────────────────────────

  private async dumpDatabase(
    db: { host: string; port: string; user: string; password: string; dbName: string },
    outputPath: string,
    gzipOutput: boolean = true,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseArgs = ['-U', db.user, '-d', db.dbName, '--no-password', '-F', 'p', '-v'];

      let pgdump: ReturnType<typeof spawn>;
      if (env.PGDUMP_DOCKER_CONTAINER) {
        pgdump = spawn('docker', [
          'exec', '-i',
          '-e', `PGPASSWORD=${db.password}`,
          env.PGDUMP_DOCKER_CONTAINER,
          'pg_dump', ...baseArgs,
        ], { env: process.env });
      } else {
        pgdump = spawn(env.PGDUMP_PATH, ['-h', db.host, '-p', db.port, ...baseArgs], {
          env: { ...process.env, PGPASSWORD: db.password },
        });
      }

      if (!pgdump.stdout) { reject(new Error('pg_dump stdout is null')); return; }

      const output = createWriteStream(outputPath);
      const p = gzipOutput
        ? pipeline(pgdump.stdout, createGzip({ level: 6 }), output)
        : pipeline(pgdump.stdout, output);

      p.then(resolve).catch(reject);

      pgdump.on('error', reject);
      pgdump.on('close', (code) => {
        if (code !== 0) reject(new Error(`pg_dump a terminé avec le code ${code}`));
      });
    });
  }

  // ── Archive tar.gz : BD + uploads ────────────────────────────────────────

  private createTarGz(
    outputPath: string,
    sqlDir: string,
    sqlFilename: string,
    uploadsDir: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['-czf', outputPath, '-C', sqlDir, sqlFilename];

      // Inclure uploads/ seulement s'il existe et n'est pas vide
      if (fs.existsSync(uploadsDir)) {
        const uploadsParent = path.dirname(uploadsDir);
        const uploadsDirName = path.basename(uploadsDir);
        args.push('-C', uploadsParent, uploadsDirName);
      }

      const tar = spawn('tar', args);

      tar.on('error', reject);
      tar.stderr?.on('data', () => {}); // progression tar → ignorée
      tar.on('close', (code) => {
        if (code !== 0) reject(new Error(`tar a terminé avec le code ${code}`));
        else resolve();
      });
    });
  }

  // ── Rétention automatique ─────────────────────────────────────────────────

  async purgeOldBackups(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - env.BACKUP_RETENTION_DAYS);

    const old = await prisma.backup.findMany({
      where: { createdAt: { lt: cutoff }, status: 'success' },
    });

    for (const b of old) {
      if (b.storagePath) {
        const adapter = getStorageAdapter();
        await adapter.delete(b.storagePath).catch(() => {});
      }
      await prisma.backup.delete({ where: { id: b.id } }).catch(() => {});
    }
  }

  // ── Formatage ─────────────────────────────────────────────────────────────

  private formatBackup(b: any) {
    const sizeBytes    = b.sizeBytes ? Number(b.sizeBytes) : null;
    const completedAt  = b.completedAt ? new Date(b.completedAt) : null;
    const createdAt    = new Date(b.createdAt);
    const durationSec  = completedAt ? Math.round((completedAt.getTime() - createdAt.getTime()) / 1000) : null;

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

export const backupsService = new BackupsService();
