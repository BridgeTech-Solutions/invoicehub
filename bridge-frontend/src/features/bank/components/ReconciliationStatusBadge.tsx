import type { ReconciliationStatus } from '../types'

const CONFIG: Record<ReconciliationStatus, { label: string; color: string; bg: string }> = {
  pending:    { label: 'En attente',     color: '#d97706', bg: '#fef3c7' },
  reconciled: { label: 'Rapproché',      color: '#16a34a', bg: '#dcfce7' },
  unmatched:  { label: 'Non identifié',  color: '#dc2626', bg: '#fee2e2' },
  ignored:    { label: 'Ignoré',         color: '#64748b', bg: '#f1f5f9' },
}

interface ReconciliationStatusBadgeProps {
  status: ReconciliationStatus
}

export function ReconciliationStatusBadge({ status }: ReconciliationStatusBadgeProps) {
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
