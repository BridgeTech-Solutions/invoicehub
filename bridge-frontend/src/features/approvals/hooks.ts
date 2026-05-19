import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { approvalsApi } from './api'
import type {
  CreateWorkflowPayload,
  ListRequestsParams,
  ApprovePayload,
  RejectPayload,
  DelegatePayload,
} from './types'

const KEYS = {
  all:          ['approvals'] as const,
  workflows:    ['approvals', 'workflows'] as const,
  workflow:     (id: string) => ['approvals', 'workflows', id] as const,
  requests:     (p?: ListRequestsParams) => ['approvals', 'requests', p] as const,
  request:      (id: string) => ['approvals', 'requests', id] as const,
  pendingCount: ['approvals', 'pending-count'] as const,
}

export function useApprovalWorkflows() {
  return useQuery({
    queryKey: KEYS.workflows,
    queryFn:  approvalsApi.listWorkflows,
    staleTime: 60_000,
  })
}

export function useApprovalWorkflow(id: string) {
  return useQuery({
    queryKey: KEYS.workflow(id),
    queryFn:  () => approvalsApi.getWorkflow(id),
    enabled:  !!id,
  })
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: CreateWorkflowPayload) => approvalsApi.createWorkflow(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.workflows })
      toast.success('Workflow créé')
    },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateApprovalWorkflow(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<CreateWorkflowPayload>) => approvalsApi.updateWorkflow(id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.workflows })
      qc.invalidateQueries({ queryKey: KEYS.workflow(id) })
      toast.success('Workflow mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteApprovalWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approvalsApi.deleteWorkflow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.workflows })
      toast.success('Workflow désactivé')
    },
    onError: () => toast.error('Impossible de supprimer ce workflow (demandes actives ?)'),
  })
}

export function useApprovalRequests(params?: ListRequestsParams) {
  return useQuery({
    queryKey: KEYS.requests(params),
    queryFn:  () => approvalsApi.listRequests(params),
    staleTime: 15_000,
  })
}

export function useApprovalRequest(id: string) {
  return useQuery({
    queryKey: KEYS.request(id),
    queryFn:  () => approvalsApi.getRequest(id),
    enabled:  !!id,
  })
}

export function useApprovalPendingCount() {
  return useQuery({
    queryKey: KEYS.pendingCount,
    queryFn:  approvalsApi.pendingCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ApprovePayload }) =>
      approvalsApi.approve(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Document approuvé')
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  })
}

export function useReject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectPayload }) =>
      approvalsApi.reject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Document rejeté')
    },
    onError: () => toast.error('Erreur lors du rejet'),
  })
}

export function useDelegate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DelegatePayload }) =>
      approvalsApi.delegate(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      toast.success('Décision déléguée')
    },
    onError: () => toast.error('Erreur lors de la délégation'),
  })
}
