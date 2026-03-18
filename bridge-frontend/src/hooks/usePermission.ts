import { useAuthStore } from '@/features/auth/store'
import type { Role } from '@/lib/constants'

// ─── Permissions matrix ───────────────────────────────────────
type Action = 'create' | 'read' | 'update' | 'delete' | 'cancel' | 'issue' | 'export' | '*'
type Resource =
  | 'invoice' | 'proforma' | 'payment' | 'client'
  | 'product' | 'user' | 'settings' | 'audit'
  | 'report'  | 'recurring' | 'notification'

type PermissionMap = Partial<Record<Resource, Action[] | ['*']>>

const PERMISSIONS: Record<Role, PermissionMap> = {
  admin: {
    invoice:      ['*'],
    proforma:     ['*'],
    payment:      ['*'],
    client:       ['*'],
    product:      ['*'],
    user:         ['*'],
    settings:     ['*'],
    audit:        ['*'],
    report:       ['*'],
    recurring:    ['*'],
    notification: ['*'],
  },
  commercial: {
    invoice:      ['create', 'read', 'update', 'cancel', 'issue', 'export'],
    proforma:     ['create', 'read', 'update', 'cancel', 'export'],
    payment:      ['create', 'read'],
    client:       ['create', 'read', 'update'],
    product:      ['create', 'read', 'update'],
    user:         ['read'],
    settings:     ['read'],
    audit:        [],
    report:       ['read', 'export'],
    recurring:    ['create', 'read', 'update'],
    notification: ['read'],
  },
  employee: {
    invoice:      ['read'],
    proforma:     ['read'],
    payment:      ['read'],
    client:       ['read'],
    product:      ['read'],
    user:         [],
    settings:     [],
    audit:        [],
    report:       ['read'],
    recurring:    ['read'],
    notification: ['read'],
  },
}

/**
 * usePermission — vérifie les droits de l'utilisateur connecté
 *
 * @example
 * const { can, role, isAdmin } = usePermission()
 * if (can('invoice', 'create')) { ... }
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role ?? 'employee'

  const can = (resource: Resource, action: Action): boolean => {
    const perms = PERMISSIONS[role]?.[resource]
    if (!perms) return false
    if ((perms as string[]).includes('*')) return true
    return (perms as string[]).includes(action)
  }

  const hasRole = (...roles: Role[]): boolean => roles.includes(role)

  return {
    can,
    hasRole,
    role,
    isAdmin:      role === 'admin',
    isCommercial: role === 'commercial',
    isEmployee:   role === 'employee',
  }
}
