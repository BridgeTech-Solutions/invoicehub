import { STATUS_LABELS } from '@/lib/constants'
import { computeEffectiveStatus } from '@/features/approvals/effectiveStatus'
import type { InvoiceStatus } from './types'

/**
 * Statut effectif d'une facture (statut métier + surcouche approbation), pour
 * l'affichage. Délègue la logique commune à `computeEffectiveStatus` et ajoute la
 * classe de badge (globals.css) propre aux factures.
 *
 * L'approbation ne surcouche que tant que la facture est en brouillon : une
 * approbation finale déclenche l'auto-émission → `status = 'issued'` (le filigrane
 * BROUILLON disparaît), donc plus de surcouche.
 */
export type EffectiveStatusKey = InvoiceStatus | 'pending_approval' | 'approval_rejected'

export interface EffectiveStatus {
  key: EffectiveStatusKey
  label: string
  fullLabel: string
  /** Classe CSS du badge (voir globals.css). */
  badgeClass: string
  fromApproval: boolean
}

const BADGE_CLASS: Record<string, string> = {
  draft:             'badge-draft',
  issued:            'badge-issued',
  partially_paid:    'badge-partial',
  paid:              'badge-paid',
  overdue:           'badge-overdue',
  cancelled:         'badge-cancelled',
  pending_approval:  'badge-pending',
  approval_rejected: 'badge-rejected',
}

export function getEffectiveStatus(invoice: {
  status: InvoiceStatus
  approvalRequest?: { status: string; currentStep: number; totalSteps: number } | null
  requiresApproval?: boolean
}): EffectiveStatus {
  const eff = computeEffectiveStatus({
    status: invoice.status,
    overlayWhen: invoice.status === 'draft',
    approvalRequest: invoice.approvalRequest,
    statusLabels: STATUS_LABELS,
  })
  return {
    ...eff,
    key: eff.key as EffectiveStatusKey,
    badgeClass: BADGE_CLASS[eff.key] ?? 'badge-draft',
  }
}
