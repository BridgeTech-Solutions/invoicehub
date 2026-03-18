import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emailTemplatesApi } from './api'
import type { UpdateEmailTemplatePayload, PreviewEmailTemplatePayload } from './types'

const KEYS = {
  all:  ['email-templates'] as const,
  one:  (id: string) => ['email-templates', id] as const,
}

export function useEmailTemplates() {
  return useQuery({ queryKey: KEYS.all, queryFn: emailTemplatesApi.list, staleTime: 120_000 })
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
      qc.invalidateQueries({ queryKey: KEYS.all })
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
