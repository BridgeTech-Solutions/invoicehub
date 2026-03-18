export const ROUTES = {
  LOGIN:          '/login',
  TWO_FA:         '/2fa',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD:      '/dashboard',
  CLIENTS:        '/clients',
  PRODUCTS:       '/products',
  PROFORMAS:      '/proformas',
  INVOICES:       '/invoices',
  PAYMENTS:       '/payments',
  RECURRING:      '/recurring',
  NOTIFICATIONS:  '/notifications',
  USERS:          '/users',
  REPORTS:        '/reports',
  AUDIT:          '/audit',
  PROFILE:        '/profile',
  SETTINGS:       '/settings',
  PRODUCT_CATEGORIES:     '/product-categories',
  SETTINGS_COMPANY:       '/settings/company',
  SETTINGS_BILLING:       '/settings/billing',
  SETTINGS_SECURITY:      '/settings/security',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_BACKUPS:       '/settings/backups',
} as const

export const ROLES = {
  ADMIN:      'admin',
  COMMERCIAL: 'commercial',
  EMPLOYEE:   'employee',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]

export const INVOICE_STATUSES = [
  'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled',
] as const

export const PROFORMA_STATUSES = [
  'draft', 'sent', 'accepted', 'rejected', 'expired',
] as const

export const INVOICE_TYPES = {
  standard:  'Standard',
  acompte:   'Acompte',
  solde:     'Solde',
  avoir:     'Avoir',
  recurring: 'Récurrente',
} as const

export const STATUS_LABELS: Record<string, string> = {
  draft:          'Brouillon',
  sent:           'Envoyée',
  issued:         'Émise',
  accepted:       'Acceptée',
  rejected:       'Rejetée',
  paid:           'Payée',
  partially_paid: 'Part. payée',
  overdue:        'En retard',
  cancelled:      'Annulée',
  expired:        'Expirée',
  active:         'Actif',
  archived:       'Archivé',
}

export const PAYMENT_METHODS = {
  cash:           'Espèces',
  bank_transfer:  'Virement',
  mobile_money:   'Mobile Money',
  check:          'Chèque',
  card:           'Carte bancaire',
} as const

export const TAX_RATE_DEFAULT = 19.25  // SYSCOHADA TVA Cameroun
