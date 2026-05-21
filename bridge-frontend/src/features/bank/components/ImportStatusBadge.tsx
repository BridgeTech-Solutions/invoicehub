import type { ImportStatus } from '../types'

const CONFIG: Record<ImportStatus, { label: string; color: string; bg: string }> = {
  pending:    { label: 'En attente',    color: '#64748b', bg: '#f1f5f9' },
  processing: { label: 'Traitement…',  color: '#9333ea', bg: '#f3e8ff' },
  completed:  { label: 'Terminé',      color: '#16a34a', bg: '#dcfce7' },
  failed:     { label: 'Échec',        color: '#dc2626', bg: '#fee2e2' },
  cancelled:  { label: 'Annulé',       color: '#64748b', bg: '#f1f5f9' },
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const { label, color, bg } = CONFIG[status] ?? CONFIG.pending
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 9px',
      borderRadius: 99,
      fontSize: 11.5,
      fontWeight: 600,
      letterSpacing: '0.01em',
      fontFamily: 'var(--font-display)',
      color,
      background: bg,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
