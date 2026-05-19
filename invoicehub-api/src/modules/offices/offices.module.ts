import { Module } from '@nestjs/common';
import { OfficesService } from './offices.service';
import { OfficesController } from './offices.controller';

@Module({
  controllers: [OfficesController],
  providers:   [OfficesService],
  exports:     [OfficesService],
})
export class OfficesModule {}
