/**
 * @module jobs/queues
 * Définitions des files d'attente BullMQ et types de données des jobs.
 *
 * Queues disponibles :
 *  - `email`        — Envoi d'emails SMTP (avec retry automatique)
 *  - `notification` — Création de notifications in-app + email conditionnel
 *  - `overdue`      — Cron : détection des factures en retard et proformas expirées
 *  - `recurring`    — Cron : génération des factures récurrentes
 *  - `reminder`     — Cron : envoi des rappels de paiement configurés
 */
import { Queue, ConnectionOptions } from 'bullmq';
import { redisConnection } from '../config/redis';

// ---------------------------------------------------------------------------
// Types de données des jobs
// ---------------------------------------------------------------------------

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface NotificationJobData {
  userId: string;
  /** Valeur de l'enum NotificationStatus Prisma */
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface OverdueJobData {
  triggeredAt: string;
}

export interface RecurringJobData {
  triggeredAt: string;
}

export interface ReminderJobData {
  triggeredAt: string;
}

export interface BackupJobData {
  backupId: string;
}

export interface CleanupJobData {
  triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Instances de queues
// ---------------------------------------------------------------------------

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export const emailQueue = new Queue<EmailJobData>('email', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});

export const notificationQueue = new Queue<NotificationJobData>('notification', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
    backoff: { type: 'fixed', delay: 2_000 },
  },
});

export const overdueQueue = new Queue<OverdueJobData>('overdue', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5 * 60_000 }, // 5min → 10min entre chaque tentative
  },
});

export const recurringQueue = new Queue<RecurringJobData>('recurring', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  },
});

export const reminderQueue = new Queue<ReminderJobData>('reminder', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  },
});

export const backupQueue = new Queue<BackupJobData>('backup', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 1, // Pas de retry automatique pour les backups (risque de doublons)
  },
});

export const cleanupQueue = new Queue<CleanupJobData>('cleanup', {
  connection: redisConnection as unknown as ConnectionOptions,
  defaultJobOptions,
});
