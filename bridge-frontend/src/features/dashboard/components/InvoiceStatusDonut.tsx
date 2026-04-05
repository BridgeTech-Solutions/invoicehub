'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, type TooltipProps } from 'recharts'
import { useDashboardKpis } from '../hooks'

interface DonutSlice {
  label:  string
  value:  number
  color:  string
}

// ─── Custom tooltip ────────────────────────────────────────────
function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const { label, value, color } = payload[0].payload as DonutSlice
  const total: number = payload[0].payload.__total ?? 0
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{
      background: '#0c2340',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '8px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 13, color: '#fff', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {value} ({pct}%)
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function DonutSkeleton() {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 16, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--border)', margin: '0 auto', opacity: 0.5 }} className="animate-pulse" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ height: 11, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            <div style={{ height: 11, width: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function InvoiceStatusDonut() {
  const { data, isLoading } = useDashboardKpis()

  // Derive distribution from KPI data
  const slices = useMemo((): DonutSlice[] => {
    if (!data) return []

    const overdueCount      = data.overdue.count
    const pendingNotOverdue = Math.max(0, data.pending.count - overdueCount)
    const totalIssued       = data.invoices.totalCount
    const paidCount         = Math.max(0, totalIssued - data.pending.count)
    const draftCount        = data.drafts?.count ?? 0

    return [
      { label: 'Payées',      value: paidCount,          color: '#22c55e' },
      { label: 'En attente',  value: pendingNotOverdue,  color: '#3b82f6' },
      { label: 'En retard',   value: overdueCount,       color: '#ef4444' },
      { label: 'Brouillons',  value: draftCount,         color: '#94a3b8' },
    ].filter(s => s.value > 0)
  }, [data])

  const total = useMemo(() => slices.reduce((s, d) => s + d.value, 0), [slices])
  const slicesWithTotal = useMemo(() =>
    slices.map(s => ({ ...s, __total: total })),
    [slices, total]
  )

  if (isLoading) return <DonutSkeleton />

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          Statuts des factures
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {total} facture{total !== 1 ? 's' : ''}
          {(data?.drafts?.count ?? 0) > 0 && (
            <span style={{ color: '#94a3b8', marginLeft: 4 }}>
              (dont {data?.drafts?.count} brouillon{(data?.drafts?.count ?? 0) > 1 ? 's' : ''})
            </span>
          )}
        </p>
      </div>

      {/* Donut chart */}
      <div style={{ height: 160, position: 'relative' }}>
        {total === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Aucune donnée</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart
                aria-label={`Répartition des ${total} factures par statut`}
                role="img"
              >
                <Pie
                  data={slicesWithTotal}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  dataKey="value"
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {slicesWithTotal.map((entry, i) => (
                    <Cell key={entry.label} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}>
              <p className="amount" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{total}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>factures</p>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }} aria-label="Légende du graphique">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
          return (
            <li key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{s.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-label={`${s.value} factures, ${pct}%`}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }} aria-hidden="true">{pct}%</span>
                <span className="amount" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }} aria-hidden="true">
                  {s.value}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Table alternative pour screen readers — WCAG AAA 1.4.9 */}
      <table className="sr-only" aria-label="Répartition des factures par statut">
        <thead>
          <tr>
            <th scope="col">Statut</th>
            <th scope="col">Nombre</th>
            <th scope="col">Pourcentage</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>{s.value}</td>
              <td>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
