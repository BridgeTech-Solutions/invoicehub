'use client'

import { useState, useId, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  Plus, Search, FileDown, ShoppingCart, Pencil, Trash2, Copy,
  CheckCircle, PackageCheck, XCircle, Loader2, Clock, Package,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { ActionMenu } from '@/components/ui/ActionMenu'
import {
  usePurchaseOrders, usePurchaseOrderStats, useSendPurchaseOrder,
  useConfirmPurchaseOrder, useCancelPurchaseOrder, useDuplicatePurchaseOrder,
  useDeletePurchaseOrder,
} from '@/features/purchase-orders/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { PurchaseOrderListItem, PurchaseOrderStatus } from '@/features/purchase-orders/types'

// ─── Status config ────────────────────────────────────────────
const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:              { label: 'Brouillon',          color: '#64748b', bg: 'rgba(148,163,184,0.15)' },
  sent:               { label: 'Envoyé',             color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
  confirmed:          { label: 'Confirmé',           color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)'   },
  partially_received: { label: 'Partiel',            color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
  received:           { label: 'Réceptionné',        color: '#16a34a', bg: 'rgba(16,163,74,0.1)'    },
  invoiced:           { label: 'Facturé',            color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
  cancelled:          { label: 'Annulé',             color: '#dc2626', bg: 'rgba(239,68,68,0.1)'    },
  closed:             { label: 'Clôturé',            color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
}

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
      {cfg.label}
    </span>
  )
}

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s' }
  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }} aria-label="Précédent">‹</button>
      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page + i - 2
        if (p < 1 || p > totalPages) return null
        return <button key={p} type="button" onClick={() => onChange(p)} style={{ ...btn, background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-2)', borderColor: p === page ? 'var(--primary)' : 'var(--border)', fontWeight: p === page ? 600 : 400 }}>{p}</button>
      })}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }} aria-label="Suivant">›</button>
    </nav>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const { can } = usePermission()
  const { format } = useCurrency()
  const router   = useRouter()
  const searchId = useId()

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('')
  const [page,         setPage]         = useState(1)

  const params = useMemo(() => ({
    page, limit: 25,
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
  }), [page, search, statusFilter])

  const { data, isLoading }       = usePurchaseOrders(params)
  const { data: stats }           = usePurchaseOrderStats()
  const sendMutation              = useSendPurchaseOrder()
  const confirmMutation           = useConfirmPurchaseOrder()
  const cancelMutation            = useCancelPurchaseOrder()
  const duplicateMutation         = useDuplicatePurchaseOrder()
  const deleteMutation            = useDeletePurchaseOrder()

  const orders      = data?.data ?? []
  const totalPages  = data?.totalPages ?? 1

  function handleSearch(val: string) { setSearch(val); setPage(1) }

  const now = new Date()
  function isOverdue(dateStr: string | null) {
    if (!dateStr) return false
    return new Date(dateStr) < now
  }

  if (!can('purchase-order', 'read')) return <AccessDenied message="Vous n'avez pas accès aux bons de commande." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'page-in 0.2s ease' }}>
      <PageHeader
        title="Bons de commande"
        description={data ? `${data.total} bon${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <>
            <Link href={`${ROUTES.PURCHASE_ORDERS}/new`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              <Plus size={15} strokeWidth={2.5} aria-hidden /> Nouveau BC
            </Link>
          </>
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard label="Total BC" value={data ? String(data.total) : '—'} icon={ShoppingCart} color="var(--primary)" />
        <KpiCard label="Envoyés" value={stats ? String(stats.pending) : '—'} icon={Clock} color="var(--s-po-pending)" />
        <KpiCard label="Confirmés" value={stats ? String(stats.approved) : '—'} icon={CheckCircle} color="var(--s-po-approved)" />
        <KpiCard label="Réceptionnés" value={stats ? String(stats.received) : '—'} icon={PackageCheck} color="var(--s-po-received)" />
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un bon de commande</label>
            <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input id={searchId} type="search" placeholder="N° BC, fournisseur…" value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }} />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as PurchaseOrderStatus | ''); setPage(1) }}
            style={{ padding: '0 10px', height: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr 1fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[80, 140, 90, 90, 80, 70].map((w, j) => (
                  <div key={j} style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
                <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          search
            ? <RichEmptyState icon={ShoppingCart} title={`Aucun résultat pour « ${search} »`} description="Essayez un autre numéro ou fournisseur." compact />
            : <RichEmptyState icon={ShoppingCart} title="Aucun bon de commande"
                description="Créez votre premier bon de commande pour commander auprès de vos fournisseurs."
                features={['Suivi livraison', 'Approbation', 'Three-way matching']}
                cta={{ label: '+ Nouveau BC', href: `${ROUTES.PURCHASE_ORDERS}/new` }} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Liste des bons de commande" aria-busy={isLoading}>
              <thead>
                <tr>
                  <th scope="col">N° BC</th>
                  <th scope="col">Fournisseur</th>
                  <th scope="col">Date commande</th>
                  <th scope="col">Livraison</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Montant TTC</th>
                  <th scope="col">Statut</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const overdueDelivery = isOverdue(order.expectedDeliveryDate) && !['received', 'invoiced', 'closed', 'cancelled'].includes(order.status)
                  const actions = [
                    { label: 'Voir le détail', icon: ShoppingCart, onClick: () => router.push(`${ROUTES.PURCHASE_ORDERS}/${order.id}`) },
                    ...(['draft', 'sent'].includes(order.status)
                      ? [{ label: 'Modifier', icon: Pencil, onClick: () => router.push(`${ROUTES.PURCHASE_ORDERS}/${order.id}/edit`) }]
                      : []),
                    ...(order.status === 'draft'
                      ? [{ label: 'Envoyer', icon: CheckCircle, onClick: () => sendMutation.mutate(order.id) }]
                      : []),
                    ...(order.status === 'sent'
                      ? [{ label: 'Confirmer', icon: CheckCircle, onClick: () => confirmMutation.mutate(order.id) }]
                      : []),
                    { label: 'Dupliquer', icon: Copy, onClick: () => duplicateMutation.mutate(order.id) },
                    ...(['draft', 'sent', 'confirmed'].includes(order.status)
                      ? [{ label: 'Annuler', icon: XCircle, onClick: () => cancelMutation.mutate(order.id), danger: true, separator: true }]
                      : []),
                    ...(order.status === 'draft'
                      ? [{ label: 'Supprimer', icon: Trash2, onClick: () => deleteMutation.mutate(order.id), danger: true }]
                      : []),
                  ]
                  return (
                    <tr key={order.id} style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`${ROUTES.PURCHASE_ORDERS}/${order.id}`)}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}>{order.number}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{order.supplier.name}</span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{formatDate(order.issueDate)}</td>
                      <td style={{ fontSize: 13, color: overdueDelivery ? '#dc2626' : 'var(--text-2)', fontWeight: overdueDelivery ? 600 : 400 }}>
                        {order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : <span style={{ color: 'var(--border)' }}>—</span>}
                        {overdueDelivery && <span style={{ fontSize: 10, marginLeft: 4, background: '#fef2f2', color: '#dc2626', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>En retard</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                        {format(order.totalTtc)}
                      </td>
                      <td><StatusBadge status={order.status} /></td>
                      <td onClick={e => e.stopPropagation()}><ActionMenu items={actions} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.totalPages > 1 || orders.length > 0) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{orders.length} bon{orders.length !== 1 ? 's' : ''}</p>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
