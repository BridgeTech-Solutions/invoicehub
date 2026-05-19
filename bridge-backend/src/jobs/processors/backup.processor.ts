/**
 * @module jobs/processors/backup
 * Worker BullMQ pour l'exécution des backups PostgreSQL.
 *
 * Appelé par le backupWorker pour chaque job de la queue `backup`.
 * Délègue toute la logique à backupsService.runBackup().
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { backupsService, generateFilename } from '../../modules/backups/backups.service';
import { logger } from '../../core/middleware/requestLogger';

export interface BackupJobData {
  backupId: string;
}

export async function processBackupJob(job: Job<BackupJobData>): Promise<void> {
  let backupId = job.data.backupId;

  // Cron automatique : créer l'enregistrement Backup maintenant
  if (!backupId) {
    const filename = generateFilename();
    const backup = await prisma.backup.create({
      data: { filename, storageDisk: env.BACKUP_STORAGE_DISK, status: 'pending', type: 'scheduled' },
    });
    backupId = backup.id;
    logger.info(`[backup] Backup automatique créé : ${backupId} (${filename})`);
  }

  logger.info(`[backup] Démarrage backup ${backupId}`);
  await backupsService.runBackup(backupId);
  logger.info(`[backup] Backup ${backupId} terminé avec succès`);
}
