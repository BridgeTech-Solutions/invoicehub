import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { default as IORedis } from 'ioredis';
import { REDIS_CLIENT } from '../common/decorators/inject-redis.decorator';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
