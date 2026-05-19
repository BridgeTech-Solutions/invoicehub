import {
  CallHandler, ExecutionContext, Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY } from '../decorators/audit.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const audit = this.reflector.get<{ entity: string; action: AuditAction }>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!audit) return next.handle();

    const req      = context.switchToHttp().getRequest();
    const user     = req.user as JwtPayload | undefined;
    const recordId = (req.params?.id as string | undefined) ?? null;
    const body     = req.body;

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog.create({
          data: {
            userId:    user?.sub     ?? null,
            userEmail: user?.email   ?? null,
            userRole:  user?.roleName ?? null,
            action:    audit.action,
            entityType: audit.entity,
            entityId:   recordId,
            newState:   (body && Object.keys(body).length > 0 ? body : undefined) as Prisma.InputJsonValue | undefined,
            ipAddress:  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null,
            userAgent:  req.get('user-agent') ?? null,
          },
        }).catch((err: Error) => {
          console.warn('[AuditInterceptor] Audit log failed:', err.message);
        });
      }),
    );
  }
}
