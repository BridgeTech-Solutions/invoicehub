import apiClient from '@/lib/api-client'
import type {
  Notification, NotificationsListResponse, NotificationSetting,
  ListNotificationsParams,
} from './types'

export const notificationsApi = {
  /** GET /notifications — liste paginée */
  async list(params: ListNotificationsParams = {}): Promise<NotificationsListResponse> {
    const { data } = await apiClient.get<NotificationsListResponse>('/notifications', { params })
    return data
  },

  /** PUT /notifications/:id/read */
  async markRead(id: string): Promise<Notification> {
    const { data } = await apiClient.put<Notification>(`/notifications/${id}/read`)
    return data
  },

  /** PUT /notifications/read-all */
  async markAllRead(): Promise<void> {
    await apiClient.put('/notifications/read-all')
  },

  /** GET /notifications/settings */
  async getSettings(): Promise<NotificationSetting[]> {
    const { data } = await apiClient.get<NotificationSetting[]>('/notifications/settings')
    return data
  },

  /** PUT /notifications/settings */
  async updateSettings(settings: NotificationSetting[]): Promise<NotificationSetting[]> {
    const { data } = await apiClient.put<NotificationSetting[]>('/notifications/settings', { settings })
    return data
  },

  // ── Quick-confirm depuis notification ──────────────────────────────────────

  /** POST /invoices/:id/quick-confirm-payment — marque la facture comme payée */
  async quickConfirmPayment(invoiceId: string): Promise<void> {
    await apiClient.post(`/invoices/${invoiceId}/quick-confirm-payment`)
  },

  /** POST /invoices/:id/quick-confirm-issued — passe le brouillon facture en "émise" */
  async quickConfirmIssued(invoiceId: string): Promise<void> {
    await apiClient.post(`/invoices/${invoiceId}/quick-confirm-issued`)
  },

  /** POST /proformas/:id/quick-confirm-sent — passe le brouillon proforma en "envoyée" */
  async quickConfirmProformaSent(proformaId: string): Promise<void> {
    await apiClient.post(`/proformas/${proformaId}/quick-confirm-sent`)
  },

  /** POST /proformas/:id/quick-confirm-accepted — marque la proforma comme acceptée */
  async quickConfirmProformaAccepted(proformaId: string): Promise<void> {
    await apiClient.post(`/proformas/${proformaId}/quick-confirm-accepted`)
  },
}
