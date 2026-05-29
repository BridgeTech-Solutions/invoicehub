'use client'

import { useState, useMemo } from 'react'
import { FileCheck, Plus, CheckCircle2, AlertCircle, Clock, Send } from 'lucide-react'
import { useTaxDeclarations, useTaxDeclaration, useSubmitTaxDeclaration, useFiscalYears } from '@/features/accounting/hooks'
import { ActionMenu } from '@/components/ui/ActionMenu'
import TaxDeclarationDrawer from '@/features/accounting/components/TaxDeclarationDrawer'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { TaxDeclStatus, TaxDeclaration } from '@/features/accounting/types'

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const MONTHS_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const STATUS_CFG: Record<TaxDeclStatus, { label: string; color: string; bg: string; icon: React.FC<{ size: number; style?: React.CSSProperties }> }> = {
  draft:     { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9',  icon: Clock },
  submitted: { label: 'Déposé',    color: '#2D7DD2', bg: '#eff6ff',  icon: Send },
  validated: { label: 'Validé',    color: '#16a34a', bg: '#f0fdf4',  icon: CheckCircle2 },
  to_pay:    { label: 'À reverser',color: '#d97706', bg: '#fffbeb',  icon: AlertCircle },
}

function StatusBadge({ status }: { status: TaxDeclStatus }) {
  const cfg = STATUS_CFG[status]
  const Icon = cfg.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '3px 9px', borderRadius: 99 }}>
      <Icon size={11} style={{ color: cfg.color }} />
      {cfg.label}
    </span>
  )
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
        {icon}
      </div>
      <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em', margin: '0 0 2px' }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>{sub}</p>}
    </div>
  )
}

