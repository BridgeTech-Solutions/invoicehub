'use client'

import { useState, useMemo, useId, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Layers, Plus, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { StockStatusBadge } from '@/features/stock/components/StockStatusBadge'
import { AdjustStockDrawer } from '@/features/stock/components/AdjustStockDrawer'
import { useStockLevels } from '@/features/stock/hooks'
import { useProductCategories } from '@/features/products/hooks'
import { formatXAF } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { StockLevel } from '@/features/stock/types'

const PAGE_SIZE = 20

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer',
  }
  return (
    <nav aria-label="Pagination des niveaux de stock" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente" style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        <span aria-live="polite">Page {page} / {totalPages}</span>
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Page suivante" style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

function RowActions({ product, onAdjust }: { product: StockLevel; onAdjust: (p: StockLevel) => void }) {
  const router = useRouter()
  const items = [
    { label: 'Historique', icon: History, onClick: () => router.push(`${ROUTES.STOCK_LEVELS}/${product.id}/history`) },
    { label: 'Ajuster le stock', icon: Plus, onClick: () => onAdjust(product) },
  ]
  return <ActionMenu items={items} />
}

export default function StockLevelsPage() {
  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState('')
  const [filter, setFilter]   = useState<'all' | 'lowStock' | 'rupture'>('all')
  const [page, setPage]       = useState(1)
  const [drawer, setDrawer]   = useState<StockLevel | null>(null)

  const searchId   = useId()
  const categoryId = useId()

  const handleSearch   = useCallback((s: string)    => { setSearch(s);   setPage(1) }, [])
  const handleCategory = useCallback((c: string)    => { setCategory(c); setPage(1) }, [])
  const handleFilter   = useCallback((f: typeof filter) => { setFilter(f); setPage(1) }, [])

  const params = useMemo(() => ({
    page, limit: PAGE_SIZE,
    ...(search   && { search }),
    ...(category && { categoryId: category }),
    ...(filter === 'lowStock' && { lowStock: true }),
    ...(filter === 'rupture'  && { rupture:  true }),
  }), [page, search, category, filter])

  const { data, isLoading } = useStockLevels(params)
  const { data: categories } = useProductCategories()
  const products = data?.data ?? []

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'all',      label: 'Tous' },
    { key: 'lowStock', label: 'Stock bas' },
    { key: 'rupture',  label: 'Ruptures' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Niveaux de stock"
        description={data ? `${data.total} produit${data.total !== 1 ? 's' : ''} suivi${data.total !== 1 ? 's' : ''}` : undefined}
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un produit</label>
            <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              id={searchId}
              type="search"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
                fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Status filter tabs */}
          <div role="tablist" aria-label="Filtrer par statut de stock" style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => handleFilter(f.key)}
                style={{
                  padding: '0 14px', minHeight: 38, borderRadius: 'var(--radius-md)',
                  border: filter === f.key ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  background: filter === f.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                  color: filter === f.key ? 'var(--primary)' : 'var(--text-3)',
                  fontSize: 13, fontWeight: filter === f.key ? 600 : 400,
                  fontFamily: 'var(--font-display)', cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          {categories && categories.length > 0 && (
            <div>
              <label htmlFor={categoryId} className="sr-only">Filtrer par catégorie</label>
              <select
                id={categoryId}
                value={category}
                onChange={(e) => handleCategory(e.target.value)}
                style={{ padding: '0 10px', height: 38, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div aria-hidden="true">
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[180, 80, 80, 100, 70, 60].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
                <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <RichEmptyState
            icon={Layers}
            title="Aucun produit trouvé"
            description={search ? `Aucun résultat pour « ${search} »` : 'Aucun produit avec gestion de stock'}
            compact
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Niveaux de stock" aria-busy={isLoading}>
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Quantité</th>
                  <th scope="col">Seuils (min / max)</th>
                  <th scope="col">CMUP</th>
                  <th scope="col">Valeur stock</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`${ROUTES.STOCK_LEVELS}/${p.id}/history`} style={{ textDecoration: 'none' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</p>
                        </Link>
                        {p.reference && <p className="doc-number" style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.reference}</p>}
                        {p.category && (
                          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{p.category.name}</p>
                        )}
                      </div>
                    </td>
                    <td><StockStatusBadge status={p.stockStatus} /></td>
                    <td>
                      <span style={{ fontSize: 14, fontWeight: 600, color: p.stockStatus === 'rupture' ? '#dc2626' : 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                        {Number(p.stockQuantity)}
                      </span>
                      {p.stockUnit && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>{p.stockUnit}</span>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      {p.stockMinLevel != null ? Number(p.stockMinLevel) : '—'}
                      {' / '}
                      {p.stockMaxLevel != null ? Number(p.stockMaxLevel) : '—'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }} className="amount">
                      {p.costPriceHt != null ? formatXAF(Number(p.costPriceHt)) : '—'}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }} className="amount">
                      {formatXAF(Number(p.stockValue))}
                    </td>
                    <td><RowActions product={p} onAdjust={setDrawer} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.totalPages > 1 || products.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
              {data.totalPages > 1
                ? `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} sur ${data.total}`
                : `${products.length} produit${products.length !== 1 ? 's' : ''}`}
            </p>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {drawer && (
        <AdjustStockDrawer
          productId={drawer.id}
          productName={drawer.name}
          currentQty={Number(drawer.stockQuantity)}
          stockUnit={drawer.stockUnit}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
