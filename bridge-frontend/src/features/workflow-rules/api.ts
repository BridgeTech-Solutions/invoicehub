import apiClient from '@/lib/api-client'
import type { WorkflowRule, CreateWorkflowRuleInput } from './types'

/**
 * Le contrôleur backend est `@Controller('workflow-rules')` : les routes vivent
 * donc sous `/api/workflow-rules`, PAS sous `/api/settings/workflow-rules`.
 * Le préfixe `settings/` — sans doute hérité de l'emplacement de la page dans le
 * menu — renvoyait 404 sur les quatre appels : la fonctionnalité ne pouvait ni
 * lister, ni créer, ni activer, ni supprimer une règle.
 */
const BASE = '/workflow-rules'

export const workflowRulesApi = {
  async list(module?: string): Promise<WorkflowRule[]> {
    const { data } = await apiClient.get<{ success: boolean; data: WorkflowRule[] }>(
      BASE,
      { params: module ? { module } : undefined },
    )
    return data.data ?? (data as unknown as WorkflowRule[])
  },

  async create(input: CreateWorkflowRuleInput): Promise<WorkflowRule> {
    const { data } = await apiClient.post<{ success: boolean; data: WorkflowRule }>(
      BASE,
      input,
    )
    return data.data ?? (data as unknown as WorkflowRule)
  },

  async toggle(id: string): Promise<WorkflowRule> {
    const { data } = await apiClient.post<{ success: boolean; data: WorkflowRule }>(
      `${BASE}/${id}/toggle`,
    )
    return data.data ?? (data as unknown as WorkflowRule)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/${id}`)
  },
}
