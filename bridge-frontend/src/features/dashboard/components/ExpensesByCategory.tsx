'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, type TooltipProps,
} from 'recharts'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'

// Palette catégorielle dérivée des tokens de la charte Bridge.
// primary, j-purchase, d97706 (ambre), succès, cyan, slate.
const CATEGORY_PALETTE = [
  '#2D7DD2', // --primary
  '#7c3aed', // --j-purchase
  '#d97706', // ambre dépenses
  '#16a34a', // succès
  '#0891b2', // cyan
  '#64748b', // slate (fallback / "Autres")
]

interface CategorySlice {
  label: string
  value: number
  count: number
  color: string
}

// Seuil de bascule donut → barres horizontales (no-pie au-delà).
const DONUT_MAX = 5

// ─── Tooltip donut ─────────────────────────────────────────────
function DonutTooltip({ active, payload }: TooltipProps<number, string>) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null
  const slice = payload[0].payload as CategorySlice & { __total: number }
  const pct = slice.__total > 0 ? Math.round((slice.value / slice.__total) * 100) : 0
  return (
    <div style={{ background: '#0c2340', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: slice.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{slice.label}</span>
      </div>
      <p className="amount" style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
        {format(slice.value)} ({pct}%)
      </p>
    </div>
  )
}

// ─── Tooltip barres ────────────────────────────────────────────
function BarTooltip({ active, payload }: TooltipProps<number, string>) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null
  const slice = payload[0].payload as CategorySlice & { __total: number }
  const pct = slice.__total > 0 ? Math.round((slice.value / slice.__total) * 100) : 0
  return (
    <div style={{ background: '#0c2340', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: slice.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{slice.label}</span>
      </div>
      <p className="amount" style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
        {format(slice.value)} ({pct}%)
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function ExpensesSkeleton() {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 16, width: 180, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 180, background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * ExpensesByCategory — répartition des dépenses du mois par catégorie.
 * Règle no-pie : ≤ 5 catégories → donut ; > 5 → barres horizontales.
 */
export function ExpensesByCategory() {
  const { format } = useCurrency()
  const { data, isLoading } = useDashboardKpis()

  const slices = useMemo((): CategorySlice[] => {
    if (!data?.expensesByCategory?.length) return []
    return data.expensesByCategory
      .filter((c) => c.totalAmount > 0)
      .map((c, i) => ({
        label: c.categoryName,
        value: c.totalAmount,
        count: c.count,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      }))
  }, [data])

  const total = useMemo(() => slices.reduce((s, d) => s + d.value, 0), [slices])
  const slicesWithTotal = useMemo(
    () => slices.map((s) => ({ ...s, __total: total })),
    [slices, total],
  )

  if (isLoading) return <ExpensesSkeleton />

  const useDonut = slices.length <= DONUT_MAX

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            Dépenses par catégorie
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Total :{' '}
            <span className="amount" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{format(total)}</span>
          </p>
        </div>
        <Link
          href={ROUTES.EXPENSES}
          aria-label="Voir les dépenses"
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}
        >
          Voir les dépenses →
        </Link>
      </div>

      {slices.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune dépense enregistrée ce mois</p>
        </div>
      ) : useDonut ? (
        /* ── DONUT (≤ 5 catégories) ───────────────────────────── */
        <>
          <div style={{ height: 168, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart aria-label={`Répartition des dépenses du mois par catégorie — ${slices.length} catégories`} role="img">
                <Pie
                  data={slicesWithTotal}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={74}
                  dataKey="value" paddingAngle={2}
                  startAngle={90} endAngle={-270}
                >
                  {slicesWithTotal.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <p className="amount" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{format(total)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>ce mois</p>
            </div>
          </div>

          {/* Légende avec montant + % */}
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }} aria-label="Légende des catégories de dépenses">
            {slices.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
              return (
                <li key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }} className="truncate">{s.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} aria-label={`${s.label} : ${format(s.value)}, ${pct}%`}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }} aria-hidden="true">{pct}%</span>
                    <span className="amount" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }} aria-hidden="true">{format(s.value)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        /* ── BARRES HORIZONTALES (> 5 catégories) ─────────────── */
        <div style={{ height: Math.max(180, slices.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={slicesWithTotal}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
              aria-label={`Répartition des dépenses du mois par catégorie — ${slices.length} catégories`}
              role="img"
            >
              <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
                  return `${v}`
                }}
                tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11.5, fill: 'var(--text-2)', fontFamily: 'var(--font-body)' }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--bg)' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                {slicesWithTotal.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table alternative pour screen readers — WCAG AAA 1.4.9 */}
      <table className="sr-only" aria-label="Répartition des dépenses du mois par catégorie">
        <thead>
          <tr>
            <th scope="col">Catégorie</th>
            <th scope="col">Montant (XAF)</th>
            <th scope="col">Pourcentage</th>
            <th scope="col">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>{format(s.value)}</td>
              <td>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</td>
              <td>{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
