'use client'

import { useState, useEffect } from 'react'
import { Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useDashboardKpis } from '../hooks'
import { useCurrency } from '@/hooks/useCurrency'

// ─── Count-up hook (respecte prefers-reduced-motion) ──────────
// Identique au pattern de KpiCards : ease-out cubic, désactivé si reduce.
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
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

// ─── Skeleton ─────────────────────────────────────────────────
function HeroSkeleton() {
  return (
    <div className="card" style={{ padding: '22px 26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ height: 11, width: 130, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} className="animate-pulse" />
      </div>
      <div style={{ height: 30, width: 170, background: 'var(--border)', borderRadius: 4, marginBottom: 12 }} className="animate-pulse" />
      <div style={{ height: 11, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Single hero card ──────────────────────────────────────────
interface HeroCardProps {
  label:        string
  numericValue: number
  formatter:    (n: number) => string
  sign?:        '+' | '−' | ''   // préfixe affiché devant le montant (résultat)
  sub:          string
  icon:         React.ElementType
  color:        string
  bg:           string
}

function HeroCard({ label, numericValue, formatter, sign = '', sub, icon: Icon, color, bg }: HeroCardProps) {
  // On anime sur la valeur absolue : le signe est géré séparément (résultat -).
  const animated = useCountUp(Math.abs(numericValue))
  const display  = `${sign}${formatter(animated)}`

  return (
    <div
      className="card"
      style={{
        padding: '22px 26px',
        borderLeft: `3px solid ${color}`,
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{
          fontSize: 11,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-3)',
        }}>
          {label}
        </p>
        <span
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg, flexShrink: 0 }}
          aria-hidden="true"
        >
          <Icon size={19} style={{ color }} strokeWidth={2} />
        </span>
      </div>

      <p
        className="amount"
        style={{ fontSize: 27, fontWeight: 700, color, lineHeight: 1.15, marginBottom: 8, letterSpacing: '-0.01em' }}
        aria-label={`${label} : ${display}`}
      >
        {display}
      </p>

      <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
        {sub}
      </p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * FinancialHeroBand — bandeau héros PERMANENT (au-dessus des onglets).
 * 4 indicateurs directeurs : Trésorerie, Résultat du mois, À recevoir, À payer.
 * Toujours visible quel que soit l'onglet actif.
 */
export function FinancialHeroBand() {
  const { format } = useCurrency()
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <HeroSkeleton key={i} />)}
      </div>
    )
  }

  if (!data) return null

  // Résultat du mois = Marge brute (Ventes − Achats) − Dépenses
  const result      = data.grossMarginMonth - data.expenses.thisMonthAmount
  const resultColor = result >= 0 ? '#16a34a' : 'var(--s-overdue)'
  const resultBg    = result >= 0 ? 'rgba(22,163,74,0.08)' : 'var(--s-overdue-bg)'
  const resultSign: '+' | '−' = result >= 0 ? '+' : '−'

  // « À recevoir » : sous-texte enrichi du nombre de factures en retard si dispo.
  const overduePart = data.overdue.count > 0
    ? ` · dont ${data.overdue.count} en retard`
    : ''

  const cards: HeroCardProps[] = [
    {
      label:        'Trésorerie disponible',
      numericValue: data.cashPosition.total,
      formatter:    format,
      sub:          `${data.cashPosition.accountCount} compte${data.cashPosition.accountCount !== 1 ? 's' : ''}`,
      icon:         Wallet,
      color:        'var(--j-bank)',
      bg:           'var(--j-bank-bg)',
    },
    {
      label:        'Résultat du mois',
      numericValue: result,
      formatter:    format,
      sign:         resultSign,
      sub:          'Ventes − Achats − Dépenses',
      icon:         TrendingUp,
      color:        resultColor,
      bg:           resultBg,
    },
    {
      label:        'À recevoir',
      numericValue: data.pending.amount,
      formatter:    format,
      sub:          `${data.pending.count} facture${data.pending.count !== 1 ? 's' : ''}${overduePart}`,
      icon:         ArrowDownLeft,
      color:        'var(--primary)',
      bg:           'rgba(45,125,210,0.08)',
    },
    {
      label:        'À payer',
      numericValue: data.payables.outstandingAmount,
      formatter:    format,
      sub:          `${data.payables.count} facture${data.payables.count !== 1 ? 's' : ''} fournisseur`,
      icon:         ArrowUpRight,
      color:        'var(--j-purchase)',
      bg:           'var(--j-purchase-bg)',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => <HeroCard key={card.label} {...card} />)}
    </div>
  )
}
