import type { StockStatus } from '../types'

const CONFIG: Record<StockStatus, { label: string; color: string; bg: string }> = {
  normal:   { label: 'Normal',    color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  bas:      { label: 'Stock bas', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  rupture:  { label: 'Rupture',   color: '#dc2626', bg: 'rgba(239,68,68,0.1)' },
  surstock: { label: 'Surstock',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
}

interface Props {
  status: StockStatus
}

export function StockStatusBadge({ status }: Props) {
  const { label, color, bg } = CONFIG[status] ?? CONFIG.normal
  return (
    <span
      aria-label={`Statut stock : ${label}`}
      style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 20,
        background: bg, color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
