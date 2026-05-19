import apiClient from '@/lib/api-client'
import type {
  ApprovalWorkflow,
  ApprovalRequest,
  PaginatedApprovalRequests,
  CreateWorkflowPayload,
  ApprovePayload,
  RejectPayload,
  DelegatePayload,
  ListRequestsParams,
} from './types'

const BASE = '/approvals'

export const approvalsApi = {
  // ── Workflows ────────────────────────────────────────────────
  listWorkflows: () =>
    apiClient.get<ApprovalWorkflow[]>(`${BASE}/workflows`).then((r) => r.data),

  getWorkflow: (id: string) =>
    apiClient.get<ApprovalWorkflow>(`${BASE}/workflows/${id}`).then((r) => r.data),

  createWorkflow: (payload: CreateWorkflowPayload) =>
    apiClient.post<ApprovalWorkflow>(`${BASE}/workflows`, payload).then((r) => r.data),

  updateWorkflow: (id: string, payload: Partial<CreateWorkflowPayload>) =>
    apiClient.put<ApprovalWorkflow>(`${BASE}/workflows/${id}`, payload).then((r) => r.data),

  deleteWorkflow: (id: string) =>
    apiClient.delete(`${BASE}/workflows/${id}`),

  // ── Demandes ─────────────────────────────────────────────────
  listRequests: (params?: ListRequestsParams) =>
    apiClient.get<PaginatedApprovalRequests>(`${BASE}/requests`, { params }).then((r) => r.data),

  getRequest: (id: string) =>
    apiClient.get<ApprovalRequest>(`${BASE}/requests/${id}`).then((r) => r.data),

  pendingCount: () =>
    apiClient.get<{ count: number }>(`${BASE}/pending-count`).then((r) => r.data),

  approve: (id: string, payload?: ApprovePayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/approve`, payload).then((r) => r.data),

  reject: (id: string, payload: RejectPayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/reject`, payload).then((r) => r.data),

  delegate: (id: string, payload: DelegatePayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/delegate`, payload).then((r) => r.data),

  cancel: (id: string) =>
    apiClient.post(`${BASE}/requests/${id}/cancel`),
}
