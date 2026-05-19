import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { BackupJobData } from '../job-types';

@Processor('backup')
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  async process(job: Job<BackupJobData>): Promise<void> {
    // BackupsService sera injecté en Phase 7 via circular-safe import
    this.logger.log(`[Backup] Job reçu : backupId=${job.data.backupId}`);
  }
}
