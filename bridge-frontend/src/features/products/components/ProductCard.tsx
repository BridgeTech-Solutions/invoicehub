'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { MoreHorizontal, Pencil, Trash2, Wrench, Package, AlertTriangle } from 'lucide-react'
import { useDeleteProduct } from '../hooks'
import { usePermission } from '@/hooks/usePermission'
import { useCurrency } from '@/hooks/useCurrency'
import { StockStatusBadge } from '@/features/stock/components/StockStatusBadge'
import type { Product } from '../types'
import type { StockStatus } from '@/features/stock/types'

function computeStockStatus(p: Product): StockStatus | null {
  if (!p.trackStock) return null
  const qty = Number(p.stockQuantity ?? 0)
  const min = Number(p.stockMinLevel ?? 0)
  const max = Number(p.stockMaxLevel ?? 0)
  if (qty <= 0)              return 'rupture'
  if (min > 0 && qty < min) return 'bas'
  if (max > 0 && qty > max) return 'surstock'
  return 'normal'
}

interface ProductCardProps {
  product:  Product
  onEdit:   (product: Product) => void
}

const TYPE_ICON = {
  service: Wrench,
  product: Package,
}

// ─── Confirm modal ─────────────────────────────────────────────
function ConfirmArchiveModal({
  productName,
  onConfirm,
  onCancel,
  isPending,
}: {
  productName: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 400, padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} aria-hidden style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
              Archiver ce produit ?
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <strong>« {productName} »</strong> sera archivé et ne sera plus proposé dans les nouveaux documents.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            aria-disabled={isPending}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#ef4444', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1, transition: 'opacity 0.15s' }}
          >
            {isPending ? 'Archivage…' : 'Archiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card ──────────────────────────────────────────────────────
export function ProductCard({ product, onEdit }: ProductCardProps) {
  const { format } = useCurrency()
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { can } = usePermission()
  const deleteMutation = useDeleteProduct()

  const menuBtnId  = useId()
  const menuId     = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const categoryColor = product.category?.color ?? '#2D7DD2'
  const Icon = TYPE_ICON[product.type] ?? Package
  const stockStatus = computeStockStatus(product)

  // Close menu on Escape / outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); menuBtnRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  const handleArchiveConfirm = () => {
    deleteMutation.mutate(product.id, { onSuccess: () => setConfirmOpen(false) })
  }

  return (
    <>
      <div
        className="card card-hover"
        style={{ padding: '18px 18px 16px', position: 'relative', overflow: 'hidden' }}
      >
        {/* Top strip de couleur catégorie */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: categoryColor, opacity: 0.7,
        }} />

        {/* Header : icône + badges + menu */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
          <span
            aria-hidden="true"
            style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${categoryColor}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={18} style={{ color: categoryColor }} strokeWidth={1.8} aria-hidden />
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Status badge */}
            <span
              aria-label={product.isActive ? 'Produit actif' : 'Produit inactif'}
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
                  ref={menuBtnRef}
                  id={menuBtnId}
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label={`Actions pour ${product.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuId : undefined}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex', borderRadius: 4, minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' }}
                  onFocus={(e)      => { e.currentTarget.style.background = 'var(--bg)' }}
                  onBlur={(e)       => { e.currentTarget.style.background = 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <MoreHorizontal size={16} aria-hidden />
                </button>

                {menuOpen && (
                  <>
                    {/* Overlay */}
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      id={menuId}
                      role="menu"
                      aria-labelledby={menuBtnId}
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
                          type="button"
                          role="menuitem"
                          onClick={() => { onEdit(product); setMenuOpen(false) }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text-1)',
                            fontFamily: 'var(--font-body)',
                          }}
                          onFocus={(e)      => { e.currentTarget.style.background = 'var(--bg)' }}
                          onBlur={(e)       => { e.currentTarget.style.background = 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                        >
                          <Pencil size={13} aria-hidden /> Modifier
                        </button>
                      )}
                      {can('product', 'delete') && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setMenuOpen(false); setConfirmOpen(true) }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: 13, color: '#ef4444',
                            fontFamily: 'var(--font-body)',
                          }}
                          onFocus={(e)      => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)' }}
                          onBlur={(e)       => { e.currentTarget.style.background = 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                        >
                          <Trash2 size={13} aria-hidden /> Archiver
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
            {format(product.unitPriceHt)}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4, fontFamily: 'var(--font-body)' }}>HT</span>
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
            par {product.unit} · TVA {product.taxRateValue}%
          </p>
        </div>

        {/* Référence */}
        {product.reference && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {product.reference}
          </p>
        )}

        {/* Stock info */}
        {stockStatus && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: stockStatus === 'rupture' ? '#dc2626' : 'var(--text-1)' }}>
                {Number(product.stockQuantity ?? 0)}
              </span>
              {product.stockUnit && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 3 }}>{product.stockUnit}</span>}
            </div>
            <StockStatusBadge status={stockStatus} />
          </div>
        )}

        {/* Usage count */}
        {typeof product.usageCount === 'number' && product.usageCount > 0 && (
          <p style={{
            marginTop: 8, fontSize: 11.5, color: 'var(--text-3)',
            borderTop: '1px solid var(--border)', paddingTop: 8,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{product.usageCount}</span> utilisation{product.usageCount > 1 ? 's' : ''} avec ce client
          </p>
        )}
      </div>

      {/* Confirm archive modal */}
      {confirmOpen && (
        <ConfirmArchiveModal
          productName={product.name}
          onConfirm={handleArchiveConfirm}
          onCancel={() => setConfirmOpen(false)}
          isPending={deleteMutation.isPending}
        />
      )}
    </>
  )
}
