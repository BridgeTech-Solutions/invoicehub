/**
 * @module jobs/scheduler
 * Planification des crons quotidiens via BullMQ répétables (repeat).
 *
 * Les jobs répétables sont stockés dans Redis et survivent aux redémarrages.
 * L'appel à `upsertJobScheduler` garantit l'idempotence : une seule entrée
 * par cron même si le serveur redémarre plusieurs fois.
 *
 * Crons configurés :
 *  - overdue   : 00:05 UTC — marque les factures/proformas en retard
 *  - recurring : 00:10 UTC — génère les factures récurrentes du jour
 *  - reminder  : 00:15 UTC — envoie les rappels de paiement
 *  - backup    : BACKUP_CRON (défaut 00:00 UTC) — pg_dump automatique
 */
import { overdueQueue, recurringQueue, reminderQueue, backupQueue } from './queues';
import { env } from '../config/env';
import { logger } from '../core/middleware/requestLogger';

export async function scheduleJobs(): Promise<void> {
  // Overdue — tous les jours à 00:05 UTC
  await overdueQueue.upsertJobScheduler(
    'overdue-daily',
    { pattern: '5 0 * * *' },
    {
      name: 'overdue',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Recurring — tous les jours à 00:10 UTC
  await recurringQueue.upsertJobScheduler(
    'recurring-daily',
    { pattern: '10 0 * * *' },
    {
      name: 'recurring',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Reminders — tous les jours à 00:15 UTC
  await reminderQueue.upsertJobScheduler(
    'reminder-daily',
    { pattern: '15 0 * * *' },
    {
      name: 'reminder',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Backup automatique — cron configurable via BACKUP_CRON (défaut : minuit UTC)
  await backupQueue.upsertJobScheduler(
    'backup-daily',
    { pattern: env.BACKUP_CRON },
    {
      name: 'backup',
      data: { backupId: '' }, // backupId sera créé par le processor
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  logger.info(`Crons BullMQ planifiés (overdue 00:05, recurring 00:10, reminders 00:15, backup "${env.BACKUP_CRON}" UTC)`);
}
