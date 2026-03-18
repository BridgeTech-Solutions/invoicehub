'use client'

import { useDashboardAging } from '../hooks'
import { formatXAF } from '@/lib/utils'

interface BucketConfig {
  key:     string
  label:   string
  sublabel: string
  color:   string
  bg:      string
}

const BUCKETS: BucketConfig[] = [
  { key: 'current',    label: 'À échoir',   sublabel: 'Non échu',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { key: 'days_1_30',  label: '1–30 j',     sublabel: 'En retard',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { key: 'days_31_60', label: '31–60 j',    sublabel: 'En retard',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  { key: 'days_61_90', label: '61–90 j',    sublabel: 'En retard',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
  { key: 'over_90',    label: '+ de 90 j',  sublabel: 'Critique',   color: '#dc2626', bg: 'rgba(220,38,38,0.1)'  },
]

// ─── Skeleton ─────────────────────────────────────────────────
function AgingSkeleton() {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ height: 16, width: 160, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} className="animate-pulse" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: 72, background: 'var(--border)', borderRadius: 8, opacity: 0.5 }} className="animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function AgingWidget() {
  const { data, isLoading } = useDashboardAging()

  if (isLoading) return <AgingSkeleton />
  if (!data)     return null

  // Skip if no outstanding balances
  if (data.total.amount === 0) return null

  return (
    <div className="card" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            Balance âgée des créances
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Total en attente :{' '}
            <span className="amount" style={{ fontWeight: 600, color: 'var(--text-1)' }}>
              {formatXAF(data.total.amount)}
            </span>
            {' '}— {data.total.count} facture{data.total.count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Buckets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {BUCKETS.map((b) => {
          const bucket = data[b.key as keyof typeof data] as { amount: number; count: number }
          const totalAmount = data.total.amount
          const pct = totalAmount > 0 ? Math.round((bucket.amount / totalAmount) * 100) : 0

          return (
            <div
              key={b.key}
              style={{
                background: bucket.amount > 0 ? b.bg : 'var(--bg)',
                border: `1px solid ${bucket.amount > 0 ? b.color + '30' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: bucket.amount > 0 ? b.color : 'var(--text-3)',
                  letterSpacing: '0.04em',
                }}>
                  {b.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {bucket.count} fac.
                </span>
              </div>

              <p className="amount" style={{
                fontSize: 13,
                fontWeight: 700,
                color: bucket.amount > 0 ? b.color : 'var(--text-3)',
                marginBottom: 4,
                lineHeight: 1.2,
              }}>
                {formatXAF(bucket.amount)}
              </p>

              {/* Mini bar */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: b.color,
                    opacity: bucket.amount > 0 ? 1 : 0.3,
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{pct}% du total</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
