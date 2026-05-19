export type ApprovalDocumentType = 'invoice' | 'proforma' | 'purchase_order' | 'supplier_invoice' | 'expense'
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'
export type ApprovalDecisionType = 'approved' | 'rejected' | 'delegated'
export type ApprovalTriggerOperator = 'gte' | 'lte' | 'eq' | 'gt' | 'lt'

export interface ApprovalWorkflowTrigger {
  id:           string
  documentType: ApprovalDocumentType
  field:        string
  operator:     ApprovalTriggerOperator
  value:        string
}

export interface ApprovalWorkflowStep {
  id:              string
  order:           number
  name:            string
  description?:    string | null
  approverRole?:   string | null
  approverUserId?: string | null
  approverUser?:   { id: string; firstName: string; lastName: string; email: string } | null
  deadlineHours?:  number | null
  requireComment:  boolean
  allowDelegate:   boolean
}

export interface ApprovalWorkflow {
  id:           string
  name:         string
  description?: string | null
  isActive:     boolean
  priority:     number
  triggers:     ApprovalWorkflowTrigger[]
  steps:        ApprovalWorkflowStep[]
  createdAt:    string
}

export interface ApprovalDecision {
  id:          string
  stepId:      string
  stepOrder:   number
  step:        ApprovalWorkflowStep
  decidedBy:   { id: string; firstName: string; lastName: string; avatarPath: string | null }
  decidedAt:   string
  decision:    ApprovalDecisionType
  comment?:    string | null
  delegatedTo?: { id: string; firstName: string; lastName: string } | null
}

export interface ApprovalRequest {
  id:             string
  workflowId:     string
  workflow:       ApprovalWorkflow
  documentType:   ApprovalDocumentType
  documentId:     string
  documentNumber: string | null
  documentSnapshot: Record<string, unknown>
  status:         ApprovalRequestStatus
  currentStep:    number
  totalSteps:     number
  requestedBy:    { id: string; firstName: string; lastName: string; avatarPath: string | null }
  requestedAt:    string
  resolvedBy?:    { id: string; firstName: string; lastName: string } | null
  resolvedAt?:    string | null
  expiresAt?:     string | null
  decisions:      ApprovalDecision[]
  isMyTurn:       boolean
}

export interface CreateWorkflowPayload {
  name:         string
  description?: string
  isActive:     boolean
  priority:     number
  triggers:     Omit<ApprovalWorkflowTrigger, 'id'>[]
  steps:        Omit<ApprovalWorkflowStep, 'id' | 'approverUser'>[]
}

export interface ApprovePayload  { comment?: string }
export interface RejectPayload   { comment:  string }
export interface DelegatePayload { delegatedToId: string; comment?: string }

export interface ListRequestsParams {
  status?:        ApprovalRequestStatus
  documentType?:  ApprovalDocumentType
  pendingForMe?:  boolean
  page?:          number
  limit?:         number
}

export interface PaginatedApprovalRequests {
  data:       ApprovalRequest[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  invoice:          'Facture',
  proforma:         'Proforma',
  purchase_order:   'Bon de commande',
  supplier_invoice: 'Facture fournisseur',
  expense:          'Dépense',
}

export const DOCUMENT_TYPE_COLORS: Record<ApprovalDocumentType, { bg: string; color: string }> = {
  invoice:          { bg: 'rgba(16,185,129,0.1)',  color: '#10b981' },
  proforma:         { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  purchase_order:   { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6' },
  supplier_invoice: { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  expense:          { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
}

export const STATUS_CONFIG: Record<ApprovalRequestStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'En attente',  color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  approved:  { label: 'Approuvé',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  rejected:  { label: 'Rejeté',     color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  cancelled: { label: 'Annulé',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  expired:   { label: 'Expiré',     color: '#9333ea', bg: 'rgba(147,51,234,0.1)' },
}

export const TRIGGER_FIELD_LABELS: Record<string, string> = {
  totalTtc: 'Montant TTC',
  totalHt:  'Montant HT',
  type:     'Type de document',
  amountTtc: 'Montant TTC',
  totalTtcNumber: 'Montant TTC',
}

export const OPERATOR_LABELS: Record<ApprovalTriggerOperator, string> = {
  gte: '≥',
  lte: '≤',
  eq:  '=',
  gt:  '>',
  lt:  '<',
}
