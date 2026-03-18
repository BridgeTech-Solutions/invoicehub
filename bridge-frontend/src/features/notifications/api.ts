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
}
