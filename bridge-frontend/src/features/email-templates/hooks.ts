import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emailTemplatesApi } from './api'
import type { UpdateEmailTemplatePayload, PreviewEmailTemplatePayload } from './types'

const KEYS = {
  all:      (locale?: string) => ['email-templates', 'list', locale ?? 'all'] as const,
  one:      (id: string) => ['email-templates', id] as const,
  versions: (id: string) => ['email-templates', id, 'versions'] as const,
}

export function useEmailTemplates(locale?: string) {
  return useQuery({
    queryKey: KEYS.all(locale),
    queryFn:  () => emailTemplatesApi.list(locale),
    staleTime: 120_000,
  })
}

export function useEmailTemplate(id: string) {
  return useQuery({
    queryKey: KEYS.one(id),
    queryFn:  () => emailTemplatesApi.get(id),
    enabled:  !!id,
    staleTime: 120_000,
  })
}

export function useUpdateEmailTemplate(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: UpdateEmailTemplatePayload) => emailTemplatesApi.update(id, p),
    onSuccess:  (data) => {
      qc.setQueryData(KEYS.one(id), data)
      qc.invalidateQueries({ queryKey: ['email-templates', 'list'] })
      toast.success('Template mis à jour')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })
}

export function usePreviewEmailTemplate(id: string) {
  return useMutation({
    mutationFn: (vars: PreviewEmailTemplatePayload) => emailTemplatesApi.preview(id, vars),
  })
}

export function useEmailTemplateVersions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: KEYS.versions(id),
    queryFn:  () => emailTemplatesApi.getVersions(id),
    enabled:  !!id && enabled,
    staleTime: 30_000,
  })
}

export function useRestoreEmailTemplateVersion(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => emailTemplatesApi.restoreVersion(templateId, versionId),
    onSuccess: (data) => {
      qc.setQueryData(KEYS.one(templateId), data)
      qc.invalidateQueries({ queryKey: KEYS.versions(templateId) })
      qc.invalidateQueries({ queryKey: ['email-templates', 'list'] })
      toast.success('Version restaurée')
    },
    onError: () => toast.error('Erreur lors de la restauration'),
  })
}
