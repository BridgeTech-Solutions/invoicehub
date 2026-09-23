import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports:     [PrismaModule],
  controllers: [StockController, InventoryController],
  providers:   [StockService, InventoryService],
  exports:     [StockService],
})
export class StockModule {}
