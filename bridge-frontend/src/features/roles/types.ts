export interface RoleEntry {
  id:          string
  name:        string
  displayName: string
  isSystem:    boolean
  permissions: string[]
  _count?:     { users: number }
  createdAt?:  string
  updatedAt?:  string
}

export interface RoleUser {
  id:        string
  firstName: string
  lastName:  string
  email:     string
}

export interface RoleDetail extends RoleEntry {
  _count:    { users: number }
  users:     RoleUser[]
  createdAt: string
  updatedAt: string
}

export interface CreateRolePayload {
  name:        string
  displayName: string
  permissions: string[]
}

export interface UpdateRolePayload {
  displayName?: string
  permissions?: string[]
}

export const PERMISSION_GROUPS: Array<{
  module: string
  label:  string
  perms:  string[]
}> = [
  { module: 'clients',       label: 'Clients',          perms: ['clients:read', 'clients:create', 'clients:update', 'clients:delete', 'clients:*'] },
  { module: 'invoices',      label: 'Factures',         perms: ['invoices:read', 'invoices:create', 'invoices:update', 'invoices:delete', 'invoices:cancel', 'invoices:*'] },
  { module: 'proformas',     label: 'Proformas',        perms: ['proformas:read', 'proformas:create', 'proformas:update', 'proformas:delete', 'proformas:*'] },
  { module: 'payments',      label: 'Paiements',        perms: ['payments:read', 'payments:create', 'payments:delete'] },
  { module: 'products',      label: 'Produits',         perms: ['products:read', 'products:create', 'products:update', 'products:delete', 'products:*'] },
  { module: 'suppliers',     label: 'Fournisseurs',     perms: ['suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete', 'suppliers:*'] },
  { module: 'purchases',     label: 'Achats',           perms: ['purchases:read', 'purchases:create', 'purchases:update', 'purchases:approve', 'purchases:delete'] },
  { module: 'expenses',      label: 'Dépenses',         perms: ['expenses:read', 'expenses:create', 'expenses:update', 'expenses:approve', 'expenses:delete'] },
  { module: 'stock',         label: 'Stock',            perms: ['stock:read', 'stock:create', 'stock:adjust'] },
  { module: 'bank',          label: 'Banque',           perms: ['bank:read', 'bank:create', 'bank:update', 'bank:reconcile', 'bank:manage', 'bank:import-parse', 'bank:import-confirm', 'bank:auto-match', 'bank:rules'] },
  { module: 'accounting',    label: 'Comptabilité',     perms: ['accounting:read', 'accounting:create', 'accounting:validate', 'accounting:close', 'accounting:export'] },
  { module: 'users',         label: 'Utilisateurs',     perms: ['users:read', 'users:manage'] },
  { module: 'roles',         label: 'Rôles',            perms: ['roles:read', 'roles:manage'] },
  { module: 'reports',       label: 'Rapports',         perms: ['reports:read', 'reports:export'] },
  { module: 'dashboard',     label: 'Tableau de bord',  perms: ['dashboard:read'] },
  { module: 'settings',      label: 'Paramètres',       perms: ['settings:read', 'settings:update'] },
  { module: 'audit',         label: "Journal d'audit",  perms: ['audit:read'] },
  { module: 'notifications', label: 'Notifications',    perms: ['notifications:read'] },
  { module: 'search',        label: 'Recherche',        perms: ['search:read'] },
  { module: 'backups',       label: 'Sauvegardes',      perms: ['backups:read', 'backups:manage'] },
  { module: 'approvals',     label: 'Approbations',     perms: ['approvals:admin', 'approvals:approve', 'approvals:view', 'approvals:view_own'] },
]

export const PERM_ACTION_LABELS: Record<string, string> = {
  read:             'Lecture',
  create:           'Création',
  update:           'Modification',
  delete:           'Suppression',
  cancel:           'Annulation',
  approve:          'Approbation',
  adjust:           'Ajustement',
  reconcile:        'Rapprochement',
  manage:           'Gestion',
  export:           'Export',
  validate:         'Validation',
  close:            'Clôture',
  'import-parse':   'Import',
  'import-confirm': 'Confirm. import',
  'auto-match':     'Auto-match',
  rules:            'Règles',
  admin:            'Admin',
  view:             'Consultation',
  view_own:         'Voir les siens',
  '*':              'Tout',
}
