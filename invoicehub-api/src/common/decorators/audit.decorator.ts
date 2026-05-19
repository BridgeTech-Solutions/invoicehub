import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '@prisma/client';
export const AUDIT_KEY = 'audit';
export const Audit = (entity: string, action: AuditAction) =>
  SetMetadata(AUDIT_KEY, { entity, action });
