/**
 * @module jobs/workers
 * Démarrage et arrêt des workers BullMQ.
 *
 * Chaque worker écoute sa queue et traite les jobs en appelant le processeur
 * correspondant. Les workers sont démarrés une seule fois au lancement du
 * serveur et fermés proprement lors du graceful shutdown.
 */
import { Worker, ConnectionOptions } from 'bullmq';
import { redisConnection } from '../config/redis';
import { logger } from '../core/middleware/requestLogger';

import { processEmailJob }        from './processors/email.processor';
import { processNotificationJob } from './processors/notification.processor';
import { processOverdueJob }      from './processors/overdue.processor';
import { processRecurringJob }    from './processors/recurring.processor';
import { processReminderJob }     from './processors/reminder.processor';
import { processBackupJob }      from './processors/backup.processor';
import { processCleanupJob }     from './processors/cleanup.processor';

let workers: Worker[] = [];

export function startWorkers(): void {
  const emailWorker = new Worker('email', processEmailJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 5,
  });

  const notificationWorker = new Worker('notification', processNotificationJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 10,
  });

  const overdueWorker = new Worker('overdue', processOverdueJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 1,
  });

  const recurringWorker = new Worker('recurring', processRecurringJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 1,
  });

  const reminderWorker = new Worker('reminder', processReminderJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 1,
  });

  const backupWorker = new Worker('backup', processBackupJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 1, // Un seul backup à la fois pour éviter la surcharge
  });

  const cleanupWorker = new Worker('cleanup', processCleanupJob, {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 1,
  });

  workers = [emailWorker, notificationWorker, overdueWorker, recurringWorker, reminderWorker, backupWorker, cleanupWorker];

  for (const worker of workers) {
    worker.on('completed', (job) => {
      logger.debug(`[Worker:${worker.name}] Job ${job.id} terminé`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Worker:${worker.name}] Job ${job?.id} échoué`, {
        error: err.message,
        data: job?.data,
      });
    });
  }

  logger.info(`${workers.length} workers BullMQ démarrés`);
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map(w => w.close()));
  logger.info('Workers BullMQ arrêtés');
}
