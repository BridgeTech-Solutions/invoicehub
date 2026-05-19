import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

@Module({
  imports:     [PrismaModule],
  controllers: [StockController],
  providers:   [StockService],
  exports:     [StockService],
})
export class StockModule {}
