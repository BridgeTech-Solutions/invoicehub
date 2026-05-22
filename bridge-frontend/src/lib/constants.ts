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
  ASSISTANT:              '/assistant',
  GUIDE:                  '/guide',

  // ── Tiers ──────────────────────────────────────────────────────
  SUPPLIERS:           '/suppliers',

  // ── Achats ─────────────────────────────────────────────────────
  PURCHASE_ORDERS:     '/purchase-orders',
  SUPPLIER_INVOICES:   '/supplier-invoices',
  EXPENSES:            '/expenses',
  EXPENSE_CATEGORIES:  '/expenses/categories',
  EXPENSE_BUDGETS:     '/expenses/budgets',

  // ── Stocks & Produits ───────────────────────────────────────────
  STOCK:               '/stock',
  STOCK_MOVEMENTS:     '/stock/movements',
  STOCK_LEVELS:        '/stock/levels',
  STOCK_ALERTS:        '/stock/alerts',

  // ── Finances — Banque ───────────────────────────────────────────
  BANK:                       '/bank',
  BANK_ACCOUNTS:              '/bank/accounts',
  BANK_IMPORT:                '/bank/import',
  BANK_IMPORT_PROFILES:       '/bank/import-profiles',
  BANK_TRANSACTIONS:          '/bank/transactions',
  BANK_RECONCILIATIONS:       '/bank/reconciliations',
  BANK_MATCHING_RULES:        '/bank/matching-rules',

  // ── Finances — Comptabilité ─────────────────────────────────────
  ACCOUNTING:                 '/accounting',
  ACCOUNTING_CHART:           '/accounting/chart',
  ACCOUNTING_PERIODS:         '/accounting/periods',
  ACCOUNTING_JOURNALS:        '/accounting/journals',
  ACCOUNTING_ENTRIES:         '/accounting/entries',
  ACCOUNTING_REPORTS:         '/accounting/reports',
  ACCOUNTING_TAX:             '/accounting/tax-declarations',
  ACCOUNTING_LETTERING:       '/accounting/lettering',

  // ── Administration ──────────────────────────────────────────────
  ROLES:               '/roles',
  ROLES_PERMISSIONS:   '/roles/permissions',
  APPROVALS:           '/approvals',

  // ── Paramètres avancés ──────────────────────────────────────────
  SETTINGS_OFFICES:         '/settings/offices',
  SETTINGS_TAX_RATES:       '/settings/tax-rates',
  SETTINGS_EMAIL_TEMPLATES: '/settings/email-templates',
  SETTINGS_WEBHOOKS:        '/settings/webhooks',
  SETTINGS_API_KEYS:        '/settings/api-keys',
  SETTINGS_CUSTOM_FIELDS:   '/settings/custom-fields',
  SETTINGS_WORKFLOW_RULES:  '/settings/workflow-rules',
  SETTINGS_WORKFLOWS:       '/settings/workflows',
  SETTINGS_IP_WHITELIST:    '/settings/ip-whitelist',
  SETTINGS_EXPORTS:         '/settings/exports',
  SETTINGS_OUTLOOK:         '/settings/outlook',
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
  virement:     'Virement bancaire',
  especes:      'Espèces',
  cheque:       'Chèque',
  mobile_money: 'Mobile Money',
  autre:        'Autre',
} as const

export const TAX_RATE_DEFAULT = 19.25  // SYSCOHADA TVA Cameroun
