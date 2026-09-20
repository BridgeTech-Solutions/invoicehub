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
  const ax = error as AxiosError<{
    message?: string | string[]
    // Erreurs de validation Zod : { champ: ["message", …] } (cf. all-exceptions.filter)
    errors?: Record<string, string[] | undefined>
  }>
  const data = ax?.response?.data
  const msg = data?.message

  let base: string | undefined
  if (Array.isArray(msg)) base = msg.filter(Boolean).join(' · ') || undefined
  else if (typeof msg === 'string' && msg.trim()) base = msg

  // Pour une erreur de validation, on annexe le détail par champ (« Données
  // invalides » seul n'aide pas l'utilisateur à savoir QUEL champ corriger).
  const detail = formatFieldErrors(data?.errors)
  if (detail) return base ? `${base} — ${detail}` : detail

  return base ?? fallback
}

/** Aplati `{ champ: ["msg", …] }` en « champ : msg1, msg2 ; … » lisible. */
function formatFieldErrors(errors?: Record<string, string[] | undefined>): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined
  const parts: string[] = []
  for (const [field, msgs] of Object.entries(errors)) {
    const list = (msgs ?? []).filter(Boolean)
    if (list.length === 0) continue
    const label = FIELD_LABELS[field] ?? field
    parts.push(`${label} : ${list.join(', ')}`)
  }
  return parts.length ? parts.join(' ; ') : undefined
}

/** Libellés FR des champs les plus courants (fallback = nom technique). */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', description: 'Description', priority: 'Priorité',
  triggers: 'Déclencheurs', steps: 'Étapes', actions: 'Actions',
  value: 'Valeur', deadlineHours: 'Délai (heures)',
  approverUserId: 'Approbateur', approverRole: 'Rôle approbateur',
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
