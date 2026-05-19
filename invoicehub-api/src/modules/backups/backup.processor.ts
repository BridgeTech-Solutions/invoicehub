import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupsService } from './backups.service';
import { BACKUP_QUEUE } from '../../jobs/constants';

export interface BackupJobData {
  backupId?: string;
}

@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(
    private readonly backupsService: BackupsService,
    private readonly prisma:         PrismaService,
    private readonly config:         ConfigService,
  ) {
    super();
  }

  async process(job: Job<BackupJobData>): Promise<void> {
    let backupId = job.data.backupId;

    if (!backupId) {
      const filename = this.backupsService.generateFilename();
      const backup   = await this.prisma.backup.create({
        data: {
          filename,
          storageDisk: this.config.get<string>('BACKUP_STORAGE_DISK', 'local'),
          status:      'pending',
          type:        'scheduled',
        },
      });
      backupId = backup.id;
      this.logger.log(`[backup] Backup automatique créé : ${backupId} (${filename})`);
    }

    this.logger.log(`[backup] Démarrage backup ${backupId}`);
    await this.backupsService.runBackup(backupId);
    this.logger.log(`[backup] Backup ${backupId} terminé avec succès`);
  }
}
