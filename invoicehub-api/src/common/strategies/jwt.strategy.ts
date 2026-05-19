import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectRedis } from '../decorators/inject-redis.decorator';
import type { Redis } from 'ioredis';
import type { JwtPayload } from '../types/jwt-payload.type';

const RBAC_TTL = 300;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: { sub: string }): Promise<JwtPayload> {
    const cacheKey = `rbac:user:${payload.sub}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as JwtPayload;

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'active' },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        roleId: true,
        role: { select: { name: true, permissions: true } },
      },
    });

    if (!user || !user.role) {
      throw new UnauthorizedException('Compte introuvable ou suspendu');
    }

    const data: JwtPayload = {
      sub:         user.id,
      email:       user.email,
      firstName:   user.firstName,
      lastName:    user.lastName,
      roleId:      user.roleId,
      roleName:    user.role.name,
      permissions: user.role.permissions,
    };

    await this.redis.setex(cacheKey, RBAC_TTL, JSON.stringify(data));
    return data;
  }
}
