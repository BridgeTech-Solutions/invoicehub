export type NotificationType =
  | 'payment_received'
  | 'invoice_issued'
  | 'invoice_overdue'
  | 'invoice_cancelled'
  | 'proforma_accepted'
  | 'proforma_rejected'
  | 'proforma_expired'
  | 'user_created'
  | 'reminder_sent'
  | 'recurring_generated'

export interface Notification {
  id:        string
  type:      NotificationType
  title:     string
  body:      string | null
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

export interface NotificationSetting {
  type:   NotificationType
  inApp:  boolean
  email:  boolean
}

export interface ListNotificationsParams {
  page?:       number
  limit?:      number
  unreadOnly?: boolean
}
