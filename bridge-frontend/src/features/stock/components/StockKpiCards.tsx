'use client'

import { useState, useEffect } from 'react'
import { Package, AlertTriangle, TrendingDown, BarChart3 } from 'lucide-react'
import { useStockSummary } from '../hooks'
import { formatXAF } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import Link from 'next/link'

function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target); return
    }
    if (target === 0) { setValue(0); return }
    const start = performance.now()
    let rafId: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration])
  return value
}

function KpiSkeleton() {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)' }} className="animate-pulse" />
      </div>
      <div style={{ height: 26, width: 160, background: 'var(--border)', borderRadius: 4, marginBottom: 10 }} className="animate-pulse" />
      <div style={{ height: 11, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

interface KpiCardProps {
  label:        string
  numericValue: number
  formatter?:   (n: number) => string
  sub:          string
  icon:         React.ElementType
  color:        string
  bg:           string
  href?:        string
  alert?:       boolean
}

function KpiCard({ label, numericValue, formatter, sub, icon: Icon, color, bg, href, alert }: KpiCardProps) {
  const animated     = useCountUp(numericValue)
  const displayValue = formatter ? formatter(animated) : animated.toString()

  return (
    <div
      className="card card-hover"
      style={{ padding: '20px 24px', borderLeft: `3px solid ${alert && numericValue > 0 ? color : 'var(--border)'}` }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{
          fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
        }}>
          {label}
        </p>
        <span
          aria-hidden="true"
          className="flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, background: bg, flexShrink: 0 }}
        >
          <Icon size={17} style={{ color }} strokeWidth={2} />
        </span>
      </div>

      <p className="amount" style={{ fontSize: 24, fontWeight: 600, color: alert && numericValue > 0 ? color : 'var(--text-1)', lineHeight: 1.2, marginBottom: 8 }}>
        {displayValue}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{sub}</span>
        {href && (
          <Link href={href} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            Voir →
          </Link>
        )}
      </div>
    </div>
  )
}

export function StockKpiCards() {
  const { data, isLoading } = useStockSummary()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    )
  }

  if (!data) return null

  const cards: KpiCardProps[] = [
    {
      label:        'Valeur totale stock',
      numericValue: data.totalStockValue,
      formatter:    formatXAF,
      sub:          `${data.totalTrackedProducts} produit${data.totalTrackedProducts !== 1 ? 's' : ''} suivi${data.totalTrackedProducts !== 1 ? 's' : ''}`,
      icon:         BarChart3,
      color:        '#2D7DD2',
      bg:           'rgba(45,125,210,0.08)',
    },
    {
      label:        'Produits suivis',
      numericValue: data.totalTrackedProducts,
      sub:          'avec gestion de stock',
      icon:         Package,
      color:        '#10b981',
      bg:           'rgba(16,185,129,0.08)',
      href:         ROUTES.STOCK_LEVELS,
    },
    {
      label:        'Ruptures de stock',
      numericValue: data.rupture,
      sub:          'produits à 0',
      icon:         TrendingDown,
      color:        '#dc2626',
      bg:           'rgba(239,68,68,0.08)',
      href:         ROUTES.STOCK_ALERTS,
      alert:        true,
    },
    {
      label:        'Stock bas',
      numericValue: data.lowStock,
      sub:          'sous le seuil minimum',
      icon:         AlertTriangle,
      color:        '#d97706',
      bg:           'rgba(217,119,6,0.08)',
      href:         ROUTES.STOCK_ALERTS,
      alert:        true,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => <KpiCard key={card.label} {...card} />)}
    </div>
  )
}
