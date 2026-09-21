'use client'

import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, AlertTriangle, X, TrendingUp, TrendingDown, LayoutGrid, Table2, FileSpreadsheet, FileText, Upload, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/usePermission'
import { useConfirm } from '@/providers/ConfirmProvider'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { OverlayPortal } from '@/components/ui/OverlayPortal'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useExpenseBudgets, useExpenseCategories, useBudgetSummary,
  useCreateBudget, useDeleteBudget,
} from '@/features/expenses/hooks'
import { expensesApi } from '@/features/expenses/api'
import { useOffices } from '@/features/offices/hooks'
import { AccountPicker } from '@/features/accounting/components/AccountPicker'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { CreateBudgetPayload, ExpenseBudget, BudgetTotals } from '@/features/expenses/types'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }

function periodLabel(b: Pick<ExpenseBudget, 'period' | 'quarter' | 'month' | 'year'>): string {
  if (b.period === 'monthly' && b.month) return `${MONTHS[b.month - 1]} ${b.year}`
  if (b.period === 'quarterly' && b.quarter) return `T${b.quarter} ${b.year}`
  return `Année ${b.year}`
}

// ─── Modale de création ───────────────────────────────────────
function BudgetModal({ year, onClose, isPending, onSave, cats, offices }: {
  year:      number
  onClose:   () => void
  isPending: boolean
  onSave:    (data: CreateBudgetPayload) => void
  cats:      { id: string; name: string }[]
  offices:   { id: string; name: string; code: string }[]
}) {
  const [account,    setAccount]    = useState<{ id: string; name: string } | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [officeId,   setOfficeId]   = useState('')
  const [period,     setPeriod]     = useState<'annual' | 'quarterly' | 'monthly'>('annual')
  const [quarter,    setQuarter]    = useState(1)
  const [month,      setMonth]      = useState(new Date().getMonth() + 1)
  const [amount,     setAmount]     = useState<number>(0)
  const [label,      setLabel]      = useState('')

  const canSubmit = !!account && amount > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSave({
      year, amount, period,
      accountNumber: account!.id,
      categoryId: categoryId || undefined,
      officeId:   officeId || undefined,
      quarter:    period === 'quarterly' ? quarter : undefined,
      month:      period === 'monthly'   ? month   : undefined,
      label:      label.trim() || undefined,
    })
  }

  const PERIODS: { key: typeof period; label: string }[] = [
    { key: 'annual', label: 'Annuel' }, { key: 'quarterly', label: 'Trimestriel' }, { key: 'monthly', label: 'Mensuel' },
  ]

  return (
    <OverlayPortal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
        <div className="card" style={{ padding: '26px 30px', width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Nouveau budget {year}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Compte comptable (charge 6 / produit 7) *</label>
              <AccountPicker value={account?.id ?? null} onChange={(a) => { setAccount(a ? { id: a.id, name: a.name } : null); if (a && !label) setLabel(a.name) }}
                filterClass={[6, 7]} leafOnly placeholder="Rechercher un compte 6… ou 7…" />
            </div>

            <div>
              <label style={lbl}>Libellé</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Services extérieurs 2026" style={inp} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Catégorie (option)</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Toutes —</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Bureau (option)</label>
                <select value={officeId} onChange={e => setOfficeId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Tous —</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={lbl}>Période</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: period === 'annual' ? 0 : 10 }}>
                {PERIODS.map(p => (
                  <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${period === p.key ? 'var(--primary)' : 'var(--border)'}`,
                      background: period === p.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                      color: period === p.key ? 'var(--primary)' : 'var(--text-2)' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'quarterly' && (
                <select value={quarter} onChange={e => setQuarter(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>Trimestre {q}</option>)}
                </select>
              )}
              {period === 'monthly' && (
                <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              )}
            </div>

            <div>
              <label style={lbl}>Montant budgété (XAF) *</label>
              <input type="number" min={1} value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: 'var(--font-mono)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
              <button type="submit" disabled={isPending || !canSubmit}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: isPending || !canSubmit ? 'default' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending || !canSubmit ? 0.6 : 1 }}>
                {isPending && <Loader2 size={13} className="animate-spin" />}
                Créer le budget
              </button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  )
}

// ─── Carte budget ─────────────────────────────────────────────
function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

function BudgetCard({ b, format, canDelete, onDelete }: {
  b: ExpenseBudget; format: (n: number) => string; canDelete: boolean; onDelete: () => void
}) {
  const isRevenue = b.kind === 'revenue'
  const over      = !isRevenue && b.consumed > b.amount
  const warn      = !isRevenue && !over && b.percentUsed >= 80
  const rPct = b.amount > 0 ? Math.min(100, (b.realized / b.amount) * 100) : 0
  const ePct = b.amount > 0 ? Math.min(100 - rPct, (b.engaged / b.amount) * 100) : 0
  const realizedColor = isRevenue ? 'var(--primary)' : over ? '#dc2626' : warn ? '#d97706' : '#16a34a'

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, ...(over ? { borderColor: '#fecaca' } : warn ? { borderColor: '#fde68a' } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {b.accountNumber && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{b.accountNumber}</span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: isRevenue ? 'rgba(45,125,210,0.10)' : 'rgba(217,119,6,0.10)', color: isRevenue ? 'var(--primary)' : '#b45309' }}>
              {isRevenue ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{isRevenue ? 'Produit' : 'Charge'}
            </span>
          </div>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '4px 0 0' }}>{b.label}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>{periodLabel(b)}</span>
            {b.category && <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>{b.category.name}</span>}
            {b.officeName && <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>{b.officeName}</span>}
          </div>
        </div>
        {canDelete && (
          <button onClick={onDelete} title="Supprimer"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Métriques */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric label="Budget"     value={format(b.amount)} />
        <Metric label="Réalisé"    value={format(b.realized)} color={realizedColor} />
        {!isRevenue && <Metric label="Engagé" value={format(b.engaged)} color="#64748b" />}
        <Metric label={isRevenue ? 'Reste à faire' : 'Disponible'} value={format(b.available)} color={b.available < 0 ? '#dc2626' : 'var(--text-1)'} />
      </div>

      {/* Jauge empilée : réalisé + engagé */}
      <div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ height: '100%', width: `${rPct}%`, background: realizedColor, transition: 'width 0.3s' }} />
          {!isRevenue && <div style={{ height: '100%', width: `${ePct}%`, background: 'repeating-linear-gradient(45deg,#94a3b8,#94a3b8 3px,#cbd5e1 3px,#cbd5e1 6px)', transition: 'width 0.3s' }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5 }}>
          <span style={{ color: realizedColor, fontWeight: 600 }}>
            {b.percentUsed}% {isRevenue ? 'atteint' : 'consommé'}{!isRevenue && b.engaged > 0 ? ` (dont engagé)` : ''}
          </span>
          <span style={{ color: over ? '#dc2626' : 'var(--text-3)', fontWeight: 600 }}>
            {over ? `Dépassé de ${format(b.consumed - b.amount)}` : isRevenue ? `Objectif : ${format(b.amount)}` : `Disponible : ${format(b.available)}`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Vue consolidée (Budget vs Réalisé) ──────────────────────
function ConsolidatedView({ year, format }: { year: number; format: (n: number) => string }) {
  const { data, isLoading } = useBudgetSummary(year)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)

  async function doExport(fmt: 'xlsx' | 'pdf') {
    setExporting(fmt)
    try { await expensesApi.exportBudgets(year, fmt) }
    catch { toast.error("L'export a échoué.") }
    finally { setExporting(null) }
  }

  if (isLoading) return <div className="card animate-pulse" style={{ height: 240 }} />
  if (!data || data.lines.length === 0) {
    return <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucun budget pour {year}.</div>
  }

  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '9px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-1)', borderTop: '1px solid var(--border)' }

  const TotalRow = ({ label, t }: { label: string; t: BudgetTotals }) => t.count === 0 ? null : (
    <tr style={{ background: 'var(--surface-2)' }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 700, fontFamily: 'var(--font-display)' }} colSpan={2}>{label}</td>
      <td style={{ ...td, fontWeight: 700 }}>{format(t.budget)}</td>
      <td style={{ ...td, fontWeight: 700, color: '#64748b' }}>{format(t.engaged)}</td>
      <td style={{ ...td, fontWeight: 700 }}>{format(t.realized)}</td>
      <td style={{ ...td, fontWeight: 700, color: t.available < 0 ? '#dc2626' : 'var(--text-1)' }}>{format(t.available)}</td>
      <td style={td} colSpan={2} />
    </tr>
  )

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => doExport('xlsx')} disabled={!!exporting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
        </button>
        <button onClick={() => doExport('pdf')} disabled={!!exporting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Compte / Libellé</th>
              <th style={{ ...th, textAlign: 'left' }}>Type</th>
              <th style={th}>Budget</th>
              <th style={th}>Engagé</th>
              <th style={th}>Réalisé</th>
              <th style={th}>Disponible</th>
              <th style={th}>%</th>
              <th style={th}>Projection</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => {
              const over = l.kind !== 'revenue' && l.consumed > l.amount
              return (
                <tr key={l.id}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-2)', marginRight: 8 }}>{l.accountNumber ?? '—'}</span>
                    {l.label}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: l.kind === 'revenue' ? 'var(--primary)' : '#b45309', fontSize: 12 }}>{l.kind === 'revenue' ? 'Produit' : 'Charge'}</td>
                  <td style={td}>{format(l.amount)}</td>
                  <td style={{ ...td, color: '#64748b' }}>{format(l.engaged)}</td>
                  <td style={td}>{format(l.realized)}</td>
                  <td style={{ ...td, color: l.available < 0 ? '#dc2626' : 'var(--text-1)' }}>{format(l.available)}</td>
                  <td style={{ ...td, fontWeight: 700, color: over ? '#dc2626' : 'var(--text-1)' }}>{l.percentUsed}%</td>
                  <td style={{ ...td, color: 'var(--text-3)' }}>{l.forecast != null ? format(l.forecast) : '—'}</td>
                </tr>
              )
            })}
            <TotalRow label="Total charges" t={data.totals.charge} />
            <TotalRow label="Total produits" t={data.totals.revenue} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ExpenseBudgetsPage() {
  const { can } = usePermission()
  const confirm = useConfirm()
  const { format } = useCurrency()
  const [year,       setYear]       = useState(new Date().getFullYear())
  const [showCreate, setShowCreate] = useState(false)
  const [view, setView] = useState<'cards' | 'table'>('cards')

  const { data: budgets, isLoading } = useExpenseBudgets(year)
  const { data: cats }               = useExpenseCategories()
  const { data: offices }            = useOffices()
  const createMutation               = useCreateBudget(year)
  const deleteMutation               = useDeleteBudget(year)

  const alertBudgets = (budgets ?? []).filter(b => b.kind !== 'revenue' && b.percentUsed >= 80)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const visibleAlerts = alertBudgets.filter(b => !dismissedAlerts.has(b.id))

  const qc      = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'import' | 'carry'>(null)

  function handleCreate(data: CreateBudgetPayload) {
    createMutation.mutate(data, { onSuccess: () => setShowCreate(false) })
  }

  function refreshBudgets() { qc.invalidateQueries({ queryKey: ['expense-budgets'] }) }

  async function handleImport(file: File) {
    setBusy('import')
    try {
      const res = await expensesApi.importBudgets(file)
      refreshBudgets()
      if (res.errors.length === 0) toast.success(`${res.created} budget(s) importé(s).`)
      else toast.warning(`${res.created} importé(s), ${res.errors.length} ligne(s) en erreur (ex. ligne ${res.errors[0].row} : ${res.errors[0].message}).`)
    } catch { toast.error("L'import a échoué. Vérifiez le format du fichier.") }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleCarryOver() {
    const ok = await confirm({
      title: `Préparer le budget ${year + 1} ?`,
      message: `Recopie les budgets ${year} vers ${year + 1} (montants budgétés). Les budgets déjà présents en ${year + 1} sont ignorés.`,
      confirmLabel: `Reporter sur ${year + 1}`,
    })
    if (!ok) return
    setBusy('carry')
    try {
      const res = await expensesApi.carryOverBudgets(year, year + 1, 'budget')
      refreshBudgets()
      toast.success(`${res.created} budget(s) reporté(s) sur ${year + 1}${res.skipped ? ` (${res.skipped} ignoré(s))` : ''}.`)
    } catch { toast.error('Le report a échoué.') }
    finally { setBusy(null) }
  }

  if (!can('expense', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de dépenses." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000, animation: 'page-in 0.2s ease' }}>
      {showCreate && (
        <BudgetModal year={year} isPending={createMutation.isPending} onClose={() => setShowCreate(false)} onSave={handleCreate}
          cats={(cats ?? []).map(c => ({ id: c.id, name: c.name }))}
          offices={(offices ?? []).map(o => ({ id: o.id, name: o.name, code: o.code }))} />
      )}

      <div>
        <Link href={ROUTES.EXPENSES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}>
          <ChevronLeft size={14} /> Notes de frais
        </Link>
        <PageHeader
          title="Budgets"
          description="Enveloppes par compte comptable — suivi engagé, réalisé et disponible"
          actions={can('expense', 'create') ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy === 'import'} title="Importer des budgets depuis un fichier .xlsx (Compte, Année, Période, Mois/Trim, Montant, Libellé)"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importer
              </button>
              <button onClick={handleCarryOver} disabled={busy === 'carry'} title={`Recopier les budgets ${year} vers ${year + 1}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                {busy === 'carry' ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />} Préparer {year + 1}
              </button>
              <button onClick={() => setShowCreate(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px', height: 38, borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
                <Plus size={15} /> Nouveau budget
              </button>
            </div>
          ) : undefined}
        />
      </div>

      {visibleAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleAlerts.map(b => {
            const isOver = b.consumed > b.amount
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: isOver ? '#fef2f2' : '#fffbeb', border: `1.5px solid ${isOver ? '#fecaca' : '#fde68a'}` }}>
                <AlertTriangle size={16} style={{ color: isOver ? '#dc2626' : '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: isOver ? '#991b1b' : '#92400e', fontFamily: 'var(--font-display)', marginBottom: 2 }}>
                    {isOver ? `Budget dépassé — ${b.label}` : `Alerte 80 % — ${b.label}`}
                  </p>
                  <p style={{ fontSize: 12.5, color: isOver ? '#b91c1c' : '#b45309' }}>
                    {b.percentUsed}% consommé (réalisé {format(b.realized)}{b.engaged > 0 ? ` + engagé ${format(b.engaged)}` : ''}) — {isOver ? `dépassement de ${format(b.consumed - b.amount)}` : `disponible ${format(b.available)}`}.
                  </p>
                </div>
                <button onClick={() => setDismissedAlerts(s => new Set([...s, b.id]))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: isOver ? '#b91c1c' : '#b45309', flexShrink: 0, opacity: 0.7 }}>
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Sélecteur d'année */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setYear(y => y - 1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)', minWidth: 60, textAlign: 'center' }}>{year}</span>
        <button onClick={() => setYear(y => y + 1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ChevronRight size={14} />
        </button>

        {/* Bascule vue */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 3, borderRadius: 'var(--radius-md)' }}>
          {([['cards', 'Suivi', LayoutGrid], ['table', 'Budget vs Réalisé', Table2]] as const).map(([key, lab, Icon]) => (
            <button key={key} onClick={() => setView(key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                background: view === key ? 'var(--surface)' : 'transparent', color: view === key ? 'var(--text-1)' : 'var(--text-3)', boxShadow: view === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              <Icon size={14} /> {lab}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <ConsolidatedView year={year} format={format} />
      ) : isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse" style={{ height: 170 }} />)}
        </div>
      ) : (budgets ?? []).length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Aucun budget pour {year}</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crée une enveloppe par compte comptable pour suivre l'engagé, le réalisé et le disponible.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {(budgets ?? []).map(b => (
            <BudgetCard key={b.id} b={b} format={format} canDelete={can('expense', 'delete')}
              onDelete={async () => { if (await confirm({ title: `Supprimer le budget « ${b.label} » ?`, tone: 'danger', confirmLabel: 'Supprimer' })) deleteMutation.mutate(b.id) }} />
          ))}
        </div>
      )}
    </div>
  )
}
