'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps,
} from 'recharts'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'
import type { PeriodToggle, ChartDataPoint } from '../types'

// ─── Month labels ──────────────────────────────────────────────
const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
  '05': 'Mai', '06': 'Juin','07': 'Juil','08': 'Aoû',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
}

const QUARTER_LABELS: Record<string, string> = {
  '1': 'T1 (Jan–Mar)',
  '2': 'T2 (Avr–Jun)',
  '3': 'T3 (Jul–Sep)',
  '4': 'T4 (Oct–Déc)',
}

// ─── Custom tooltip ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0c2340',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p className="amount" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
        {format(payload[0].value ?? 0)}
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="card" style={{ padding: '20px 20px 16px', height: 290 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ height: 16, width: 180, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 28, width: 180, background: 'var(--border)', borderRadius: 20 }} className="animate-pulse" />
      </div>
      <div style={{ height: 220, background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function RevenueChart() {
  const { format } = useCurrency()
  const { data, isLoading } = useDashboardKpis()
  const [period, setPeriod] = useState<PeriodToggle>('month')

  const chartData = useMemo((): ChartDataPoint[] => {
    if (!data?.monthlyRevenue?.length) return []

    const raw = data.monthlyRevenue  // [{ month: "2026-03", total: ... }, ...]

    if (period === 'month') {
      return raw.map((r) => {
        const [, mm] = r.month.split('-')
        return {
          label:   r.month,
          display: MONTH_LABELS[mm] ?? mm,
          value:   r.total,
        }
      })
    }

    if (period === 'quarter') {
      const quarters: Record<string, number> = {}
      for (const r of raw) {
        const [, mm] = r.month.split('-')
        const q = String(Math.ceil(parseInt(mm, 10) / 3))
        quarters[q] = (quarters[q] ?? 0) + r.total
      }
      return Object.entries(quarters)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([q, total]) => ({
          label:   `T${q}`,
          display: QUARTER_LABELS[q] ?? `T${q}`,
          value:   total,
        }))
    }

    // year: single total
    const total = raw.reduce((s, r) => s + r.total, 0)
    const year  = raw[0]?.month.slice(0, 4) ?? ''
    return [{ label: year, display: year, value: total }]
  }, [data, period])

  const total = useMemo(() => chartData.reduce((s, d) => s + d.value, 0), [chartData])

  if (isLoading) return <ChartSkeleton />

  const periods: { key: PeriodToggle; label: string }[] = [
    { key: 'month',   label: 'Mensuel' },
    { key: 'quarter', label: 'Trimestriel' },
    { key: 'year',    label: 'Annuel' },
  ]

  return (
    <div className="card" style={{ padding: '20px 20px 16px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            Évolution du chiffre d&apos;affaires
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Total : <span className="amount" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{format(total)}</span>
          </p>
        </div>

        {/* Period toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 4,
            gap: 2,
          }}
        >
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'var(--font-display)',
                fontWeight: period === p.key ? 600 : 400,
                background: period === p.key ? 'var(--primary)' : 'transparent',
                color:      period === p.key ? '#fff' : 'var(--text-3)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 16, height: 220 }}>
        {chartData.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune donnée disponible</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              aria-label={`Graphique d'évolution du chiffre d'affaires — période : ${period}`}
              role="img"
            >
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2D7DD2" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#2D7DD2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="display"
                tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-body)' }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                tickFormatter={(v) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
                  return `${v}`
                }}
                tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2D7DD2"
                strokeWidth={2.5}
                fill="url(#revenueGrad)"
                dot={{ fill: '#2D7DD2', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#2D7DD2', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table alternative pour screen readers — WCAG AAA 1.4.9 */}
      <table className="sr-only" aria-label="Données du graphique CA">
        <thead>
          <tr>
            <th scope="col">Période</th>
            <th scope="col">Chiffre d&apos;affaires (XAF)</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((d) => (
            <tr key={d.label}>
              <td>{d.display}</td>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
