/**
 * @module jobs/scheduler
 * Planification des crons quotidiens via BullMQ répétables (repeat).
 *
 * Les jobs répétables sont stockés dans Redis et survivent aux redémarrages.
 * L'appel à `upsertJobScheduler` garantit l'idempotence : une seule entrée
 * par cron même si le serveur redémarre plusieurs fois.
 *
 * Crons configurés :
 *  - overdue      : 07:45 UTC (08:45 WAT) — marque les factures/proformas en retard
 *  - recurring    : 07:50 UTC (08:50 WAT) — génère les factures récurrentes du jour
 *  - reminder     : 08:00 UTC (09:00 WAT) — vérification active + rappels internes
 *  - backup       : 16:30 UTC             — pg_dump automatique
 */
import { overdueQueue, recurringQueue, reminderQueue, backupQueue, cleanupQueue, approvalQueue } from './queues';
import { env } from '../config/env';
import { logger } from '../core/middleware/requestLogger';

export async function scheduleJobs(): Promise<void> {
  // Overdue — tous les jours à 07:45 UTC (08:45 WAT) — avant le reminder
  await overdueQueue.upsertJobScheduler(
    'overdue-daily',
    { pattern: '45 7 * * *' },
    {
      name: 'overdue',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Recurring — tous les jours à 07:50 UTC (08:50 WAT) — avant le reminder
  await recurringQueue.upsertJobScheduler(
    'recurring-daily',
    { pattern: '50 7 * * *' },
    {
      name: 'recurring',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  // Reminders — tous les jours à 08:00 UTC = 09:00 WAT (Cameroun)
  await reminderQueue.upsertJobScheduler(
    'reminder-daily',
    { pattern: '0 8 * * *' },
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

  // Cleanup — tous les vendredis à 15:00 UTC (16:00 WAT Cameroun) — purge notifications lues > 90 jours
  await cleanupQueue.upsertJobScheduler(
    'cleanup-weekly',
    { pattern: '0 15 * * 5' },
    {
      name: 'cleanup',
      data: { triggeredAt: '' },
      opts: { removeOnComplete: true, removeOnFail: { count: 5 } },
    },
  );

  // Approval expiry check — toutes les heures
  await approvalQueue.upsertJobScheduler(
    'approval-hourly',
    { pattern: '0 * * * *' },
    {
      name: 'check-expired',
      data: { type: 'check-expired' },
      opts: { removeOnComplete: true, removeOnFail: { count: 10 } },
    },
  );

  logger.info(`Crons BullMQ planifiés (overdue 07:45, recurring 07:50, reminder 08:00 UTC / backup 16:30 UTC / cleanup ven. 15:00 UTC = 16:00 WAT / approval expiry toutes les heures)`);
}
