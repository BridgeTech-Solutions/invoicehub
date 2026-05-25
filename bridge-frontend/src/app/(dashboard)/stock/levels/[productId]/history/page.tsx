'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MovementTypeBadge } from '@/features/stock/components/MovementTypeBadge'
import { AdjustStockDrawer } from '@/features/stock/components/AdjustStockDrawer'
import { useProductStockHistory } from '@/features/stock/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { StockMovementType } from '@/features/stock/types'

const EXIT_TYPES = new Set(['sale', 'adjustment_out', 'write_off', 'return_supplier', 'transfer_out'])

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer',
  }
  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        Page {page} / {totalPages}
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}

export default function ProductStockHistoryPage() {
  const { format } = useCurrency()
  const { productId } = useParams<{ productId: string }>()
  const [page, setPage]       = useState(1)
  const [drawerOpen, setDrawer] = useState(false)

  const { data, isLoading } = useProductStockHistory(productId, page, 20)

  const product   = data?.product
  const movements = data?.movements ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={product ? `Historique — ${product.name}` : 'Historique de stock'}
        description={product?.reference ?? undefined}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={ROUTES.STOCK_LEVELS}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, textDecoration: 'none',
                fontFamily: 'var(--font-display)', fontWeight: 500,
              }}
            >
              <ArrowLeft size={14} aria-hidden /> Retour
            </Link>
            {product && (
              <button
                type="button"
                onClick={() => setDrawer(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  fontSize: 13.5, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
                }}
              >
                <Plus size={14} aria-hidden /> Ajuster
              </button>
            )}
          </div>
        }
      />

      {/* Product info card */}
      {product && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Stock actuel',    value: `${Number(product.stockQuantity)} ${product.stockUnit ?? 'unités'}`, color: 'var(--text-1)' },
            { label: 'CMUP',            value: product.costPriceHt != null ? format(Number(product.costPriceHt)) : '—', color: 'var(--text-1)' },
            { label: 'Valeur stock',    value: format(Number(product.stockValue)), color: '#2D7DD2' },
            { label: 'Seuil min / max', value: `${product.stockMinLevel ?? '—'} / ${product.stockMaxLevel ?? '—'}`, color: 'var(--text-2)' },
          ].map((item) => (
            <div key={item.label} className="card" style={{ padding: '14px 18px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: 'var(--font-display)' }}>{item.label}</p>
              <p className="amount" style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Movements table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Mouvements
            {data && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>({data.total})</span>}
          </h2>
        </div>

        {isLoading ? (
          <div aria-hidden>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[100, 120, 80, 80, 100, 80].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : movements.length === 0 ? (
          <p style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
            Aucun mouvement enregistré pour ce produit.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Historique de stock">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Quantité</th>
                  <th scope="col">Avant / Après</th>
                  <th scope="col">Coût unitaire</th>
                  <th scope="col">Note / Source</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const isExit = EXIT_TYPES.has(m.type)
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDate(m.createdAt)}</td>
                      <td><MovementTypeBadge type={m.type as StockMovementType} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isExit
                            ? <ArrowDownRight size={13} style={{ color: '#dc2626' }} aria-hidden />
                            : <ArrowUpRight   size={13} style={{ color: '#16a34a' }} aria-hidden />
                          }
                          <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-display)', color: isExit ? '#dc2626' : '#16a34a' }}>
                            {isExit ? '' : '+'}{Number(m.quantity)}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                        {Number(m.quantityBefore)} → {Number(m.quantityAfter)}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-2)' }} className="amount">
                        {m.unitCostHt != null ? format(Number(m.unitCostHt)) : '—'}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 220 }}>
                        {m.sourceLabel && <span style={{ display: 'block', fontWeight: 500, color: 'var(--text-2)' }}>{m.sourceLabel}</span>}
                        {m.notes && <span style={{ display: 'block' }}>{m.notes}</span>}
                        {m.createdBy && (
                          <span style={{ display: 'block', fontSize: 11 }}>
                            par {m.createdBy.firstName} {m.createdBy.lastName}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {product && drawerOpen && (
        <AdjustStockDrawer
          productId={productId}
          productName={product.name}
          currentQty={Number(product.stockQuantity)}
          stockUnit={product.stockUnit}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  )
}
