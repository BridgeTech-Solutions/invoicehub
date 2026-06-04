import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { GatewayModule } from '../gateway/gateway.module';
import { CronScheduler } from './schedulers/cron.scheduler';
import { EmailProcessor } from './processors/email.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { ApprovalProcessor } from './processors/approval.processor';
import { OverdueProcessor } from './processors/overdue.processor';
import { RecurringProcessor } from './processors/recurring.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { BackupProcessor } from './processors/backup.processor';
import { CleanupProcessor } from './processors/cleanup.processor';
import { JobFailureListener } from './job-failure.listener';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    GatewayModule,
    BullModule.registerQueue(
      { name: 'overdue' },
      { name: 'recurring' },
      { name: 'reminder' },
      { name: 'backup' },
      { name: 'cleanup' },
      { name: 'approval' },
      { name: 'notification' },
      { name: 'email' },
    ),
  ],
  providers: [
    CronScheduler,
    EmailProcessor,
    NotificationProcessor,
    ApprovalProcessor,
    OverdueProcessor,
    RecurringProcessor,
    ReminderProcessor,
    BackupProcessor,
    CleanupProcessor,
    JobFailureListener,
  ],
})
export class WorkersModule {}
