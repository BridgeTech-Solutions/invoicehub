import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UnitsService } from './units.service';
import { UnitsController } from './units.controller';

@Module({
  imports:     [PrismaModule],
  controllers: [UnitsController],
  providers:   [UnitsService],
  exports:     [UnitsService],
})
export class UnitsModule {}
