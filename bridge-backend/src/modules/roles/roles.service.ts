import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { invalidateRoleRbacCache } from '../../lib/rbacCache';
import { CreateRoleInput, UpdateRoleInput } from './roles.schema';

export const ALL_PERMISSIONS = [
  'clients:read', 'clients:create', 'clients:update', 'clients:delete', 'clients:*',
  'invoices:read', 'invoices:create', 'invoices:update', 'invoices:delete', 'invoices:cancel', 'invoices:*',
  'proformas:read', 'proformas:create', 'proformas:update', 'proformas:delete', 'proformas:*',
  'payments:read', 'payments:create', 'payments:delete',
  'products:read', 'products:create', 'products:update', 'products:delete', 'products:*',
  'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete', 'suppliers:*',
  'purchases:read', 'purchases:create', 'purchases:update', 'purchases:approve', 'purchases:delete',
  'expenses:read', 'expenses:create', 'expenses:update', 'expenses:approve', 'expenses:delete',
  'stock:read', 'stock:create', 'stock:adjust',
  'bank:read', 'bank:create', 'bank:update', 'bank:reconcile', 'bank:manage',
  'bank:import-parse', 'bank:import-confirm', 'bank:auto-match', 'bank:rules',
  'accounting:read', 'accounting:create', 'accounting:validate', 'accounting:close', 'accounting:export',
  'users:read', 'users:manage',
  'roles:read', 'roles:manage',
  'reports:read', 'reports:export',
  'dashboard:read',
  'settings:read', 'settings:update',
  'audit:read',
  'notifications:read',
  'search:read',
  'backups:read', 'backups:manage',
  'approvals:admin', 'approvals:approve', 'approvals:view', 'approvals:view_own',
  '*',
];

export async function listRoles() {
  return prisma.role.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  });
}

export async function getRoleById(id: string) {
  const role = await prisma.role.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: { select: { users: true } },
      users: {
        where: { deletedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 20,
      },
    },
  });
  if (!role) throw AppError.notFound('Rôle introuvable');
  return role;
}

export async function createRole(data: CreateRoleInput, createdById: string) {
  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) throw AppError.conflict('Un rôle avec ce nom existe déjà');

  return prisma.role.create({
    data: { ...data, createdById },
  });
}

export async function updateRole(id: string, data: UpdateRoleInput) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw AppError.notFound('Rôle introuvable');

  const updated = await prisma.role.update({ where: { id }, data });

  const userIds = await prisma.user.findMany({
    where: { roleId: id, deletedAt: null },
    select: { id: true },
  });
  await invalidateRoleRbacCache(userIds.map((u) => u.id));

  return updated;
}

export async function deleteRole(id: string) {
  const role = await prisma.role.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw AppError.notFound('Rôle introuvable');
  if (role.isSystem) throw AppError.forbidden('Les rôles système ne peuvent pas être supprimés');
  if (role._count.users > 0) {
    throw AppError.conflict(`Ce rôle est assigné à ${role._count.users} utilisateur(s)`);
  }

  await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
}
