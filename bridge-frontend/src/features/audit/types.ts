// Valeurs réelles de l'enum AuditAction côté backend (Prisma)
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'ROLE_CHANGE'
  | 'STATUS_CHANGE'
  | 'CONVERT_TO_INVOICE'
  | 'PAYMENT_REGISTERED'
  | 'PAYMENT_DELETED'
  | 'EMAIL_SENT'
  | 'PDF_GENERATED'
  | 'EXPORT'

export interface AuditLog {
  id:            string
  action:        AuditAction
  entityType:    string | null
  entityId:      string | null
  ipAddress:     string | null
  userAgent:     string | null
  previousState: Record<string, unknown> | null   // champ Prisma : previousState
  newState:      Record<string, unknown> | null    // champ Prisma : newState
  createdAt:     string
  user: {
    id:        string
    firstName: string
    lastName:  string
    email:     string
  } | null
}

// Structure réelle retournée par GET /audit-logs/stats
export interface AuditStats {
  topUsers:      { user: { id: string; firstName: string; lastName: string; email: string } | null; count: number }[]
  topTables:     { table: string; count: number }[]
  topActions:    { action: string; count: number }[]
  dailyActivity: { day: string; count: number }[]
}

export interface PaginatedAuditLogs {
  data:       AuditLog[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface ListAuditLogsParams {
  page?:       number
  limit?:      number
  userId?:     string
  entityType?: string
  action?:     AuditAction
  dateFrom?:   string
  dateTo?:     string
  export?:     'csv'
}
