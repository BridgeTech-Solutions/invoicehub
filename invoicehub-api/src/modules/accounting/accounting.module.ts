import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingNotifierService } from './accounting-notifier.service';

@Module({
  imports:     [PrismaModule, BullModule.registerQueue({ name: 'notification' })],
  controllers: [AccountingController],
  providers:   [AccountingService, AccountingNotifierService],
  exports:     [AccountingService],
})
export class AccountingModule {}
