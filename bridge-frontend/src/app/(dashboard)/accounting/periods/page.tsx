'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Lock, Unlock, AlertTriangle, Calendar } from 'lucide-react'
import { useFiscalYears, useClosePeriod, useReopenPeriod } from '@/features/accounting/hooks'
import { PeriodDrawer } from '@/features/accounting/components/PeriodDrawer'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { FiscalYear, FiscalPeriod, PeriodStatus } from '@/features/accounting/types'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const PERIOD_CFG: Record<PeriodStatus, { label: string; color: string; bg: string }> = {
  open:     { label: 'Ouvert',    color: 'var(--s-acc-open)',     bg: 'var(--s-acc-open-bg)' },
  current:  { label: 'En cours', color: 'var(--s-acc-current)',  bg: 'var(--s-acc-current-bg)' },
  closed:   { label: 'Clôturée', color: 'var(--s-acc-closed)',   bg: 'var(--s-acc-closed-bg)' },
  archived: { label: 'Archivée', color: 'var(--s-acc-archived)', bg: 'var(--s-acc-archived-bg)' },
}

function PeriodBadge({ status }: { status: PeriodStatus }) {
  const cfg = PERIOD_CFG[status]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
  )
}

function isCloseToEnd(period: FiscalPeriod): boolean {
  if (period.status !== 'current' && period.status !== 'open') return false
  const end = new Date(period.endDate)
  const now  = new Date()
  const diff = Math.ceil((end.getTime() - now.getTime()) / 86400000)
  return diff >= 0 && diff <= 5
}

function ProgressBar({ periods }: { periods: FiscalPeriod[] }) {
  const closed   = periods.filter(p => p.status === 'closed' || p.status === 'archived').length
  const current  = periods.find(p => p.status === 'current')
  const pct      = Math.round((closed / 12) * 100)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
        <span>{closed} période{closed > 1 ? 's' : ''} clôturée{closed > 1 ? 's' : ''}</span>
        <span>{current ? `Mois en cours : ${MONTHS[current.month - 1]}` : '—'}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #2D7DD2 0%, #16a34a 100%)', width: `${pct}%`, transition: 'width 0.4s var(--ease-smooth)' }} />
      </div>
    </div>
  )
}

function FiscalYearCard({ year, expanded, onToggle }: { year: FiscalYear; expanded: boolean; onToggle: () => void }) {
  const close   = useClosePeriod()
  const reopen  = useReopenPeriod()
  const { can } = usePermission()
  const cfg     = PERIOD_CFG[year.status]

  async function handleClose(period: FiscalPeriod) {
    if (!confirm(`Clôturer ${MONTHS[period.month - 1]} ${period.year} ? Cette action verrouillera toutes les écritures de cette période.`)) return
    try {
      await close.mutateAsync(period.id)
      toast.success(`${MONTHS[period.month - 1]} ${period.year} clôturée`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function handleReopen(period: FiscalPeriod) {
    if (!confirm(`Réouvrir ${MONTHS[period.month - 1]} ${period.year} ? Cette action sera tracée dans l'audit.`)) return
    try {
      await reopen.mutateAsync(period.id)
      toast.success(`${MONTHS[period.month - 1]} ${period.year} rouverte`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Year header */}
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: expanded ? '1px solid var(--border)' : 'none' }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: cfg.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Exercice {year.year}</span>
            <PeriodBadge status={year.status} />
          </div>
          <ProgressBar periods={year.periods ?? []} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
          {new Date(year.startDate).toLocaleDateString('fr-FR')} → {new Date(year.endDate).toLocaleDateString('fr-FR')}
        </span>
        {expanded ? <ChevronDown size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      </button>

      {/* Periods grid */}
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)' }}>
          {(year.periods ?? []).map(period => {
            const pcfg  = PERIOD_CFG[period.status]
            const warn  = isCloseToEnd(period)
            const canClose  = period.status === 'current' || period.status === 'open'
            const canReopen = period.status === 'closed'

            return (
              <div key={period.id} style={{ background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                    {MONTHS[period.month - 1]}
                  </span>
                  <PeriodBadge status={period.status} />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {new Date(period.startDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} → {new Date(period.endDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </div>
                {warn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#92400e', background: 'rgba(217,119,6,0.08)', padding: '4px 8px', borderRadius: 6 }}>
                    <AlertTriangle size={12} />
                    Fin de période imminente
                  </div>
                )}
                {(canClose || canReopen) && can('accounting', 'update') && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {canClose && (
                      <button onClick={() => handleClose(period)} disabled={close.isPending}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, borderRadius: 6, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontWeight: 500, transition: 'all 0.15s' }}>
                        <Lock size={11} /> Clôturer
                      </button>
                    )}
                    {canReopen && (
                      <button onClick={() => handleReopen(period)} disabled={reopen.isPending}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, borderRadius: 6, border: '1.5px solid #d97706', background: 'rgba(217,119,6,0.08)', cursor: 'pointer', fontSize: 12, color: '#92400e', fontWeight: 500, transition: 'all 0.15s' }}>
                        <Unlock size={11} /> Réouvrir
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PeriodsPage() {
  const { can } = usePermission()
  const { data: years = [], isLoading } = useFiscalYears()
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen]       = useState(false)

  function toggleYear(id: string) {
    setExpandedYears(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Périodes fiscales</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>SYSCOHADA — exercices annuels</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <button onClick={() => setDrawerOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', border: 'none', cursor: 'pointer' }}>
            <Plus size={15} /> Nouvel exercice
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 80, animation: 'pulse 1.5s infinite' }} />
          ))
        ) : years.length === 0 ? (
          <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
            <Calendar size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Aucun exercice fiscal</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Créez votre premier exercice pour commencer la comptabilité</p>
            <button onClick={() => setDrawerOpen(true)}
              style={{ height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
              Créer l'exercice {new Date().getFullYear()}
            </button>
          </div>
        ) : (
          years.map(year => (
            <FiscalYearCard key={year.id} year={year}
              expanded={expandedYears.has(year.id)}
              onToggle={() => toggleYear(year.id)}
            />
          ))
        )}
      </div>

      <PeriodDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
