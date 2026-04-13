/**
 * @module jobs/processors/cleanup
 * Cron hebdomadaire : purge des anciennes notifications lues.
 *
 * Traitement :
 *  - Notifications `isRead: true` créées il y a plus de 90 jours → suppression définitive
 *
 * Les notifications non lues ne sont jamais supprimées automatiquement.
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { logger } from '../../core/middleware/requestLogger';
import type { CleanupJobData } from '../queues';

const NOTIFICATION_RETENTION_DAYS = 90;

export async function processCleanupJob(_job: Job<CleanupJobData>): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NOTIFICATION_RETENTION_DAYS);

  const { count } = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: cutoff },
    },
  });

  logger.info(`[Cleanup] ${count} notification(s) lues de plus de ${NOTIFICATION_RETENTION_DAYS} jours supprimées`);
}
