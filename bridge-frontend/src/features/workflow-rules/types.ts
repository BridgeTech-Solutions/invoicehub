export interface WorkflowAction {
  type:   string
  config: Record<string, unknown>
}

export interface WorkflowRule {
  id:           string
  name:         string
  description?: string | null
  module:       string
  triggerEvent: string
  conditions:   Record<string, unknown>
  actions:      WorkflowAction[]
  isActive:     boolean
  priority:     number
  createdAt:    string
  updatedAt:    string
  createdById?: string | null
}

export interface CreateWorkflowRuleInput {
  name:         string
  entityType:   string   // maps to module in backend
  triggerEvent: string
  conditions?:  Record<string, unknown>
  actions:      WorkflowAction[]
  isActive?:    boolean
}

// ── Catalogue des modules et événements déclencheurs ─────────

export const WORKFLOW_MODULES = [
  { value: 'invoice',   label: 'Factures' },
  { value: 'proforma',  label: 'Proformas' },
  { value: 'payment',   label: 'Paiements' },
  { value: 'client',    label: 'Clients' },
  { value: 'expense',   label: 'Dépenses' },
  { value: 'stock',     label: 'Stock' },
] as const

export const TRIGGER_EVENTS: Record<string, { value: string; label: string }[]> = {
  invoice: [
    { value: 'invoice.created',   label: 'Facture créée' },
    { value: 'invoice.issued',    label: 'Facture émise' },
    { value: 'invoice.paid',      label: 'Facture payée' },
    { value: 'invoice.overdue',   label: 'Facture en retard' },
    { value: 'invoice.cancelled', label: 'Facture annulée' },
  ],
  proforma: [
    { value: 'proforma.created',  label: 'Proforma créé' },
    { value: 'proforma.sent',     label: 'Proforma envoyé' },
    { value: 'proforma.accepted', label: 'Proforma accepté' },
    { value: 'proforma.rejected', label: 'Proforma rejeté' },
    { value: 'proforma.expired',  label: 'Proforma expiré' },
  ],
  payment: [
    { value: 'payment.created', label: 'Paiement enregistré' },
    { value: 'payment.deleted', label: 'Paiement supprimé' },
  ],
  client: [
    { value: 'client.created',  label: 'Client créé' },
    { value: 'client.archived', label: 'Client archivé' },
  ],
  expense: [
    { value: 'expense.created',  label: 'Dépense créée' },
    { value: 'expense.approved', label: 'Dépense approuvée' },
    { value: 'expense.rejected', label: 'Dépense rejetée' },
  ],
  stock: [
    { value: 'stock.low_alert', label: 'Stock faible (alerte)' },
    { value: 'stock.movement',  label: 'Mouvement de stock' },
  ],
}

export const ACTION_TYPES = [
  { value: 'send_notification', label: 'Envoyer une notification interne' },
  { value: 'send_email',        label: 'Envoyer un email' },
  { value: 'send_webhook',      label: 'Déclencher un webhook' },
  { value: 'change_status',     label: 'Changer le statut du document' },
] as const

export type ActionType = typeof ACTION_TYPES[number]['value']
