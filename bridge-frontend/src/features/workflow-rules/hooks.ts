import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { workflowRulesApi } from './api'
import type { CreateWorkflowRuleInput } from './types'

const KEYS = {
  all:  ['workflow-rules'] as const,
  list: (module?: string) => ['workflow-rules', 'list', module ?? 'all'] as const,
}

export function useWorkflowRules(module?: string) {
  return useQuery({
    queryKey: KEYS.list(module),
    queryFn:  () => workflowRulesApi.list(module),
    staleTime: 30_000,
  })
}

export function useCreateWorkflowRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkflowRuleInput) => workflowRulesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Règle créée avec succès')
    },
    onError: () => toast.error('Erreur lors de la création de la règle'),
  })
}

export function useToggleWorkflowRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowRulesApi.toggle(id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success(updated.isActive ? 'Règle activée' : 'Règle désactivée')
    },
    onError: () => toast.error('Erreur lors du changement d\'état'),
  })
}

export function useDeleteWorkflowRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workflowRulesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Règle supprimée')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })
}
