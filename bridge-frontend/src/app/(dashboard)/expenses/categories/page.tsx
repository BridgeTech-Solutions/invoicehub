'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useExpenseCategories, useCreateExpenseCategory,
  useUpdateExpenseCategory, useDeleteExpenseCategory,
} from '@/features/expenses/hooks'
import { ROUTES } from '@/lib/constants'
import type { ExpenseCategory } from '@/features/expenses/types'

const PRESET_COLORS = ['#2D7DD2', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b', '#f59e0b', '#10b981', '#ef4444']

interface CategoryFormData {
  name:              string
  description:       string
  color:             string
  icon:              string
  accountingAccount: string
}

function CategoryModal({
  initial, onSave, onClose, isPending,
}: {
  initial?: CategoryFormData
  onSave:    (data: CategoryFormData) => void
  onClose:   () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<CategoryFormData>(initial ?? { name: '', description: '', color: PRESET_COLORS[0], icon: '', accountingAccount: '' })
  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          {initial ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Nom *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex : Transport, Repas, Fournitures…" style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Décrivez les types de dépenses dans cette catégorie…"
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Couleur</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? `3px solid var(--text-1)` : '3px solid transparent', cursor: 'pointer', outline: 'none', padding: 0 }} />
              ))}
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: 'none' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>Compte SYSCOHADA</label>
            <input value={form.accountingAccount} onChange={e => setForm(f => ({ ...f, accountingAccount: e.target.value }))} placeholder="624000" style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={isPending || !form.name.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: !form.name.trim() ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: !form.name.trim() || isPending ? 0.7 : 1 }}>
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ExpenseCategoriesPage() {
  const { data: categories, isLoading } = useExpenseCategories()
  const createMutation = useCreateExpenseCategory()
  const updateMutation = useUpdateExpenseCategory()
  const deleteMutation = useDeleteExpenseCategory()

  const [showCreate, setShowCreate]   = useState(false)
  const [editing,    setEditing]      = useState<ExpenseCategory | null>(null)

  function handleCreate(data: CategoryFormData) {
    createMutation.mutate({
      name:              data.name,
      description:       data.description || undefined,
      color:             data.color || undefined,
      accountingAccount: data.accountingAccount || undefined,
    }, { onSuccess: () => setShowCreate(false) })
  }

  function handleUpdate(data: CategoryFormData) {
    if (!editing) return
    updateMutation.mutate({
      id: editing.id,
      data: {
        name:              data.name,
        description:       data.description || undefined,
        color:             data.color || undefined,
        accountingAccount: data.accountingAccount || undefined,
      },
    }, { onSuccess: () => setEditing(null) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800, animation: 'page-in 0.2s ease' }}>
      {showCreate && (
        <CategoryModal isPending={createMutation.isPending} onClose={() => setShowCreate(false)} onSave={handleCreate} />
      )}
      {editing && (
        <CategoryModal
          initial={{ name: editing.name, description: editing.description ?? '', color: editing.color ?? PRESET_COLORS[0], icon: editing.icon ?? '', accountingAccount: editing.accountingAccount ?? '' }}
          isPending={updateMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={handleUpdate}
        />
      )}

      <div>
        <Link href={ROUTES.EXPENSES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Notes de frais
        </Link>
        <PageHeader
          title="Catégories de dépenses"
          description="Organisez vos dépenses par catégorie"
          actions={
            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              <Plus size={15} /> Nouvelle catégorie
            </button>
          }
        />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Catégorie', 'Compte SYSCOHADA', 'Dépenses', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {[200, 120, 60, 80].map((w, j) => (
                    <td key={j} style={{ padding: '12px 14px' }}>
                      <div style={{ height: 14, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
              : (categories ?? []).length === 0
                ? (
                  <tr><td colSpan={4} style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                    Aucune catégorie — cliquez sur &ldquo;Nouvelle catégorie&rdquo; pour commencer
                  </td></tr>
                )
                : (categories ?? []).map((cat, i) => (
                  <tr key={cat.id} style={{ borderBottom: i < (categories?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: cat.color ?? '#94a3b8', flexShrink: 0 }} />
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-1)', display: 'block' }}>{cat.name}</span>
                          {cat.description && (
                            <span style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1, display: 'block' }}>{cat.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)', fontSize: 12.5 }}>
                      {cat.accountingAccount ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>
                      {cat._count?.expenses ?? 0} dépense{(cat._count?.expenses ?? 0) !== 1 ? 's' : ''}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditing(cat)}
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm(`Supprimer la catégorie "${cat.name}" ?`)) deleteMutation.mutate(cat.id) }}
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
