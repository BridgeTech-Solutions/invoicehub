'use client'

import { useMemo } from 'react'
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
import { useCashflowForecast } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'
import type { CashflowDay } from '../types'

// ─── Date helpers ──────────────────────────────────────────────
// "2026-04-15" → "15/04" (court, pour l'axe X)
function shortDate(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}
// "2026-04-15" → "15/04/2026" (long, pour le tooltip)
function longDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${yyyy}`
}

// ─── Chart point ───────────────────────────────────────────────
interface ForecastPoint {
  iso:        string
  display:    string   // JJ/MM pour XAxis
  cumulative: number
  expected:   number
  count:      number
}

// ─── Custom tooltip ────────────────────────────────────────────
function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null
  const point = payload[0].payload as ForecastPoint

  return (
    <div style={{
      background: '#0c2340',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      minWidth: 160,
    }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
        {longDate(point.iso)}
      </p>
      <p className="amount" style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
        Cumul : {format(point.cumulative)}
      </p>
      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)' }}>
        Attendu ce jour : <span className="amount">{format(point.expected)}</span>
      </p>
      {point.count > 0 && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {point.count} facture{point.count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function ForecastSkeleton() {
  return (
    <div className="card" style={{ padding: '20px 20px 16px', height: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ height: 16, width: 220, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 14, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      <div style={{ height: 250, background: 'var(--border)', borderRadius: 8, opacity: 0.4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * CashflowForecast — encaissements clients attendus sur 30 jours (pleine largeur).
 * Trace le CUMUL des encaissements estimés depuis l'historique de paiement clients
 * (échéance + retard moyen). NB : prévision de RECETTES uniquement — ne déduit pas
 * les décaissements (fournisseurs, dépenses) et ne part pas du solde bancaire.
 */
export function CashflowForecast() {
  const { format } = useCurrency()
  const { data, isLoading } = useCashflowForecast()

  const points = useMemo((): ForecastPoint[] => {
    if (!data?.length) return []
    return data.map((d: CashflowDay) => ({
      iso:        d.date,
      display:    shortDate(d.date),
      cumulative: d.cumulative,
      expected:   d.expected,
      count:      d.invoiceCount,
    }))
  }, [data])

  if (isLoading) return <ForecastSkeleton />

  const totalExpected = points.length ? points[points.length - 1].cumulative : 0

  return (
    <div className="card" style={{ padding: '20px 20px 16px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
        <div>
          <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            Encaissements attendus — 30 jours
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Total prévu :{' '}
            <span className="amount" style={{ color: 'var(--j-bank)', fontWeight: 600 }}>{format(totalExpected)}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · hors décaissements</span>
          </p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 16, height: 250 }}>
        {points.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', padding: '0 24px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Aucun encaissement prévu</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 360 }}>
              L&apos;estimation est basée sur l&apos;historique de paiement clients. Elle apparaîtra dès que des factures à échéance future seront enregistrées.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              aria-label="Graphique des encaissements clients attendus sur 30 jours — cumul, hors décaissements"
              role="img"
            >
              <defs>
                <linearGradient id="cashflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2D7DD2" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2D7DD2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="display"
                tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-body)' }}
                axisLine={false}
                tickLine={false}
                dy={4}
                interval="preserveStartEnd"
                minTickGap={24}
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
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--j-bank)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#2D7DD2"
                strokeWidth={2.5}
                fill="url(#cashflowGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#2D7DD2', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table alternative pour screen readers — WCAG AAA 1.4.9 */}
      <table className="sr-only" aria-label="Données de prévision de trésorerie sur 30 jours">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Attendu ce jour (XAF)</th>
            <th scope="col">Cumul (XAF)</th>
            <th scope="col">Factures</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.iso}>
              <td>{longDate(p.iso)}</td>
              <td>{format(p.expected)}</td>
              <td>{format(p.cumulative)}</td>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
