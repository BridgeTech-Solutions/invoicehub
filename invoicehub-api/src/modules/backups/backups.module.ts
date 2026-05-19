import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupProcessor } from './backup.processor';
import { BackupRateLimitGuard } from '../../common/guards/backup-rate-limit.guard';
import { BACKUP_QUEUE } from '../../jobs/constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: BACKUP_QUEUE }),
  ],
  providers:   [BackupsService, BackupProcessor, BackupRateLimitGuard],
  controllers: [BackupsController],
})
export class BackupsModule {}
