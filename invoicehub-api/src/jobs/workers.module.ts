import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CronScheduler } from './schedulers/cron.scheduler';
import { OverdueProcessor } from './processors/overdue.processor';
import { RecurringProcessor } from './processors/recurring.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { CleanupProcessor } from './processors/cleanup.processor';
import { JobFailureListener } from './job-failure.listener';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
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
    OverdueProcessor,
    RecurringProcessor,
    ReminderProcessor,
    CleanupProcessor,
    JobFailureListener,
  ],
})
export class WorkersModule {}
