import { Module } from '@nestjs/common';
import { GuideService } from './guide.service';
import { GuideController } from './guide.controller';

@Module({
  controllers: [GuideController],
  providers:   [GuideService],
  exports:     [GuideService],
})
export class GuideModule {}
