// Types alignés sur l'enum NotificationStatus du backend (Prisma schema)
export type NotificationType =
  | 'proforma_sent'
  | 'proforma_accepted'
  | 'proforma_rejected'
  | 'proforma_expired'
  | 'invoice_issued'
  | 'invoice_paid'
  | 'invoice_partially_paid'
  | 'invoice_overdue'
  | 'payment_registered'
  | 'reminder_sent'
  | 'user_created'
  | 'system'
  // Approbations
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired'
  | 'approval_delegated'
  // Modules achats / dépenses
  | 'expense_submitted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'purchase_order_created'
  | 'purchase_order_approved'
  | 'purchase_order_rejected'
  | 'purchase_order_received'
  | 'supplier_invoice_received'
  | 'supplier_invoice_due'
  // Modules stock / banque / fiscal
  | 'low_stock_alert'
  | 'bank_reconciliation_pending'
  | 'fiscal_period_closing'
  | 'role_changed'
  | 'budget_exceeded'
  | 'accounting_entry_failed'

export interface Notification {
  id:        string
  type:      NotificationType
  title:     string
  message:   string | null
  isRead:    boolean
  data:      Record<string, unknown> | null
  createdAt: string
}

export interface NotificationsListResponse {
  data:        Notification[]
  total:       number
  page:        number
  limit:       number
  totalPages:  number
  unreadCount: number
}

export type NotificationChannel = 'in_app' | 'email' | 'both'

export interface NotificationSetting {
  type:    NotificationType
  channel: NotificationChannel
  enabled: boolean
}

export interface ListNotificationsParams {
  page?:       number
  limit?:      number
  unreadOnly?: boolean
}
