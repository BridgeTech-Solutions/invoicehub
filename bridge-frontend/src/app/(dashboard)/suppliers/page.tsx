'use client'

import { useState, useId, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  Plus, Search, FileDown, Building2, Pencil, Trash2,
  Phone, Mail, ExternalLink, Loader2, ShoppingCart, FileInput,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { useSuppliers, useDeleteSupplier, useExportSuppliersCsv } from '@/features/suppliers/hooks'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { SupplierListItem } from '@/features/suppliers/types'
import { toast } from 'sonner'

// ─── Pagination ───────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s',
  }
  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}
        style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
        aria-label="Page précédente">‹</button>
      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page + i - 2
        if (p < 1 || p > totalPages) return null
        return (
          <button key={p} type="button" onClick={() => onChange(p)}
            style={{ ...btn, background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-2)', borderColor: p === page ? 'var(--primary)' : 'var(--border)', fontWeight: p === page ? 600 : 400 }}>
            {p}
          </button>
        )
      })}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
        aria-label="Page suivante">›</button>
    </nav>
  )
}

// ─── Confirm delete ───────────────────────────────────────────
function ConfirmDeleteModal({ supplier, onConfirm, onCancel }: {
  supplier: SupplierListItem; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,25,35,0.45)', backdropFilter: 'blur(2px)' }}>
      <div className="card" style={{ padding: 28, maxWidth: 400, width: '100%', margin: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Trash2 size={20} style={{ color: '#dc2626' }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)', marginBottom: 8 }}>
          Supprimer ce fournisseur ?
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-2)' }}>{supplier.name}</strong> sera définitivement supprimé.
          Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Annuler
          </button>
          <button onClick={onConfirm} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { can } = usePermission()
  const { format } = useCurrency()
  const router    = useRouter()
  const searchId  = useId()
  const statusId  = useId()

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page,         setPage]         = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<SupplierListItem | null>(null)

  const params = useMemo(() => ({
    page, limit: 25,
    ...(search && { search }),
    ...(statusFilter === 'active'   && { isActive: true }),
    ...(statusFilter === 'inactive' && { isActive: false }),
  }), [page, search, statusFilter])

  const { data, isLoading } = useSuppliers(params)
  const deleteMutation  = useDeleteSupplier()
  const exportMutation  = useExportSuppliersCsv()

  const suppliers   = data?.data ?? []
  const totalPages  = data?.totalPages ?? 1

  function handleSearchChange(val: string) { setSearch(val); setPage(1) }
  function handleStatusChange(val: string) { setStatusFilter(val as typeof statusFilter); setPage(1) }

  function handleDelete(supplier: SupplierListItem) { setDeleteTarget(supplier) }
  function confirmDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) })
  }

  if (!can('supplier', 'read')) return <AccessDenied message="Vous n'avez pas accès au module fournisseurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'page-in 0.2s ease' }}>
      <PageHeader
        title="Fournisseurs"
        description={data ? `${data.total} fournisseur${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <>
            <button
              onClick={() => exportMutation.mutate(params)}
              disabled={exportMutation.isPending || suppliers.length === 0}
              aria-label="Exporter en CSV"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              {exportMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              Exporter
            </button>
            <Link
              href={`${ROUTES.SUPPLIERS}/new`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
            >
              <Plus size={15} strokeWidth={2.5} aria-hidden /> Nouveau fournisseur
            </Link>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un fournisseur</label>
            <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              id={searchId}
              type="search"
              placeholder="Rechercher un fournisseur…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }}
            />
          </div>
          <div>
            <label htmlFor={statusId} className="sr-only">Filtrer par statut</label>
            <select
              id={statusId}
              value={statusFilter}
              onChange={e => handleStatusChange(e.target.value)}
              style={{ padding: '0 10px', height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="all">Tous</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1fr 1fr 1fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
                  <div>
                    <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4, marginBottom: 4 }} className="animate-pulse" />
                    <div style={{ height: 10, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                  </div>
                </div>
                {[100, 80, 90, 80].map((w, j) => (
                  <div key={j} style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
                <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              </div>
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          search
            ? <RichEmptyState icon={Building2} title={`Aucun résultat pour « ${search} »`} description="Essayez un autre nom, NIU ou ville." compact />
            : <RichEmptyState
                icon={Building2}
                title="Ajoutez vos premiers fournisseurs"
                description="Centralisez vos fournisseurs, suivez vos achats et gérez vos dettes fournisseurs."
                features={['Bons de commande', 'Factures fournisseurs', 'Solde dû en temps réel']}
                cta={{ label: '+ Nouveau fournisseur', href: `${ROUTES.SUPPLIERS}/new` }}
              />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Liste des fournisseurs" aria-busy={isLoading}>
              <thead>
                <tr>
                  <th scope="col">Fournisseur</th>
                  <th scope="col">Contact</th>
                  <th scope="col">NIU / RCCM</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Total achats</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Solde dû</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(supplier => (
                  <tr key={supplier.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                          {getInitials(supplier.name)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <Link href={`${ROUTES.SUPPLIERS}/${supplier.id}`} style={{ textDecoration: 'none' }}>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{supplier.name}</p>
                          </Link>
                          {supplier.city && (
                            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{supplier.city}{supplier.country ? `, ${supplier.country}` : ''}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {supplier.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <Mail size={11} aria-hidden style={{ color: 'var(--text-3)' }} />
                          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{supplier.email}</span>
                        </div>
                      )}
                      {supplier.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Phone size={11} aria-hidden style={{ color: 'var(--text-3)' }} />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{supplier.phone}</span>
                        </div>
                      )}
                      {!supplier.email && !supplier.phone && <span style={{ color: 'var(--border)', fontSize: 13 }}>—</span>}
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
                        {supplier.taxNumber ?? supplier.rccm ?? <span style={{ color: 'var(--border)' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
                      {format(supplier.totalPurchases ?? 0)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: (supplier.totalDue ?? 0) > 0 ? '#dc2626' : 'var(--text-3)' }}>
                        {(supplier.totalDue ?? 0) > 0 ? format(supplier.totalDue!) : '—'}
                      </span>
                    </td>
                    <td>
                      <ActionMenu items={[
                        { label: 'Voir le détail',         icon: Building2,  onClick: () => router.push(`${ROUTES.SUPPLIERS}/${supplier.id}`) },
                        { label: 'Modifier',               icon: Pencil,     onClick: () => router.push(`${ROUTES.SUPPLIERS}/${supplier.id}/edit`) },
                        { label: 'Bons de commande',       icon: ShoppingCart, onClick: () => router.push(`${ROUTES.PURCHASE_ORDERS}?supplierId=${supplier.id}`) },
                        { label: 'Factures fournisseur',   icon: FileInput,  onClick: () => router.push(`${ROUTES.SUPPLIER_INVOICES}?supplierId=${supplier.id}`) },
                        { label: 'Supprimer',              icon: Trash2,     onClick: () => handleDelete(supplier), danger: true, separator: true },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {data && (data.totalPages > 1 || suppliers.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }} aria-live="polite">
              {suppliers.length} fournisseur{suppliers.length !== 1 ? 's' : ''}
            </p>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          supplier={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
