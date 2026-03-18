import apiClient from '@/lib/api-client'
import type {
  EmailTemplate, UpdateEmailTemplatePayload,
  PreviewEmailTemplatePayload, PreviewEmailTemplateResponse,
} from './types'

export const emailTemplatesApi = {
  async list(): Promise<EmailTemplate[]> {
    const { data } = await apiClient.get<EmailTemplate[]>('/email-templates')
    return data
  },
  async get(id: string): Promise<EmailTemplate> {
    const { data } = await apiClient.get<EmailTemplate>(`/email-templates/${id}`)
    return data
  },
  async update(id: string, payload: UpdateEmailTemplatePayload): Promise<EmailTemplate> {
    const { data } = await apiClient.put<EmailTemplate>(`/email-templates/${id}`, payload)
    return data
  },
  async preview(id: string, vars: PreviewEmailTemplatePayload): Promise<PreviewEmailTemplateResponse> {
    const { data } = await apiClient.post<PreviewEmailTemplateResponse>(
      `/email-templates/${id}/preview`, vars,
    )
    return data
  },
}
