import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

const QUEUES = [
  { name: 'email',        attempts: 3, delay: 5_000,       backoff: 'exponential' },
  { name: 'notification', attempts: 2, delay: 2_000,       backoff: 'fixed'       },
  { name: 'overdue',      attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'recurring',    attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'reminder',     attempts: 3, delay: 5 * 60_000,  backoff: 'exponential' },
  { name: 'backup',       attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'cleanup',      attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'export',       attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'bank-import',  attempts: 1, delay: 0,            backoff: 'fixed'       },
  { name: 'approval',     attempts: 3, delay: 5_000,        backoff: 'exponential' },
];

@Module({
  imports: [
    BullModule.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
      }),
    }),
    ...QUEUES.map(q =>
      BullModule.registerQueue({
        name: q.name,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail:     { count: 500 },
          ...(q.attempts > 1 ? {
            attempts: q.attempts,
            backoff: { type: q.backoff as 'exponential' | 'fixed', delay: q.delay },
          } : {}),
        },
      }),
    ),
  ],
  exports: [BullModule],
})
export class JobsModule {}
