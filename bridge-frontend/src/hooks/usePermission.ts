import { useAuthStore } from '@/features/auth/store'
import type { Role } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────
export type Action = 'create' | 'read' | 'update' | 'delete' | 'cancel' | 'issue' | 'export' | 'manage' | '*'
export type Resource =
  | 'invoice' | 'proforma' | 'payment' | 'client'
  | 'product' | 'user' | 'settings' | 'audit'
  | 'report'  | 'recurring' | 'notification'
  | 'accounting' | 'bank' | 'role' | 'approval'
  | 'expense' | 'supplier' | 'purchase-order' | 'stock'

// ─── Modules backend valides (issus de ALL_PERMISSIONS dans roles.service.ts) ─
// Ce type sert de filet de sécurité : si on ajoute un module backend,
// TypeScript signalera une erreur si RESOURCE_MODULE n'est pas mis à jour.
type BackendModule =
  | 'invoices' | 'proformas' | 'payments' | 'clients' | 'products'
  | 'suppliers' | 'purchases' | 'expenses' | 'stock'
  | 'bank' | 'accounting' | 'users' | 'roles' | 'reports'
  | 'dashboard' | 'settings' | 'audit' | 'notifications'
  | 'search' | 'backups' | 'approvals'

// ─── Frontend resource → backend module ──────────────────────
// Record<Resource, BackendModule> garantit que chaque Resource a un module valide.
// TypeScript refusera de compiler si une Resource manque ou pointe vers un module inexistant.
const RESOURCE_MODULE: Record<Resource, BackendModule> = {
  invoice:          'invoices',
  proforma:         'proformas',
  payment:          'payments',
  client:           'clients',
  product:          'products',
  user:             'users',
  settings:         'settings',
  audit:            'audit',
  report:           'reports',
  recurring:        'invoices',      // templates récurrentes → module invoices
  notification:     'notifications',
  accounting:       'accounting',
  bank:             'bank',
  role:             'roles',
  approval:         'approvals',
  expense:          'expenses',
  supplier:         'suppliers',
  'purchase-order': 'purchases',
  stock:            'stock',
}

// Actions frontend sans équivalent exact en backend → alias
const ACTION_ALIAS: Partial<Record<Action, string>> = {
  issue: 'update',   // invoices:issue n'existe pas côté backend
}

/**
 * usePermission — vérifie les droits de l'utilisateur connecté.
 * Les permissions sont chargées dynamiquement depuis la BD (login / refresh / bootstrap).
 *
 * @example
 * const { can, role, isAdmin, permissionsLoaded } = usePermission()
 * if (!permissionsLoaded) return <Skeleton />
 * if (!can('invoice', 'create')) return <AccessDenied />
 */
export function usePermission() {
  const user             = useAuthStore((s) => s.user)
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded)
  const role             = (user?.role ?? 'employee') as Role
  const permissions      = user?.permissions ?? []

  const can = (resource: Resource, action: Action): boolean => {
    // Wildcard global (ex. admin avec '*' dans ses permissions)
    if (permissions.includes('*')) return true

    const module = RESOURCE_MODULE[resource]

    // Wildcard sur le module (ex. invoices:*)
    if (permissions.includes(`${module}:*`)) return true

    // Action spécifique (avec alias si besoin)
    const act = ACTION_ALIAS[action] ?? action
    return permissions.includes(`${module}:${act}`)
  }

  const hasRole = (...roles: Role[]): boolean => roles.includes(role)

  return {
    can,
    hasRole,
    role,
    permissionsLoaded,
    isAdmin:      role === 'admin',
    isCommercial: role === 'commercial',
    isEmployee:   role === 'employee',
  }
}
