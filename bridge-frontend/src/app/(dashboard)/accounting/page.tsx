'use client'

import Link from 'next/link'
import {
  TrendingUp, TrendingDown, BarChart3, Receipt,
  PenLine, Calendar, BookOpen, ArrowRight, BookCheck,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAccountingStats, useFiscalYears, useEntries } from '@/features/accounting/hooks'
import { ROUTES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import type { PeriodStatus } from '@/features/accounting/types'

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="card" style={{ padding: '18px 20px', borderLeft: `3px solid ${color}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em', margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: 12, color: trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : 'var(--text-3)', margin: '2px 0 0', fontWeight: 500 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Period status badge ──────────────────────────────────────
const PERIOD_CFG: Record<PeriodStatus, { label: string; color: string; bg: string }> = {
  open:   { label: 'Ouvert',      color: 'var(--s-acc-open)',   bg: 'var(--s-acc-open-bg)' },
  closed: { label: 'Clôturée',    color: 'var(--s-acc-closed)', bg: 'var(--s-acc-closed-bg)' },
  locked: { label: 'Verrouillée', color: '#64748b',             bg: '#f1f5f9' },
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

const ENTRY_SOURCE_LABEL: Record<string, string> = {
  manual: 'Manuel', invoice: 'Facture', payment: 'Paiement',
  expense: 'Dépense', purchase_order: 'BC',
}

// ─── Custom tooltip ───────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12.5 }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{format(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
}

export default function AccountingDashboard() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const { data: stats, isLoading: statsLoading } = useAccountingStats()
  const { data: fiscalYears = [], isLoading: yearsLoading } = useFiscalYears()
  const { data: entriesData, isLoading: entriesLoading } = useEntries({ limit: 5, page: 1 })

  const recentEntries = entriesData?.data ?? []
  const currentYear = fiscalYears.find(y => y.status === 'open') ?? fiscalYears[0]

  const chartData = (stats?.trend ?? []).map(t => ({
    name: MONTHS[new Date(t.month).getMonth()] ?? t.month,
    CA:       t.revenue,
    Charges:  t.expenses,
  }))

  const netResult = (stats?.netResult ?? 0)
  const netPositive = netResult >= 0

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(45,125,210,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookCheck size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Comptabilité</h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Vue d'ensemble financière — SYSCOHADA</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <Link href={ROUTES.ACCOUNTING_ENTRIES + '/new'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', textDecoration: 'none', transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            <PenLine size={15} />
            Nouvelle écriture
          </Link>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: '18px 20px', borderLeft: '3px solid var(--border)' }}>
              <Skeleton w={80} h={12} />
              <div style={{ marginTop: 10 }}><Skeleton w={120} h={22} /></div>
            </div>
          ))
        ) : (
          <>
            <KpiCard label="CA du mois" value={format(stats?.revenueMonth ?? 0)} icon={TrendingUp} color="#16a34a" trend="up" sub="Chiffre d'affaires" />
            <KpiCard label="Charges du mois" value={format(stats?.expensesMonth ?? 0)} icon={TrendingDown} color="#dc2626" trend="down" sub="Dépenses & achats" />
            <KpiCard
              label="Résultat net" value={format(Math.abs(netResult))} icon={BarChart3}
              color={netPositive ? '#16a34a' : '#dc2626'}
              trend={netPositive ? 'up' : 'down'}
              sub={netPositive ? 'Bénéfice ce mois' : 'Déficit ce mois'}
            />
            <KpiCard label="TVA à reverser" value={format(stats?.vatDue ?? 0)} icon={Receipt} color="#d97706" sub="Période en cours" />
          </>
        )}
      </div>

      {/* Chart + periods */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>
        {/* Bar chart */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Évolution CA vs Charges</h2>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>6 derniers mois</span>
          </div>
          {statsLoading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton w="100%" h={160} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={18} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: 'var(--text-3)', fontFamily: 'var(--font-display)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={45} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(45,125,210,0.05)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-display)', paddingTop: 8 }} />
                <Bar dataKey="CA" name="CA" fill="#2D7DD2" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Charges" name="Charges" fill="#dc2626" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Fiscal periods */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Périodes fiscales</h2>
            <Link href={ROUTES.ACCOUNTING_PERIODS} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Voir tout</Link>
          </div>
          {yearsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={32} />)}
            </div>
          ) : !currentYear ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Aucun exercice fiscal<br />en cours</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Exercice {currentYear.year}</span>
                {(() => { const cfg = PERIOD_CFG[currentYear.status]; return (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                ) })()}
              </div>
              {(currentYear.periods ?? []).slice(0, 6).map(p => {
                const cfg = PERIOD_CFG[p.status]
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{MONTHS[p.month - 1]} {p.year}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                )
              })}
              {(currentYear.periods?.length ?? 0) > 6 && (
                <Link href={ROUTES.ACCOUNTING_PERIODS} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', textAlign: 'center', padding: '4px 0' }}>
                  +{(currentYear.periods?.length ?? 0) - 6} autres périodes
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent entries */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Dernières écritures</h2>
          <Link href={ROUTES.ACCOUNTING_ENTRIES} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            Voir toutes <ArrowRight size={13} />
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'N° pièce', 'Journal', 'Libellé', 'Source', 'Débit', 'Crédit'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Débit' || h === 'Crédit' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entriesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} style={{ padding: '10px' }}><Skeleton h={20} /></td></tr>
                ))
              ) : recentEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                    Aucune écriture. <Link href={ROUTES.ACCOUNTING_ENTRIES + '/new'} style={{ color: 'var(--primary)', textDecoration: 'none' }}>Créer la première</Link>
                  </td>
                </tr>
              ) : (
                recentEntries.map((entry, i) => (
                  <tr key={entry.id} style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(entry.date)}</td>
                    <td style={{ padding: '9px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{entry.number}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)' }}>{entry.journal.code}</span>
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 13, color: 'var(--text-1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{ENTRY_SOURCE_LABEL[entry.source ?? ''] ?? entry.source}</span>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: entry.totalDebit > 0 ? 'var(--acc-debit)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {entry.totalDebit > 0 ? format(entry.totalDebit) : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: entry.totalCredit > 0 ? 'var(--acc-credit)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {entry.totalCredit > 0 ? format(entry.totalCredit) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20 }}>
        {[
          { label: 'Plan comptable',     href: ROUTES.ACCOUNTING_CHART,   icon: BookOpen,   color: '#2D7DD2' },
          { label: 'Journaux',           href: ROUTES.ACCOUNTING_JOURNALS, icon: BookCheck,  color: '#7c3aed' },
          { label: 'Périodes fiscales',  href: ROUTES.ACCOUNTING_PERIODS,  icon: Calendar,   color: '#16a34a' },
          { label: 'Déclarations TVA',   href: ROUTES.ACCOUNTING_TAX,      icon: Receipt,    color: '#d97706' },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1.5px solid var(--border)', textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.background = `${color}08` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} style={{ color }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
