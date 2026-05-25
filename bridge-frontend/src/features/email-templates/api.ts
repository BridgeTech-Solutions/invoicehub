import apiClient from '@/lib/api-client'
import type {
  EmailTemplate, UpdateEmailTemplatePayload,
  PreviewEmailTemplatePayload, PreviewEmailTemplateResponse,
  EmailTemplateVersion,
} from './types'

export const emailTemplatesApi = {
  async list(locale?: string): Promise<EmailTemplate[]> {
    const { data } = await apiClient.get<EmailTemplate[]>('/email-templates', {
      params: locale ? { locale } : undefined,
    })
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
  async getVersions(id: string): Promise<EmailTemplateVersion[]> {
    const { data } = await apiClient.get<EmailTemplateVersion[]>(`/email-templates/${id}/versions`)
    return data
  },
  async restoreVersion(templateId: string, versionId: string): Promise<EmailTemplate> {
    const { data } = await apiClient.post<EmailTemplate>(
      `/email-templates/${templateId}/versions/${versionId}/restore`,
    )
    return data
  },
}
