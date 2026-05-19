import type { StockMovementType } from '../types'

const CONFIG: Record<StockMovementType, { label: string; color: string; bg: string }> = {
  purchase_receipt: { label: 'Réception achat',   color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)' },
  sale:             { label: 'Vente',              color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  adjustment_in:    { label: 'Ajust. entrée',      color: '#16a34a', bg: 'rgba(34,197,94,0.1)'  },
  adjustment_out:   { label: 'Ajust. sortie',      color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
  write_off:        { label: 'Mise au rebut',      color: '#dc2626', bg: 'rgba(239,68,68,0.1)'  },
  return_supplier:  { label: 'Retour fournisseur', color: '#0891b2', bg: 'rgba(8,145,178,0.1)'  },
  return_customer:  { label: 'Retour client',      color: '#16a34a', bg: 'rgba(34,197,94,0.1)'  },
  initial_stock:    { label: 'Stock initial',      color: '#64748b', bg: 'rgba(100,116,139,0.1)'},
  transfer_in:      { label: 'Transfert entrée',   color: '#0891b2', bg: 'rgba(8,145,178,0.1)'  },
  transfer_out:     { label: 'Transfert sortie',   color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
}

interface Props {
  type: StockMovementType
}

export function MovementTypeBadge({ type }: Props) {
  const cfg = CONFIG[type]
  if (!cfg) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{type}</span>
  return (
    <span
      style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 20,
        background: cfg.bg, color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
