'use client'

import { useState, useMemo, useId, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, Search, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { MovementTypeBadge } from '@/features/stock/components/MovementTypeBadge'
import { useStockMovements } from '@/features/stock/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { StockMovementType } from '@/features/stock/types'

const PAGE_SIZE = 25

const EXIT_TYPES = new Set(['sale', 'adjustment_out', 'write_off', 'return_supplier', 'transfer_out'])

const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: '',                 label: 'Tous les types'    },
  { value: 'purchase_receipt', label: 'Réception achat'   },
  { value: 'sale',             label: 'Vente'             },
  { value: 'adjustment_in',    label: 'Ajust. entrée'     },
  { value: 'adjustment_out',   label: 'Ajust. sortie'     },
  { value: 'initial_stock',    label: 'Stock initial'     },
  { value: 'write_off',        label: 'Mise au rebut'     },
  { value: 'return_customer',  label: 'Retour client'     },
  { value: 'return_supplier',  label: 'Retour fournisseur'},
  { value: 'transfer_in',      label: 'Transfert entrée'  },
  { value: 'transfer_out',     label: 'Transfert sortie'  },
]

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer',
  }
  return (
    <nav aria-label="Pagination des mouvements" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        <span aria-live="polite">Page {page} / {totalPages}</span>
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}

export default function StockMovementsPage() {
  const { can } = usePermission()
  const { format } = useCurrency()
  const [type, setType]       = useState('')
  const [dateFrom, setFrom]   = useState('')
  const [dateTo, setTo]       = useState('')
  const [page, setPage]       = useState(1)

  const typeId   = useId()
  const fromId   = useId()
  const toId     = useId()

  const handleType = useCallback((t: string) => { setType(t); setPage(1) }, [])
  const handleFrom = useCallback((d: string) => { setFrom(d); setPage(1) }, [])
  const handleTo   = useCallback((d: string) => { setTo(d);   setPage(1) }, [])

  const params = useMemo(() => ({
    page, limit: PAGE_SIZE,
    ...(type     && { type: type as StockMovementType }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo   && { dateTo }),
  }), [page, type, dateFrom, dateTo])

  const { data, isLoading } = useStockMovements(params)
  const movements = data?.data ?? []

  if (!can('stock', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de gestion des stocks." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Journal des mouvements"
        description={data ? `${data.total} mouvement${data.total !== 1 ? 's' : ''}` : undefined}
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Filters */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label htmlFor={typeId} className="sr-only">Type de mouvement</label>
            <select
              id={typeId}
              value={type}
              onChange={(e) => handleType(e.target.value)}
              style={{ padding: '0 10px', height: 38, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
            >
              {MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor={fromId} className="sr-only">Date de début</label>
            <input
              id={fromId}
              type="date"
              value={dateFrom}
              onChange={(e) => handleFrom(e.target.value)}
              aria-label="Date de début"
              style={{ padding: '0 10px', height: 38, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
            <label htmlFor={toId} className="sr-only">Date de fin</label>
            <input
              id={toId}
              type="date"
              value={dateTo}
              onChange={(e) => handleTo(e.target.value)}
              aria-label="Date de fin"
              style={{ padding: '0 10px', height: 38, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
            />
          </div>

          {(type || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setType(''); setFrom(''); setTo(''); setPage(1) }}
              style={{ fontSize: 12.5, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              Effacer les filtres
            </button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div aria-hidden>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[140, 120, 80, 80, 100, 80].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : movements.length === 0 ? (
          <RichEmptyState
            icon={ArrowRightLeft}
            title="Aucun mouvement"
            description={type || dateFrom || dateTo ? 'Aucun mouvement ne correspond aux filtres sélectionnés.' : 'Les mouvements de stock apparaîtront ici.'}
            compact
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Journal des mouvements de stock" aria-busy={isLoading}>
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Type</th>
                  <th scope="col">Quantité</th>
                  <th scope="col">Avant / Après</th>
                  <th scope="col">Coût total</th>
                  <th scope="col">Date / Source</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const isExit = EXIT_TYPES.has(m.type)
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link href={`${ROUTES.STOCK_LEVELS}/${m.product.id}/history`} style={{ textDecoration: 'none' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{m.product.name}</p>
                        </Link>
                        {m.product.reference && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.product.reference}</p>}
                      </td>
                      <td><MovementTypeBadge type={m.type as StockMovementType} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isExit
                            ? <ArrowDownRight size={13} style={{ color: '#dc2626' }} aria-hidden />
                            : <ArrowUpRight   size={13} style={{ color: '#16a34a' }} aria-hidden />
                          }
                          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: isExit ? '#dc2626' : '#16a34a' }}>
                            {isExit ? '' : '+'}{Number(m.quantity)}
                            {m.product.stockUnit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 3 }}>{m.product.stockUnit}</span>}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                        {Number(m.quantityBefore)} → {Number(m.quantityAfter)}
                      </td>
                      <td className="amount" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        {m.totalCostHt != null ? format(Number(m.totalCostHt)) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        <p>{formatDate(m.createdAt)}</p>
                        {m.sourceLabel && <p style={{ fontWeight: 500, color: 'var(--text-2)' }}>{m.sourceLabel}</p>}
                        {m.notes && <p style={{ fontSize: 11 }}>{m.notes}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.totalPages > 1 || movements.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {data.totalPages > 1
                ? `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} sur ${data.total}`
                : `${movements.length} mouvement${movements.length !== 1 ? 's' : ''}`}
            </p>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
