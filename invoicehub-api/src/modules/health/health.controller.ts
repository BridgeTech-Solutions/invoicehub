import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '../../common/decorators/inject-redis.decorator';
import type { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get()
  @Public()
  async check() {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const db    = dbResult.status    === 'fulfilled' ? 'ok' : 'error';
    const redis = redisResult.status === 'fulfilled' ? 'ok' : 'error';
    const healthy = db === 'ok' && redis === 'ok';

    return {
      status:    healthy ? 'ok' : 'degraded',
      db,
      redis,
      uptime:    Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      env:       process.env.NODE_ENV,
    };
  }
}
