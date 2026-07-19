'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * État d'erreur pour une liste dont le chargement a échoué.
 *
 * À utiliser DANS la page, pas via une frontière d'erreur : les échecs de requête
 * React Query ne remontent pas à `error.tsx`. Sans cet état, une page qui affiche
 * `données ?? []` puis « Aucun résultat » ment à l'utilisateur — elle affirme que
 * la liste est vide alors qu'elle n'a rien pu charger. Le cas s'est produit sur les
 * notifications : compteur à 22, liste annoncée vide.
 *
 * L'icône double la couleur (l'information ne doit jamais reposer sur la teinte
 * seule) et l'action de reprise est toujours offerte.
 */
export function ListLoadError({
  message,
  onRetry,
  isRetrying = false,
  entity = 'les données',
}: {
  message?: string
  onRetry?: () => void
  isRetrying?: boolean
  /** Ce qui n'a pas pu être chargé, au pluriel : « les notifications ». */
  entity?: string
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 14, padding: '52px 24px', textAlign: 'center',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle size={21} style={{ color: '#dc2626' }} aria-hidden="true" />
      </div>

      <div style={{ maxWidth: 400 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
          Impossible de charger {entity}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
          {message ?? 'La connexion au serveur a échoué. Vérifiez votre réseau, puis réessayez.'}
        </p>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 'var(--radius-md)',
            background: 'var(--primary)', color: '#fff', border: 'none',
            cursor: isRetrying ? 'wait' : 'pointer', opacity: isRetrying ? 0.7 : 1,
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
          }}
        >
          <RotateCcw size={13} style={isRetrying ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          {isRetrying ? 'Nouvelle tentative…' : 'Réessayer'}
        </button>
      )}
    </div>
  )
}
