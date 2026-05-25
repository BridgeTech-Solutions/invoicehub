import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';

@Module({
  imports:     [PrismaModule],
  controllers: [AccountingController],
  providers:   [AccountingService],
  exports:     [AccountingService],
})
export class AccountingModule {}
