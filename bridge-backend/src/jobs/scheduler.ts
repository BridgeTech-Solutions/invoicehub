/**
 * @module jobs/scheduler
 * Planification des crons quotidiens via BullMQ répétables (repeat).
 *
 * Les jobs répétables sont stockés dans Redis et survivent aux redémarrages.
 * L'appel à `upsertJobScheduler` garantit l'idempotence : une seule entrée
 * par cron même si le serveur redémarre plusieurs fois.
 *
 * Crons configurés :
 *  - overdue      : 08:30 UTC — marque les factures/proformas en retard
 *  - recurring : 08:30 UTC — génère les factures récurrentes du jour
 *  - reminder  : 08:30 UTC — envoie les rappels de paiement
 *  - backup    : 16:30 UTC — pg_dump automatique
 */
import { overdueQueue, recurringQueue, reminderQueue, backupQueue } from './queues';
import { env } from '../config/env';
import { logger } from '../core/middleware/requestLogger';

export async function scheduleJobs(): Promise<void> {
  // Overdue — tous les jours à 08:30 UTC
  await overdueQueue.upsertJobScheduler(
    'overdue-daily',
    { pattern: '30 8 * * *' },
    {
      name: 'overdue',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Recurring — tous les jours à 08:30 UTC
  await recurringQueue.upsertJobScheduler(
    'recurring-daily',
    { pattern: '30 8 * * *' },
    {
      name: 'recurring',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Reminders — tous les jours à 08:30 UTC
  await reminderQueue.upsertJobScheduler(
    'reminder-daily',
    { pattern: '30 8 * * *' },
    {
      name: 'reminder',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Backup automatique — tous les jours à 16:30 UTC
  await backupQueue.upsertJobScheduler(
    'backup-daily',
    { pattern: '30 16 * * *' },
    {
      name: 'backup',
      data: { backupId: '' }, // backupId sera créé par le processor
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  logger.info(`Crons BullMQ planifiés (overdue/recurring/reminder 08:30 UTC, backup 16:30 UTC)`);
}
