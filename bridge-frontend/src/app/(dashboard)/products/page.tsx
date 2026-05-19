'use client'

import { useState, useMemo, useCallback, useId } from 'react'
import { Plus, Search, Settings2, ChevronLeft, ChevronRight, Upload, FileSpreadsheet, Package } from 'lucide-react'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { useProducts, useProductCategories } from '@/features/products/hooks'
import { ProductCard } from '@/features/products/components/ProductCard'
import { ProductDrawer } from '@/features/products/components/ProductDrawer'
import { CategoryManager } from '@/features/products/components/CategoryManager'
import { ImportProductsModal, downloadProductTemplate } from '@/features/products/ImportProductsModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { ROUTES } from '@/lib/constants'
import type { Product } from '@/features/products/types'

const PAGE_SIZE = 24

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

// ─── Pagination ────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s',
  }
  return (
    <nav aria-label="Pagination des produits" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente"
        style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
        <span aria-live="polite">Page {page} / {totalPages}</span>
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Page suivante"
        style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function ProductsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [typeFilter,     setTypeFilter]     = useState<'service' | 'product' | null>(null)
  const [search,         setSearch]         = useState('')
  const [showInactive,   setShowInactive]   = useState(false)
  const [page,           setPage]           = useState(1)
  const [formOpen,       setFormOpen]       = useState(false)
  const [editProduct,    setEditProduct]    = useState<Product | null>(null)
  const [catMgrOpen,     setCatMgrOpen]     = useState(false)
  const [importOpen,     setImportOpen]     = useState(false)

  const { can } = usePermission()
  const { data: categories = [] } = useProductCategories()

  const searchId = useId()

  // Reset page on filter change
  const handleTypeFilter    = useCallback((v: typeof typeFilter)    => { setTypeFilter(v);    setPage(1) }, [])
  const handleCatFilter     = useCallback((v: string | null)        => { setCategoryFilter(v); setPage(1) }, [])
  const handleSearchChange  = useCallback((v: string)               => { setSearch(v);         setPage(1) }, [])

  const params = useMemo(() => ({
    limit: PAGE_SIZE,
    page,
    ...(categoryFilter && { categoryId: categoryFilter }),
    ...(typeFilter     && { type: typeFilter }),
    ...(search         && { search }),
    ...(!showInactive  && { isActive: true }),
  }), [categoryFilter, typeFilter, search, showInactive, page])

  const { data, isLoading } = useProducts(params)
  const products = data?.data ?? []

  const handleEdit = (product: Product) => {
    setEditProduct(product)
    setFormOpen(true)
  }

  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
    setEditProduct(null)
  }, [])

  const TYPE_FILTERS = [
    { key: null,       label: 'Tous les types' },
    { key: 'service',  label: 'Prestations' },
    { key: 'product',  label: 'Produits' },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Produits & Services"
        description={
          data
            ? <span aria-live="polite">{data.total} produit{data.total !== 1 ? 's' : ''}</span>
            : undefined
        }
        actions={
          <>
            {can('product', 'create') && (
              <>
                <button
                  type="button"
                  onClick={() => setCatMgrOpen(true)}
                  aria-label="Gérer les catégories de produits"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer',
                    fontFamily: 'var(--font-display)', fontWeight: 500,
                  }}
                >
                  <Settings2 size={14} aria-hidden /> Catégories
                </button>
                <button
                  type="button"
                  onClick={downloadProductTemplate}
                  aria-label="Télécharger le modèle Excel pour l'import de produits"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer',
                    fontFamily: 'var(--font-display)', fontWeight: 500,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <FileSpreadsheet size={14} aria-hidden /> Modèle
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  aria-label="Importer des produits depuis un fichier Excel"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--primary)', background: 'rgba(45,125,210,0.07)',
                    color: 'var(--primary)', fontSize: 13.5, cursor: 'pointer',
                    fontFamily: 'var(--font-display)', fontWeight: 500,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Upload size={14} aria-hidden /> Importer
                </button>
                <button
                  type="button"
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
                  <Plus size={15} strokeWidth={2.5} aria-hidden /> Nouveau produit
                </button>
              </>
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
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un produit</label>
            <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              id={searchId}
              type="search"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Rechercher un produit"
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

          {/* Type filter tabs */}
          <div role="tablist" aria-label="Filtrer par type de produit" style={{ display: 'flex', gap: 4 }}>
            {TYPE_FILTERS.map((f) => (
              <button
                key={String(f.key)}
                type="button"
                role="tab"
                aria-selected={typeFilter === f.key}
                onClick={() => handleTypeFilter(f.key as typeof typeFilter)}
                style={{
                  padding: '0 12px', minHeight: 44, borderRadius: 'var(--radius-md)',
                  border: typeFilter === f.key ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                  background: typeFilter === f.key ? 'rgba(45,125,210,0.08)' : 'transparent',
                  color: typeFilter === f.key ? 'var(--primary)' : 'var(--text-3)',
                  fontSize: 12.5, fontWeight: typeFilter === f.key ? 600 : 400,
                  fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Show inactive toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginLeft: 'auto', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); setPage(1) }}
              style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Inclure inactifs</span>
          </label>
        </div>

        {/* Category tabs */}
        <div
          role="tablist"
          aria-label="Filtrer par catégorie"
          style={{
            display: 'flex', gap: 2, overflowX: 'auto',
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderTop: '1px solid var(--border)',
            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
            scrollbarWidth: 'thin',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === null}
            onClick={() => handleCatFilter(null)}
            style={{
              padding: '0 14px', minHeight: 36, borderRadius: 20, border: 'none',
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
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat.id}
              onClick={() => handleCatFilter(cat.id)}
              style={{
                padding: '0 14px', minHeight: 36, borderRadius: 20, border: 'none',
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
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[...Array(9)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        search
          ? <RichEmptyState icon={Package} title={`Aucun résultat pour « ${search} »`} description="Essayez un autre nom, référence ou catégorie." compact />
          : typeFilter
            ? <RichEmptyState icon={Package} title={`Aucun ${typeFilter === 'service' ? 'prestation' : 'produit'}`} description={`Aucun élément de type « ${typeFilter === 'service' ? 'Prestation' : 'Produit'} » pour le moment.`} compact />
            : <RichEmptyState
                icon={Package}
                title="Créez votre catalogue"
                description="Produits ou prestations de service — configurez vos tarifs une fois, réutilisez-les sur tous vos documents."
                features={['Produits & services', 'Remises par ligne', 'Catégories libres']}
                cta={can('product', 'create') ? { label: '+ Nouveau produit', onClick: () => setFormOpen(true) } : undefined}
                secondaryCta={{ label: 'Voir le guide', href: ROUTES.GUIDE }}
              />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onEdit={handleEdit} />
            ))}
          </div>

          {/* Footer: count + pagination */}
          {data && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
                {data.totalPages > 1
                  ? `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} sur ${data.total} produits`
                  : `${products.length} produit${products.length !== 1 ? 's' : ''}`}
              </p>
              {data.totalPages > 1 && (
                <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
              )}
            </div>
          )}
        </>
      )}

      {/* ── Product drawer ────────────────────────────────── */}
      {formOpen && (
        <ProductDrawer
          product={editProduct}
          onClose={handleCloseForm}
        />
      )}

      {/* ── Category manager modal ────────────────────────── */}
      {catMgrOpen && <CategoryManager onClose={() => setCatMgrOpen(false)} />}

      {/* ── Import products modal ─────────────────────────── */}
      <ImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        categories={categories}
      />
    </div>
  )
}
