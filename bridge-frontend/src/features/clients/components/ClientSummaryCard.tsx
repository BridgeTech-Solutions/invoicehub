'use client'

import { TrendingUp, CreditCard, Clock, AlertTriangle } from 'lucide-react'
import { useClientSummary } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'

interface ClientSummaryCardProps {
  clientId: string
}

export function ClientSummaryCard({ clientId }: ClientSummaryCardProps) {
  const { format } = useCurrency()
  const { data, isLoading } = useClientSummary(clientId)

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ height: 10, width: 100, background: 'var(--border)', borderRadius: 4, marginBottom: 10 }} className="animate-pulse" />
            <div style={{ height: 20, width: 130, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 10, width: 70, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  const stats = [
    {
      label:  'Total facturé',
      value:  format(data.totalInvoiced),
      sub:    `${data.invoiceCount} facture${data.invoiceCount !== 1 ? 's' : ''}`,
      icon:   TrendingUp,
      color:  '#2D7DD2',
      bg:     'rgba(45,125,210,0.08)',
    },
    {
      label:  'Total encaissé',
      value:  format(data.totalPaid),
      sub:    data.totalInvoiced > 0
        ? `${Math.round((data.totalPaid / data.totalInvoiced) * 100)}% du total`
        : '—',
      icon:   CreditCard,
      color:  '#22c55e',
      bg:     'rgba(34,197,94,0.08)',
    },
    {
      label:  'Reste à payer',
      value:  format(data.totalPending),
      sub:    `${data.pendingInvoiceCount} facture${data.pendingInvoiceCount !== 1 ? 's' : ''} en attente`,
      icon:   Clock,
      color:  data.totalPending > 0 ? '#d97706' : '#22c55e',
      bg:     data.totalPending > 0 ? 'rgba(217,119,6,0.08)' : 'rgba(34,197,94,0.08)',
    },
    {
      label:  'Factures en attente',
      value:  data.pendingInvoiceCount.toString(),
      sub:    data.pendingInvoiceCount === 0 ? 'Tout est réglé' : 'À relancer',
      icon:   AlertTriangle,
      color:  data.pendingInvoiceCount > 0 ? '#ef4444' : '#22c55e',
      bg:     data.pendingInvoiceCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
                {s.label}
              </p>
              <span style={{ width: 30, height: 30, borderRadius: 7, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} style={{ color: s.color }} strokeWidth={2} />
              </span>
            </div>
            <p className="amount" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
              {s.value}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.sub}</p>
          </div>
        )
      })}
    </div>
  )
}
