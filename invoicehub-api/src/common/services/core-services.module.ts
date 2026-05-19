import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { DashboardCacheService } from './dashboard-cache.service';

@Module({
  imports: [RedisModule],
  providers: [DashboardCacheService],
  exports: [DashboardCacheService],
})
export class CoreServicesModule {}
