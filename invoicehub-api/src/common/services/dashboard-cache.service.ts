import { Injectable } from '@nestjs/common';
import { InjectRedis } from '../decorators/inject-redis.decorator';
import type IORedis from 'ioredis';

@Injectable()
export class DashboardCacheService {
  private static readonly KEY_PATTERN = 'dashboard:*';
  constructor(@InjectRedis() private readonly redis: IORedis) {}
  async invalidate(): Promise<void> {
    const keys = await this.redis.keys(DashboardCacheService.KEY_PATTERN);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
