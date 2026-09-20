import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CronScheduler {
  constructor(
    @InjectQueue('overdue')   private overdueQueue:   Queue,
    @InjectQueue('recurring') private recurringQueue: Queue,
    @InjectQueue('reminder')  private reminderQueue:  Queue,
    @InjectQueue('backup')    private backupQueue:    Queue,
    @InjectQueue('cleanup')   private cleanupQueue:   Queue,
    @InjectQueue('approval')  private approvalQueue:  Queue,
    @InjectQueue('accounting-outbox') private accountingOutboxQueue: Queue,
  ) {}

  // Outbox comptable : rejoue les écritures manquantes toutes les 15 min.
  @Cron('*/15 * * * *')
  async runAccountingOutbox() {
    await this.accountingOutboxQueue.add('sweep', { triggeredAt: new Date().toISOString() });
  }

  @Cron('45 7 * * *', { timeZone: 'UTC' })
  async runOverdue() {
    await this.overdueQueue.add('overdue', { triggeredAt: new Date().toISOString() });
  }

  @Cron('50 7 * * *', { timeZone: 'UTC' })
  async runRecurring() {
    await this.recurringQueue.add('recurring', { triggeredAt: new Date().toISOString() });
  }

  @Cron('0 8 * * *', { timeZone: 'UTC' })
  async runReminders() {
    await this.reminderQueue.add('reminder', { triggeredAt: new Date().toISOString() });
  }

  // 16h30 heure locale (UTC+1) — dans la fenêtre 8h-17h
  @Cron('30 15 * * *', { timeZone: 'UTC' })
  async runBackup() {
    await this.backupQueue.add('backup', { backupId: '' });
  }

  // 8h15 heure locale — nettoyage des imports pending abandonnés + jobs expirés
  @Cron('15 7 * * *', { timeZone: 'UTC' })
  async runCleanup() {
    await this.cleanupQueue.add('cleanup', { triggeredAt: new Date().toISOString() });
  }

  @Cron('0 * * * *')
  async runApprovalCheck() {
    await this.approvalQueue.add('check-expired', { type: 'check-expired' });
  }
}
