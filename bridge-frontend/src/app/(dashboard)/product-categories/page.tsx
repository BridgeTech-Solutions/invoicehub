'use client'

import { useState, useId, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, Loader2, Tag, X, Check, AlertCircle } from 'lucide-react'
import { useProductCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/features/products/hooks'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { ProductCategory } from '@/features/products/types'

const PRESET_COLORS = [
  { hex: '#2D7DD2', label: 'Bleu' },
  { hex: '#10b981', label: 'Vert' },
  { hex: '#f59e0b', label: 'Jaune' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ef4444', label: 'Rouge' },
  { hex: '#0ea5e9', label: 'Cyan' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#64748b', label: 'Gris' },
]

// ── Confirmation suppression ──────────────────────────────────────────────────
function ConfirmDeleteModal({
  categoryName,
  onConfirm,
  onCancel,
  isPending,
}: {
  categoryName: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
      >
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
          Supprimer la catégorie
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 22px', lineHeight: 1.6 }}>
          Supprimer <strong>«&nbsp;{categoryName}&nbsp;»</strong> ? Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Color swatch group ────────────────────────────────────────────────────────
function ColorPicker({
  value,
  onChange,
  size = 26,
  groupLabel = 'Couleur de la catégorie',
}: {
  value: string
  onChange: (c: string) => void
  size?: number
  groupLabel?: string
}) {
  // Touch target: minimum 44px wrapper, visual dot = size prop
  const hitArea = Math.max(44, size)

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
    >
      {PRESET_COLORS.map(({ hex, label }) => {
        const checked = value === hex
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(hex)}
            style={{
              width: hitArea, height: hitArea,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              borderRadius: 6,
              outline: checked ? `2px solid ${hex}` : '2px solid transparent',
              outlineOffset: 1,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: size, height: size,
                borderRadius: '50%', background: hex,
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                display: 'block',
                transform: checked ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 0.1s',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProductCategoriesPage() {
  const { data: categories = [], isLoading } = useProductCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()
  const isMobile = useIsMobile()

  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]!.hex)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null)

  const newNameId  = useId()
  const editNameId = useId()

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor(PRESET_COLORS[0]!.hex) } },
    )
  }

  const startEdit = (cat: ProductCategory) => {
    setEditId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.color ?? PRESET_COLORS[0]!.hex)
  }

  const saveEdit = (id: string) => {
    if (!editName.trim()) return
    updateMutation.mutate(
      { id, name: editName.trim(), color: editColor },
      { onSuccess: () => setEditId(null) },
    )
  }

  const cancelEdit = () => setEditId(null)

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>
          Catégories de produits
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Organisez vos produits et services par catégorie
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 340px',
        gap: 24,
        alignItems: 'start',
      }}>

        {/* ── Liste ── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <p
              aria-live="polite"
              style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}
            >
              {isLoading ? '…' : `${categories.length} catégorie${categories.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {isLoading ? (
            <div
              aria-busy="true"
              style={{ padding: 40, display: 'flex', justifyContent: 'center' }}
            >
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--primary)' }} aria-hidden="true" />
            </div>
          ) : categories.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Tag size={32} style={{ color: 'var(--border)', marginBottom: 12 }} aria-hidden="true" />
              <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0 }}>Aucune catégorie — créez-en une</p>
            </div>
          ) : (
            <ul role="list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {categories.map((cat, idx) => (
                <li
                  key={cat.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px',
                    borderBottom: idx < categories.length - 1 ? '1px solid var(--border)' : 'none',
                    background: editId === cat.id ? 'rgba(45,125,210,0.03)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Color dot — décoratif */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: editId === cat.id ? editColor : (cat.color ?? '#64748b'),
                      flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  />

                  {editId === cat.id ? (
                    /* ── Edit mode ── */
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label htmlFor={editNameId} className="sr-only">
                        Nom de la catégorie
                      </label>
                      <input
                        id={editNameId}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')  { e.preventDefault(); saveEdit(cat.id) }
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        autoFocus
                        style={{
                          padding: '6px 10px', border: '1.5px solid var(--primary)',
                          borderRadius: 6, fontSize: 13.5, color: 'var(--text-1)',
                          background: 'var(--surface)', outline: 'none', fontFamily: 'var(--font-body)',
                        }}
                      />
                      <ColorPicker
                        value={editColor}
                        onChange={setEditColor}
                        size={18}
                        groupLabel="Couleur de la catégorie en cours de modification"
                      />
                    </div>
                  ) : (
                    /* ── Read mode ── */
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{cat.name}</span>
                      {typeof cat._count?.products === 'number' && (
                        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                          {cat._count.products} produit{cat._count.products !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {editId === cat.id ? (
                      <>
                        <button
                          type="button"
                          aria-label="Enregistrer la catégorie"
                          onClick={() => saveEdit(cat.id)}
                          disabled={updateMutation.isPending || !editName.trim()}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 6,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 12,
                            fontFamily: 'var(--font-display)', fontWeight: 600,
                            minHeight: 44, opacity: updateMutation.isPending ? 0.65 : 1,
                          }}
                        >
                          {updateMutation.isPending
                            ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                            : <Check size={12} aria-hidden="true" />
                          }
                          OK
                        </button>
                        <button
                          type="button"
                          aria-label="Annuler la modification"
                          onClick={cancelEdit}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 6px', color: 'var(--text-3)', display: 'flex', borderRadius: 6, minHeight: 44, alignItems: 'center' }}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Modifier la catégorie ${cat.name}`}
                          onClick={() => startEdit(cat)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-3)', display: 'flex', borderRadius: 6, minHeight: 44, alignItems: 'center' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,125,210,0.08)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                          onFocus={(e)      => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,125,210,0.08)' }}
                          onBlur={(e)       => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Supprimer la catégorie ${cat.name}`}
                          onClick={() => setDeleteTarget(cat)}
                          disabled={deleteMutation.isPending}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-3)', display: 'flex', borderRadius: 6, minHeight: 44, alignItems: 'center' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                          onFocus={(e)      => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)' }}
                          onBlur={(e)       => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Formulaire création ── */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            Nouvelle catégorie
          </h2>

          {createMutation.isError && (
            <div
              role="alert"
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}
            >
              <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span style={{ fontSize: 13, color: '#ef4444' }}>Impossible de créer la catégorie. Réessayez.</span>
            </div>
          )}

          <form onSubmit={handleCreate} noValidate aria-busy={createMutation.isPending} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label
                htmlFor={newNameId}
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'var(--font-display)' }}
              >
                Nom <span style={{ color: '#ef4444' }} aria-hidden="true">*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={newNameId}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex : Logiciels, Infra, Conseil…"
                required
                aria-required="true"
                style={{
                  width: '100%', padding: '9px 12px',
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)',
                  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={(e)  => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div>
              <p
                id="new-color-label"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-display)', margin: '0 0 8px' }}
                aria-hidden="true"
              >
                Couleur
              </p>
              <ColorPicker
                value={newColor}
                onChange={setNewColor}
                size={26}
                groupLabel="Couleur de la nouvelle catégorie"
              />
              {/* Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }} aria-hidden="true">
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: newColor, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', display: 'block' }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{newColor}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '10px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff', border: 'none',
                cursor: !newName.trim() || createMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: !newName.trim() || createMutation.isPending ? 0.65 : 1,
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
                minHeight: 44,
              }}
            >
              {createMutation.isPending
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <Plus size={15} aria-hidden="true" />
              }
              Créer la catégorie
            </button>
          </form>
        </div>
      </div>

      {/* ── Modal suppression ── */}
      {deleteTarget && (
        <ConfirmDeleteModal
          categoryName={deleteTarget.name}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
