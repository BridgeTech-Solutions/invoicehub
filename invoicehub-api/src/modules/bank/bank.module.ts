// src/modules/bank/bank.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { BankImportProcessor } from './bank-import.processor';
import { BANK_IMPORT_QUEUE } from '../../jobs/constants';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: BANK_IMPORT_QUEUE }),
  ],
  controllers: [BankController],
  providers:   [BankService, BankImportProcessor],
  exports:     [BankService],
})
export class BankModule {}
