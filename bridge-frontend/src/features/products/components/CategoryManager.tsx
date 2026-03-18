'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, GripVertical, X } from 'lucide-react'
import { useProductCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks'
import type { ProductCategory } from '../types'

const PRESET_COLORS = [
  '#2D7DD2', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#0ea5e9', '#f97316', '#64748b',
]

interface CategoryManagerProps {
  onClose: () => void
}

export function CategoryManager({ onClose }: CategoryManagerProps) {
  const { data: categories = [], isLoading } = useProductCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()

  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editId,   setEditId]   = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor(PRESET_COLORS[0]) } },
    )
  }

  const handleEdit = (cat: ProductCategory) => {
    setEditId(cat.id)
    setEditName(cat.name)
  }

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) return
    updateMutation.mutate(
      { id, name: editName.trim() },
      { onSuccess: () => setEditId(null) },
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Supprimer la catégorie "${name}" ?`)) return
    deleteMutation.mutate(id)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <h2 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            Gérer les catégories
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
          ) : categories.length === 0 ? (
            <p style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
              Aucune catégorie — créez-en une ci-dessous
            </p>
          ) : (
            categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <GripVertical size={14} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }} />

                {/* Color dot */}
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: cat.color ?? 'var(--border)', flexShrink: 0,
                }} />

                {editId === cat.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(cat.id) }}
                    autoFocus
                    style={{
                      flex: 1, padding: '5px 8px',
                      border: '1.5px solid var(--primary)',
                      borderRadius: 6, fontSize: 13, color: 'var(--text-1)',
                      background: 'var(--surface)', outline: 'none',
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>
                    {cat.name}
                    {typeof cat._count?.products === 'number' && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 8 }}>
                        ({cat._count.products} produit{cat._count.products !== 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                )}

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {editId === cat.id ? (
                    <button
                      onClick={() => handleSaveEdit(cat.id)}
                      disabled={updateMutation.isPending}
                      style={{
                        padding: '4px 10px', borderRadius: 5,
                        background: 'var(--primary)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: 12,
                        fontFamily: 'var(--font-display)', fontWeight: 600,
                      }}
                    >
                      OK
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEdit(cat)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(cat.id, cat.name)}
                    disabled={deleteMutation.isPending}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* New category form */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Nouvelle catégorie
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom de la catégorie"
                required
                style={{
                  flex: 1, padding: '8px 12px',
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)',
                  fontFamily: 'var(--font-body)', outline: 'none',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
              <button
                type="submit"
                disabled={createMutation.isPending || !newName.trim()}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  cursor: !newName.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newName.trim() ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
                }}
              >
                {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
                Ajouter
              </button>
            </div>
            {/* Color picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Couleur :</span>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c,
                    border: newColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                    outline: newColor === c ? `3px solid ${c}40` : 'none',
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
