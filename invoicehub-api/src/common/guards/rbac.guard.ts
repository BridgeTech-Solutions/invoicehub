import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';

function hasPermission(userPerms: string[], required: string[]): boolean {
  if (userPerms.includes('*')) return true;
  return required.some(perm => {
    if (userPerms.includes(perm)) return true;
    const [module] = perm.split(':');
    return userPerms.includes(`${module}:*`);
  });
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read from @Permission() (singular) — used in most routes
    const singularPerms = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Read from @Permissions() (plural) — used for OR-logic multi-permission routes
    const pluralPerms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Combine: any permission from either decorator is sufficient (OR logic)
    const permissions = [
      ...(singularPerms ?? []),
      ...(pluralPerms ?? []),
    ];

    if (permissions.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException('Non authentifié');

    if (hasPermission(user.permissions, permissions)) return true;

    throw new ForbiddenException(
      `Permission requise : ${permissions.join(' ou ')}. Votre rôle (${user.roleName}) ne l'inclut pas.`,
    );
  }
}
