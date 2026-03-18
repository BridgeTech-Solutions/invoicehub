'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, Wrench, Package } from 'lucide-react'
import { useDeleteProduct } from '../hooks'
import { usePermission } from '@/hooks/usePermission'
import { formatXAF } from '@/lib/utils'
import type { Product } from '../types'

interface ProductCardProps {
  product:  Product
  onEdit:   (product: Product) => void
}

// Icône par défaut selon le type
const TYPE_ICON = {
  service: Wrench,
  product: Package,
}

export function ProductCard({ product, onEdit }: ProductCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { can } = usePermission()
  const deleteMutation = useDeleteProduct()

  const categoryColor = product.category?.color ?? '#2D7DD2'
  const Icon = TYPE_ICON[product.type] ?? Package

  const handleDelete = () => {
    if (!confirm(`Archiver "${product.name}" ?`)) return
    deleteMutation.mutate(product.id)
  }

  return (
    <div
      className="card card-hover"
      style={{ padding: '18px 18px 16px', position: 'relative', overflow: 'hidden' }}
    >
      {/* Top strip de couleur catégorie */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: categoryColor, opacity: 0.7,
      }} />

      {/* Header : icône + badges + menu */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
        <span
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${categoryColor}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} style={{ color: categoryColor }} strokeWidth={1.8} />
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Status badge */}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '3px 7px',
              borderRadius: 20,
              background: product.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
              color:      product.isActive ? '#16a34a'             : '#64748b',
            }}
          >
            {product.isActive ? 'actif' : 'inactif'}
          </span>

          {/* Menu ⋯ */}
          {(can('product', 'update') || can('product', 'delete')) && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex', borderRadius: 4 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <MoreHorizontal size={16} />
              </button>

              {menuOpen && (
                <>
                  {/* Overlay */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 20,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-md)',
                      minWidth: 160,
                      overflow: 'hidden',
                    }}
                  >
                    {can('product', 'update') && (
                      <button
                        onClick={() => { onEdit(product); setMenuOpen(false) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '9px 14px', background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: 13, color: 'var(--text-1)',
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        <Pencil size={13} /> Modifier
                      </button>
                    )}
                    {can('product', 'delete') && (
                      <button
                        onClick={() => { handleDelete(); setMenuOpen(false) }}
                        disabled={deleteMutation.isPending}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '9px 14px', background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: 13, color: '#ef4444',
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.05)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        <Trash2 size={13} /> Archiver
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nom */}
      <p
        className="font-display"
        style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, lineHeight: 1.3 }}
      >
        {product.name}
      </p>

      {/* Catégorie */}
      {product.category && (
        <p style={{ fontSize: 11.5, color: categoryColor, fontWeight: 600, marginBottom: 12 }}>
          {product.category.name}
        </p>
      )}

      {/* Prix + TVA */}
      <div style={{ marginBottom: 10 }}>
        <p className="amount" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>
          {formatXAF(product.unitPriceHt)}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4, fontFamily: 'var(--font-body)' }}>HT</span>
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
          par {product.unit} · TVA {product.taxRateValue}%
        </p>
      </div>

      {/* Référence (si existante) */}
      {product.reference && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {product.reference}
        </p>
      )}

      {/* Usage count (smart list mode) */}
      {typeof product.usageCount === 'number' && product.usageCount > 0 && (
        <p style={{
          marginTop: 8, fontSize: 11.5, color: 'var(--text-3)',
          borderTop: '1px solid var(--border)', paddingTop: 8,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{product.usageCount}</span> utilisation{product.usageCount > 1 ? 's' : ''} avec ce client
        </p>
      )}
    </div>
  )
}
