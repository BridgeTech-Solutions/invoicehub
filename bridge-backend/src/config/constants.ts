export const ROLES = {
  ADMIN: 'admin',
  COMMERCIAL: 'commercial',
  EMPLOYEE: 'employee',
} as const;

export const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING_ACTIVATION: 'pending_activation',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  OVERDUE: 'overdue',
} as const;

export const INVOICE_TYPE = {
  STANDARD: 'standard',
  ACOMPTE: 'acompte',
  SOLDE: 'solde',
  AVOIR: 'avoir',
  RECURRING: 'recurring',
} as const;

export const PROFORMA_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

export const PAYMENT_METHOD = {
  VIREMENT: 'virement',
  ESPECES: 'especes',
  CHEQUE: 'cheque',
  MOBILE_MONEY: 'mobile_money',
  AUTRE: 'autre',
} as const;

export const AUDIT_ACTION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  SOFT_DELETE: 'SOFT_DELETE',
  RESTORE: 'RESTORE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ROLE_CHANGE: 'ROLE_CHANGE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  CONVERT_TO_INVOICE: 'CONVERT_TO_INVOICE',
  PAYMENT_REGISTERED: 'PAYMENT_REGISTERED',
  PAYMENT_DELETED: 'PAYMENT_DELETED',
  EMAIL_SENT: 'EMAIL_SENT',
  PDF_GENERATED: 'PDF_GENERATED',
  EXPORT: 'EXPORT',
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
