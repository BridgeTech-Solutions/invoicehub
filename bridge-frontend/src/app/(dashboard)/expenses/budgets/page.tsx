'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useExpenseBudgets, useExpenseCategories,
  useCreateBudget, useDeleteBudget,
} from '@/features/expenses/hooks'
import { formatXAF } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { CreateBudgetPayload } from '@/features/expenses/types'

function BudgetModal({ year, onClose, isPending, onSave, cats }: {
  year:      number
  onClose:   () => void
  isPending: boolean
  onSave:    (data: CreateBudgetPayload) => void
  cats:      { id: string; name: string }[]
}) {
  const [label,      setLabel]      = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount,     setAmount]     = useState<number>(0)
  const [period,     setPeriod]     = useState<'annual' | 'monthly'>('annual')
  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim() || amount <= 0) return
    onSave({ year, label, categoryId: categoryId || undefined, amount, period })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Nouveau budget {year}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Libellé *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Budget marketing 2026" style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Catégorie (facultatif)</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
              <option value="">— Toutes catégories —</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Montant (XAF) *</label>
              <input type="number" min={1} value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ ...inp, fontFamily: 'var(--font-mono)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Période</label>
              <select value={period} onChange={e => setPeriod(e.target.value as 'annual' | 'monthly')} style={{ ...inp, cursor: 'pointer' }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="annual">Annuel</option>
                <option value="monthly">Mensuel</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={isPending || !label.trim() || amount <= 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending || !label.trim() || amount <= 0 ? 0.7 : 1 }}>
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Créer le budget
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ExpenseBudgetsPage() {
  const [year,       setYear]       = useState(new Date().getFullYear())
  const [showCreate, setShowCreate] = useState(false)

  const { data: budgets, isLoading } = useExpenseBudgets(year)
  const { data: cats }               = useExpenseCategories()
  const createMutation               = useCreateBudget(year)
  const deleteMutation               = useDeleteBudget(year)

  function handleCreate(data: CreateBudgetPayload) {
    createMutation.mutate(data, { onSuccess: () => setShowCreate(false) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900, animation: 'page-in 0.2s ease' }}>
      {showCreate && cats && (
        <BudgetModal year={year} isPending={createMutation.isPending} onClose={() => setShowCreate(false)} onSave={handleCreate} cats={cats.map(c => ({ id: c.id, name: c.name }))} />
      )}

      <div>
        <Link href={ROUTES.EXPENSES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Notes de frais
        </Link>
        <PageHeader
          title="Budgets de dépenses"
          description="Définissez et suivez vos enveloppes budgétaires"
          actions={
            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              <Plus size={15} /> Nouveau budget
            </button>
          }
        />
      </div>

      {/* Year selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setYear(y => y - 1)}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)', minWidth: 60, textAlign: 'center' }}>{year}</span>
        <button onClick={() => setYear(y => y + 1)}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-2)' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Budgets grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse" style={{ height: 120 }} />)}
        </div>
      ) : (budgets ?? []).length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          Aucun budget pour {year}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {(budgets ?? []).map(b => {
            const pct  = Math.min(100, Math.round(b.percentUsed))
            const over = b.percentUsed > 100
            const barColor = over ? '#dc2626' : pct > 80 ? '#d97706' : '#16a34a'
            return (
              <div key={b.id} className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{b.label}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {b.category && (
                        <span style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>{b.category.name}</span>
                      )}
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>
                        {b.period === 'monthly' ? 'Mensuel' : 'Annuel'}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm(`Supprimer le budget "${b.label}" ?`)) deleteMutation.mutate(b.id) }}
                    style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-3)' }}>Dépensé : <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: barColor }}>{formatXAF(b.spent)}</span></span>
                    <span style={{ color: 'var(--text-3)' }}>Budget : <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{formatXAF(b.amount)}</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5 }}>
                    <span style={{ color: barColor, fontWeight: 600 }}>{pct}% utilisé</span>
                    <span style={{ color: over ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {over ? `Dépassé de ${formatXAF(b.spent - b.amount)}` : `Restant : ${formatXAF(b.remaining)}`}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