function DetailRow({ rate, base, amount }: { rate: number; base: number; amount: number }) {
  const { format } = useCurrency()
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '7px 12px', fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
        {rate === 0 ? '0%' : `${rate}%`}
      </td>
      <td style={{ padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {format(base)}
      </td>
      <td style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {format(amount)}
      </td>
    </tr>
  )
}

export default function TaxDeclarationsPage() {
  const { format } = useCurrency()
  const { can } = usePermission()
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [filterYearId, setFilterYearId] = useState('')
  const [filterMonth, setFilterMonth]   = useState('')

  const { data: declarations = [], isLoading } = useTaxDeclarations()
  const { data: fiscalYears = [] }             = useFiscalYears()
  const submit = useSubmitTaxDeclaration()

  const filtered = useMemo(() => {
    return declarations.filter((d: TaxDeclaration) => {
      if (filterYearId && d.period?.yearId !== filterYearId) return false
      if (filterMonth  && String(d.period?.month) !== filterMonth) return false
      return true
    })
  }, [declarations, filterYearId, filterMonth])

  // Latest declaration for KPIs (most recent)
  const latest = filtered[0] as TaxDeclaration | undefined

  const totalCollected  = filtered.reduce((s: number, d: TaxDeclaration) => s + d.tvaCollected, 0)
  const totalDeductible = filtered.reduce((s: number, d: TaxDeclaration) => s + d.tvaDeductible, 0)
  const totalNet        = filtered.reduce((s: number, d: TaxDeclaration) => s + d.tvaCredit, 0)

  // Real detail breakdown from API (comptes 4455x / 4452x)
  const { data: latestDetail, isLoading: detailLoading } = useTaxDeclaration(latest?.id ?? null)
  const detailCollected  = latestDetail?.detail.collected  ?? []
  const detailDeductible = latestDetail?.detail.deductible ?? []

  async function handleSubmit(id: string, period: string) {
    if (!confirm(`Déposer la déclaration TVA de ${period} ? Cette action est irréversible.`)) return
    try {
      await submit.mutateAsync(id)
      toast.success('Déclaration déposée')
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileCheck size={18} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Déclarations TVA</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>DGI Cameroun · Taux standard 19,25% (19% + 0,25% CAC)</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', border: 'none', cursor: 'pointer' }}>
            <Plus size={15} /> Nouvelle déclaration
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterYearId} onChange={e => { setFilterYearId(e.target.value); setFilterMonth('') }}
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
          <option value="">Tous les exercices</option>
          {fiscalYears.map(y => <option key={y.id} value={y.id}>Exercice {y.year}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
          <option value="">Tous les mois</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i+1} value={String(i+1)}>{MONTHS_FULL[i]}</option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          label="TVA Collectée"
          value={format(totalCollected)}
          sub="Comptes 4455x"
          color="#16a34a"
          icon={<div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={14} style={{ color: '#16a34a' }} /></div>}
        />
        <KpiCard
          label="TVA Déductible"
          value={format(totalDeductible)}
          sub="Comptes 4452x"
          color="#2D7DD2"
          icon={<div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileCheck size={14} style={{ color: '#2D7DD2' }} /></div>}
        />
        <KpiCard
          label="TVA Nette"
          value={format(Math.abs(totalNet))}
          sub={totalNet >= 0 ? 'À reverser à la DGI' : 'Crédit de TVA'}
          color={totalNet >= 0 ? '#d97706' : '#16a34a'}
          icon={<div style={{ width: 28, height: 28, borderRadius: 7, background: totalNet >= 0 ? 'rgba(217,119,6,0.1)' : 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertCircle size={14} style={{ color: totalNet >= 0 ? '#d97706' : '#16a34a' }} /></div>}
        />
        <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${latest ? STATUS_CFG[latest.status].color : '#94a3b8'}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Dernière déclaration</p>
          {latest ? (
            <>
              <StatusBadge status={latest.status} />
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '6px 0 0' }}>
                {MONTHS_FULL[(latest.period?.month ?? 1) - 1]} {latest.period?.year}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Aucune déclaration</p>
          )}
        </div>
      </div>

      {/* Detail panels */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {/* TVA Collectée detail */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Détail TVA Collectée</p>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#16a34a', fontFamily: 'var(--font-mono)' }}>{format(latest.tvaCollected)}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taux</th>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base HT</th>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TVA</th>
                </tr>
              </thead>
              <tbody>
                {detailLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {[60, 90, 90].map((w, j) => (
                        <td key={j} style={{ padding: '9px 12px' }}>
                          <div style={{ height: 12, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: w, marginLeft: j > 0 ? 'auto' : 0 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : detailCollected.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>Aucune écriture TVA collectée</td></tr>
                ) : (
                  detailCollected.map(row => <DetailRow key={row.rate} {...row} />)
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>TOTAL COLLECTÉ</td>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#16a34a', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{format(latest.tvaCollected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* TVA Déductible detail */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2D7DD2' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Détail TVA Déductible</p>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#2D7DD2', fontFamily: 'var(--font-mono)' }}>{format(latest.tvaDeductible)}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taux</th>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base HT</th>
                  <th style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TVA</th>
                </tr>
              </thead>
              <tbody>
                {detailLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {[60, 90, 90].map((w, j) => (
                        <td key={j} style={{ padding: '9px 12px' }}>
                          <div style={{ height: 12, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: w, marginLeft: j > 0 ? 'auto' : 0 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : detailDeductible.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>Aucune écriture TVA déductible</td></tr>
                ) : (
                  detailDeductible.map(row => <DetailRow key={row.rate} {...row} />)
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>TOTAL DÉDUCTIBLE</td>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#2D7DD2', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{format(latest.tvaDeductible)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Historique des déclarations
          </p>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} déclaration{filtered.length > 1 ? 's' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Période', 'TVA Collectée', 'TVA Déductible', 'TVA Nette', 'Statut', 'Déposé le', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 1 && i <= 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: j === 0 ? '60%' : '50%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center' }}>
                    <FileCheck size={32} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 600, margin: '0 0 4px' }}>Aucune déclaration TVA</p>
                    <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                      <button onClick={() => setDrawerOpen(true)} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Créer la première déclaration
                      </button>
                    </p>
                  </td>
                </tr>
              ) : (
                (filtered as TaxDeclaration[]).map((decl, i) => {
                  const period = decl.period
                  const periodLabel = period ? `${MONTHS[period.month - 1]} ${period.year}` : '—'
                  const netColor = decl.tvaCredit > 0 ? '#d97706' : decl.tvaCredit < 0 ? '#16a34a' : 'var(--text-2)'
                  return (
                    <tr key={decl.id}
                      style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(45,125,210,0.04)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'var(--surface-2)' : 'transparent'}>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-1)', fontWeight: 600, whiteSpace: 'nowrap' }}>{periodLabel}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        {format(decl.tvaCollected)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: '#2D7DD2', whiteSpace: 'nowrap' }}>
                        {format(decl.tvaDeductible)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: netColor, whiteSpace: 'nowrap' }}>
                        {decl.tvaCredit > 0 ? '+' : ''}{format(decl.tvaCredit)}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <StatusBadge status={decl.status} />
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {decl.submittedAt ? formatDate(decl.submittedAt) : '—'}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                        <ActionMenu items={[
                          ...(decl.status === 'draft' && can('accounting', 'update') ? [{
                            label: 'Déposer à la DGI',
                            icon: Send,
                            onClick: () => handleSubmit(decl.id, periodLabel),
                          }] : []),
                        ]} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Net summary bar */}
        {filtered.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 24, background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totaux période sélectionnée</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#16a34a' }}>Collectée : {format(totalCollected)}</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2D7DD2' }}>Déductible : {format(totalDeductible)}</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: totalNet >= 0 ? '#d97706' : '#16a34a' }}>
              Net : {totalNet > 0 ? '+' : ''}{format(totalNet)}
            </span>
          </div>
        )}
      </div>

      <TaxDeclarationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
