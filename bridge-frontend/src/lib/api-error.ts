import { AxiosError } from 'axios'

/**
 * Extrait le message d'erreur lisible renvoyé par l'API.
 *
 * Le backend (NestJS + AppError) répond `{ success: false, message: string }`.
 * Sans ce helper, les hooks affichent un toast générique (« Erreur lors de … »)
 * et perdent le message métier précis — ex. « Stock insuffisant pour « X » :
 * disponible 5, demandé 12 ». On privilégie toujours ce message au fallback.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{ message?: string | string[] }>
  const msg = ax?.response?.data?.message
  if (Array.isArray(msg)) return msg.filter(Boolean).join(' · ') || fallback
  if (typeof msg === 'string' && msg.trim()) return msg
  return fallback
}

/**
 * Code métier renvoyé par l'API (`AppError.code`). Permet de distinguer les
 * issues « normales » des vraies erreurs — ex. APPROVAL_SUBMITTED /
 * APPROVAL_PENDING doivent s'afficher comme une info, pas une erreur rouge.
 */
export function getApiErrorCode(error: unknown): string | undefined {
  const ax = error as AxiosError<{ code?: string }>
  return ax?.response?.data?.code
}

/** Codes du workflow d'approbation : issue attendue, pas une erreur. */
export const APPROVAL_CODES = ['APPROVAL_SUBMITTED', 'APPROVAL_PENDING'] as const
export function isApprovalFlowCode(code?: string): boolean {
  return !!code && (APPROVAL_CODES as readonly string[]).includes(code)
}
