import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Écoute les échecs définitifs sur les queues critiques (email + notification +
 * approval) et les persiste dans audit_logs. Un échec est « définitif » quand
 * le job a épuisé tous ses retries (attemptsMade >= maxAttempts).
 *
 * Les queues opérationnelles (overdue, recurring, reminder, backup, cleanup,
 * export, bank-import) ne sont pas couvertes : un échec ponctuel de cron est
 * auto-résolu au prochain cycle. Seuls les jobs à données uniques (emails,
 * notifs) méritent une trace durable.
 */

const CRITICAL_QUEUES = ['email', 'notification', 'approval'] as const;

@Injectable()
export class JobFailureListener implements OnModuleInit {
  private readonly logger = new Logger(JobFailureListener.name);
  private readonly queueEvents: QueueEvents[] = [];

  constructor(
    @InjectQueue('email')        private readonly emailQueue:        Queue,
    @InjectQueue('notification') private readonly notificationQueue: Queue,
    @InjectQueue('approval')     private readonly approvalQueue:     Queue,
    private readonly prisma:   PrismaService,
    private readonly config:   ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const queues: Record<string, Queue> = {
      email:        this.emailQueue,
      notification: this.notificationQueue,
      approval:     this.approvalQueue,
    };

    for (const name of CRITICAL_QUEUES) {
      const qe = new QueueEvents(name, { connection: { url: redisUrl } });

      qe.on('failed', async ({ jobId, failedReason }) => {
        try {
          const job = await queues[name].getJob(jobId);
          if (!job) return;

          const maxAttempts = job.opts?.attempts ?? 1;
          // On ne logue que l'échec DÉFINITIF (plus de retry possible).
          if (job.attemptsMade < maxAttempts) return;

          const payload = {
            queue:        name,
            jobId,
            jobName:      job.name,
            attemptsMade: job.attemptsMade,
            maxAttempts,
            failedReason,
            jobData:      job.data,
          };

          this.logger.error(
            `[JobFailure] Queue="${name}" job="${job.name}" id=${jobId} ` +
            `après ${job.attemptsMade} essai(s) : ${failedReason}`,
          );

          // Persistance dans audit_logs (immuable, déjà utilisé pour la piste d'audit).
          await this.prisma.auditLog.create({
            data: {
              action:     'JOB_FAILED',
              entityType: 'job_queue',
              entityId:   jobId,
              newState:   payload as any,
              // userId null : c'est un job système, pas une action utilisateur.
            },
          });
        } catch (e) {
          // Ne jamais lever d'erreur dans un listener d'événement BullMQ.
          this.logger.error(`[JobFailure] Erreur lors de la persistance de l'échec job ${jobId}`, e);
        }
      });

      this.queueEvents.push(qe);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.queueEvents.map(qe => qe.close()));
  }
}
