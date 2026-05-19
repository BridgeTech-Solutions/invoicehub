import apiClient from '@/lib/api-client'
import type { WorkflowRule, CreateWorkflowRuleInput } from './types'

export const workflowRulesApi = {
  async list(module?: string): Promise<WorkflowRule[]> {
    const { data } = await apiClient.get<{ success: boolean; data: WorkflowRule[] }>(
      '/settings/workflow-rules',
      { params: module ? { module } : undefined },
    )
    return data.data ?? (data as unknown as WorkflowRule[])
  },

  async create(input: CreateWorkflowRuleInput): Promise<WorkflowRule> {
    const { data } = await apiClient.post<{ success: boolean; data: WorkflowRule }>(
      '/settings/workflow-rules',
      input,
    )
    return data.data ?? (data as unknown as WorkflowRule)
  },

  async toggle(id: string): Promise<WorkflowRule> {
    const { data } = await apiClient.post<{ success: boolean; data: WorkflowRule }>(
      `/settings/workflow-rules/${id}/toggle`,
    )
    return data.data ?? (data as unknown as WorkflowRule)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/settings/workflow-rules/${id}`)
  },
}
