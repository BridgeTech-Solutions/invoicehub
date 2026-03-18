'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Settings2, Package } from 'lucide-react'
import { useProducts, useProductCategories } from '@/features/products/hooks'
import { ProductCard } from '@/features/products/components/ProductCard'
import { ProductForm } from '@/features/products/components/ProductForm'
import { CategoryManager } from '@/features/products/components/CategoryManager'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import type { Product } from '@/features/products/types'

// ─── Skeleton card ─────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} className="animate-pulse" />
        <div style={{ width: 44, height: 20, borderRadius: 10, background: 'var(--border)' }} className="animate-pulse" />
      </div>
      <div style={{ height: 15, width: '80%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 11, width: '50%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 22, width: '65%', background: 'var(--border)', borderRadius: 4, marginTop: 4 }} className="animate-pulse" />
      <div style={{ height: 11, width: '40%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function ProductsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [typeFilter,     setTypeFilter]     = useState<'service' | 'product' | null>(null)
  const [search,         setSearch]         = useState('')
  const [showInactive,   setShowInactive]   = useState(false)
  const [formOpen,       setFormOpen]       = useState(false)
  const [editProduct,    setEditProduct]    = useState<Product | null>(null)
  const [catMgrOpen,     setCatMgrOpen]     = useState(false)

  const { can } = usePermission()
  const { data: categories = [] } = useProductCategories()

  const params = useMemo(() => ({
    limit: 100,
    ...(categoryFilter && { categoryId: categoryFilter }),
    ...(typeFilter     && { type: typeFilter }),
    ...(search         && { search }),
    ...(!showInactive  && { isActive: true }),
  }), [categoryFilter, typeFilter, search, showInactive])

  const { data, isLoading } = useProducts(params)
  const products = data?.data ?? []

  const handleEdit = (product: Product) => {
    setEditProduct(product)
    setFormOpen(true)
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    setEditProduct(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Produits & Services"
        description={data ? `${data.total} produit${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <>
            {/* Categories manager (admin only) */}
            {can('product', 'create') && (
              <button
                onClick={() => setCatMgrOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 500,
                }}
              >
                <Settings2 size={14} /> Catégories
              </button>
            )}
            {can('product', 'create') && (
              <button
                onClick={() => { setEditProduct(null); setFormOpen(true) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13.5,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
                }}
              >
                <Plus size={15} strokeWidth={2.5} /> Nouveau produit
              </button>
            )}
          </>
        }
      />

      {/* ── Toolbar ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Search + type filters */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          padding: '14px 20px',
          background: 'var(--surface)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          border: '1px solid var(--border)', borderBottom: 'none',
        }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
                fontFamily: 'var(--font-body)', outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }}
            />
          </div>

          {/* Type filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: null,       label: 'Tous les types' },
              { key: 'service',  label: 'Prestations' },
              { key: 'product',  label: 'Produits' },
            ] as const).map((f) => (
              <button
                key={String(f.key)}
                onClick={() => setTypeFilter(f.key)}
                style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-md)',
                  border: typeFilter === f.key ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  background: typeFilter === f.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                  color: typeFilter === f.key ? 'var(--primary)' : 'var(--text-3)',
                  fontSize: 12.5, fontWeight: typeFilter === f.key ? 600 : 400,
                  fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Show inactive toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Inclure inactifs</span>
          </label>
        </div>

        {/* Category tabs */}
        <div style={{
          display: 'flex', gap: 2, overflowX: 'auto',
          padding: '10px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)', borderTop: '1px solid var(--border)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          scrollbarWidth: 'thin',
        }}>
          <button
            onClick={() => setCategoryFilter(null)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none',
              background: categoryFilter === null ? 'var(--primary)' : 'var(--bg)',
              color:      categoryFilter === null ? '#fff'           : 'var(--text-3)',
              fontSize: 12.5, fontWeight: categoryFilter === null ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none',
                background: categoryFilter === cat.id ? (cat.color ?? 'var(--primary)') : 'var(--bg)',
                color:      categoryFilter === cat.id ? '#fff' : 'var(--text-3)',
                fontSize: 12.5, fontWeight: categoryFilter === cat.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product grid ──────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[...Array(9)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '64px 20px', textAlign: 'center',
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}>
          <Package size={44} style={{ color: 'var(--border)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 4 }}>
            {search ? `Aucun résultat pour "${search}"` : 'Aucun produit pour le moment'}
          </p>
          {can('product', 'create') && !search && (
            <button
              onClick={() => setFormOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 13.5,
                fontFamily: 'var(--font-display)', fontWeight: 600,
              }}
            >
              <Plus size={13} /> Créer le premier produit
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onEdit={handleEdit} />
            ))}
          </div>
          {data && data.total > products.length && (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>
              {products.length} / {data.total} produits affichés
            </p>
          )}
        </>
      )}

      {/* ── Product form modal ────────────────────────────── */}
      {formOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h2 className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
                {editProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              <button onClick={handleCloseForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <ProductForm product={editProduct ?? undefined} onClose={handleCloseForm} />
          </div>
        </div>
      )}

      {/* ── Category manager modal ────────────────────────── */}
      {catMgrOpen && <CategoryManager onClose={() => setCatMgrOpen(false)} />}
    </div>
  )
}
