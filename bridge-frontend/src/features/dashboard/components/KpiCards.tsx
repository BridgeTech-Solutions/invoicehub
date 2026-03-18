'use client'

import { TrendingUp, FileText, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { useDashboardKpis } from '../hooks'
import { formatXAF } from '@/lib/utils'
import Link from 'next/link'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)' }} className="animate-pulse" />
      </div>
      <div style={{ height: 26, width: 160, background: 'var(--border)', borderRadius: 4, marginBottom: 10 }} className="animate-pulse" />
      <div style={{ height: 11, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Single card ───────────────────────────────────────────────
interface KpiCardProps {
  label:    string
  value:    string
  sub:      string
  trend:    'up' | 'down' | 'neutral'
  icon:     React.ElementType
  color:    string
  bg:       string
  href?:    string
}

function KpiCard({ label, value, sub, trend, icon: Icon, color, bg, href }: KpiCardProps) {
  return (
    <div className="card card-hover" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{
          fontSize: 11.5,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-3)',
        }}>
          {label}
        </p>
        <span
          className="flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, background: bg, flexShrink: 0 }}
        >
          <Icon size={17} style={{ color }} strokeWidth={2} />
        </span>
      </div>

      <p className="amount" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 8 }}>
        {value}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {trend === 'up'      && <ArrowUpRight   size={13} style={{ color: '#16a34a' }} strokeWidth={2.5} />}
          {trend === 'down'    && <ArrowDownRight  size={13} style={{ color: '#dc2626' }} strokeWidth={2.5} />}
          {trend === 'neutral' && <Minus           size={13} style={{ color: 'var(--text-3)' }} strokeWidth={2.5} />}
          <span style={{
            fontSize: 12,
            color: trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : 'var(--text-3)',
            fontWeight: 500,
          }}>
            {sub}
          </span>
        </div>
        {href && (
          <Link
            href={href}
            style={{ fontSize: 11.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
          >
            Voir →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function KpiCards() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    )
  }

  if (!data) return null

  const cards: KpiCardProps[] = [
    {
      label: 'CA du mois',
      value: formatXAF(data.invoices.thisMonthAmount),
      sub:   `${data.invoices.thisMonthCount} facture${data.invoices.thisMonthCount !== 1 ? 's' : ''} émise${data.invoices.thisMonthCount !== 1 ? 's' : ''}`,
      trend: data.invoices.thisMonthAmount > 0 ? 'up' : 'neutral',
      icon:  TrendingUp,
      color: '#2D7DD2',
      bg:    'rgba(45,125,210,0.08)',
    },
    {
      label: 'Factures émises',
      value: data.invoices.totalCount.toString(),
      sub:   `${data.invoices.thisMonthCount} ce mois`,
      trend: 'up',
      icon:  FileText,
      color: '#10b981',
      bg:    'rgba(16,185,129,0.08)',
      href:  ROUTES.INVOICES,
    },
    {
      label: 'Créances en attente',
      value: formatXAF(data.pending.amount),
      sub:   `${data.pending.count} facture${data.pending.count !== 1 ? 's' : ''}`,
      trend: 'neutral',
      icon:  Clock,
      color: '#d97706',
      bg:    'rgba(217,119,6,0.08)',
      href:  ROUTES.INVOICES,
    },
    {
      label: 'Factures en retard',
      value: data.overdue.count.toString(),
      sub:   formatXAF(data.overdue.amount),
      trend: data.overdue.count > 0 ? 'down' : 'neutral',
      icon:  AlertTriangle,
      color: '#ef4444',
      bg:    'rgba(239,68,68,0.08)',
      href:  ROUTES.INVOICES,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {cards.map((card) => <KpiCard key={card.label} {...card} />)}
    </div>
  )
}
