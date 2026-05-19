import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectRedis } from '../decorators/inject-redis.decorator';
import type Redis from 'ioredis';
import { AppError } from '../errors/app-error';

@Injectable()
export class BackupRateLimitGuard implements CanActivate {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req    = context.switchToHttp().getRequest();
    const userId = req.user?.sub;
    if (!userId) return true;

    const key   = `backup:ratelimit:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);

    if (count > 3) {
      throw new AppError('Limite de 3 backups manuels par heure atteinte.', 429, 'TOO_MANY_REQUESTS');
    }
    return true;
  }
}
