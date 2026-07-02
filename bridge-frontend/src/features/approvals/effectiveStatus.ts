/**
 * Statut « effectif » d'un document = combinaison de son statut métier et de
 * l'état du workflow d'approbation, **pour l'affichage uniquement**.
 *
 * Le modèle garde volontairement les deux séparés (l'approbation est un workflow
 * transverse réutilisé par tous les documents : factures, proformas, bons de
 * commande, factures fournisseur, dépenses). Ce helper générique les fusionne en
 * un seul badge clair, sans toucher aux données ni à la comptabilité.
 *
 * Règle : l'approbation ne « surcouche » le statut que tant que le document est
 * dans sa phase éditable (brouillon). Une fois émis/validé/payé, le statut métier
 * prime (une approbation finale déclenche l'action → plus de surcouche).
 */
export interface ApprovalLike {
  status: string
  currentStep: number
  totalSteps: number
}

export interface EffectiveDocStatus {
  /** Clé = surcouche approbation (`pending_approval` / `approval_rejected`) ou le statut métier. */
  key: string
  /** Libellé court pour un badge (ex. « En attente 2/3 »). */
  label: string
  /** Libellé complet pour tooltip / détail. */
  fullLabel: string
  /** true quand l'état affiché provient du workflow d'approbation. */
  fromApproval: boolean
}

export function computeEffectiveStatus(args: {
  status: string
  /** L'approbation ne surcouche que si le document est dans sa phase éditable (brouillon). */
  overlayWhen: boolean
  approvalRequest?: ApprovalLike | null
  statusLabels: Record<string, string>
}): EffectiveDocStatus {
  const { status, overlayWhen, approvalRequest: ar, statusLabels } = args

  if (overlayWhen && ar) {
    if (ar.status === 'pending') {
      return {
        key: 'pending_approval',
        label: `En attente ${ar.currentStep}/${ar.totalSteps}`,
        fullLabel: `En attente d'approbation (étape ${ar.currentStep}/${ar.totalSteps})`,
        fromApproval: true,
      }
    }
    if (ar.status === 'rejected') {
      return {
        key: 'approval_rejected',
        label: 'Refusée',
        fullLabel: 'Approbation refusée — à corriger et resoumettre',
        fromApproval: true,
      }
    }
  }

  const label = statusLabels[status] ?? status
  return { key: status, label, fullLabel: label, fromApproval: false }
}

/**
 * Libellé + icône du bouton d'action principal selon que l'action déclenchera
 * une soumission pour validation (workflow d'approbation) ou l'action directe.
 */
export function submitButtonState(args: {
  /** true si une demande d'approbation est en cours (pending). */
  isPending: boolean
  /** true si la dernière demande a été refusée (à resoumettre). */
  wasRejected: boolean
  /** true si l'action déclenchera une soumission pour validation. */
  willSubmit: boolean
  /** Libellé de l'action directe quand aucune approbation ne s'applique (ex. « Émettre la facture »). */
  directLabel: string
}): { label: string; disabled: boolean; variant: 'pending' | 'submit' | 'direct' } {
  if (args.isPending) return { label: "En attente d'approbation...", disabled: true, variant: 'pending' }
  if (args.willSubmit || args.wasRejected) {
    return {
      label: args.wasRejected ? 'Resoumettre pour validation' : 'Soumettre pour validation',
      disabled: false,
      variant: 'submit',
    }
  }
  return { label: args.directLabel, disabled: false, variant: 'direct' }
}
