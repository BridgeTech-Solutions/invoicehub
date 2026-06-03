import type { ApprovalDocumentType } from '@prisma/client';

/** Nom de l'événement émis quand une demande d'approbation est entièrement approuvée. */
export const APPROVAL_COMPLETED = 'approval.completed';

/**
 * Émis par ApprovalsService à l'approbation finale. Chaque module concerné
 * (facture, BC, facture fournisseur) écoute et ré-exécute l'action initialement
 * demandée — AU NOM DU DEMANDEUR (`requestedById`), jamais de l'approbateur :
 * séparation des tâches (maker/checker). L'approbateur reste tracé séparément
 * dans le module d'approbation.
 */
export interface ApprovalCompletedEvent {
  documentType:   ApprovalDocumentType;
  documentId:     string;
  /** Le « maker » : celui qui a déclenché l'action et à qui l'émission est imputée. */
  requestedById:  string;
  /** Le « checker » : l'approbateur final (pour la traçabilité). */
  approverId:     string | null;
  documentNumber: string | null;
}

/** Résultat retourné par un listener qui a pris en charge l'auto-exécution. */
export interface AutoExecResult {
  ok:       boolean;
  message?: string;
}
