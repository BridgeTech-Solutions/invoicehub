'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useDashboardKpis } from '../hooks'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function StockSkeleton() {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
      <div style={{ flex: 1 }}>
        <div style={{ height: 13, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
        <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * StockAlerts — carte d'alerte sur les produits sous le seuil minimum.
 * 0 alerte → état vert "tout va bien" ; > 0 → carte d'avertissement.
 */
export function StockAlerts() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) return <StockSkeleton />
  if (!data) return null

  const count = data.stockAlerts

  // ── État OK (aucune alerte) ─────────────────────────────────
  if (count === 0) {
    return (
      <div
        className="card"
        style={{
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderLeft: '3px solid #16a34a',
        }}
      >
        <span
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(22,163,74,0.1)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <CheckCircle2 size={20} style={{ color: '#16a34a' }} strokeWidth={2} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
            Aucune alerte stock
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Tous les produits sont au-dessus du seuil minimum.
          </p>
        </div>
      </div>
    )
  }

  // ── État alerte (> 0) ───────────────────────────────────────
  return (
    <div
      className="card"
      style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderLeft: '3px solid var(--s-overdue)',
      }}
      role="alert"
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--s-overdue-bg)', flexShrink: 0 }}
        aria-hidden="true"
      >
        <AlertTriangle size={20} style={{ color: 'var(--s-overdue)' }} strokeWidth={2} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-display" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
          <span className="amount" style={{ color: 'var(--s-overdue)', fontWeight: 700 }}>{count}</span>
          {' '}produit{count !== 1 ? 's' : ''} sous le seuil minimum
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          Réapprovisionnement à prévoir.
        </p>
      </div>
      <Link
        href={ROUTES.STOCK_ALERTS}
        aria-label="Voir les alertes de stock"
        style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        Voir le stock →
      </Link>
    </div>
  )
}
