'use client'

import { use, useState, useRef, useEffect, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Pencil, Loader2,
  Mail, Phone, MapPin, Globe, Building2, User, Clock,
  Hash, FileCheck, CreditCard, StickyNote, ShoppingCart,
  FileInput, TrendingDown, Star, Banknote, XCircle, AlertTriangle,
} from 'lucide-react'
import { useSupplier, useUpdateSupplier } from '@/features/suppliers/hooks'
import { usePurchaseOrders } from '@/features/purchase-orders/hooks'
import { useSupplierInvoices } from '@/features/supplier-invoices/hooks'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import { toast } from 'sonner'

// ─── Confirm deactivate modal ──────────────────────────────────

function ConfirmDeactivateModal({
  name, isPending, onConfirm, onCancel,
}: { name: string; isPending: boolean; onConfirm: () => void; onCancel: () => void }) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 28px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <XCircle size={18} style={{ color: '#dc2626' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 6px' }}>Désactiver ce fournisseur</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Voulez-vous désactiver <strong>{name}</strong> ? Il ne sera plus sélectionnable dans les commandes mais son historique sera conservé.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1 }}>
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isPending ? 'Désactivation…' : 'Désactiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rating stars ──────────────────────────────────────────────
function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return null
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11} style={{ color: i <= rating ? '#f59e0b' : 'var(--border)', fill: i <= rating ? '#f59e0b' : 'none' }} />
      ))}
    </div>
  )
}

// ─── Status config ─────────────────────────────────────────────
const STATUS_CFG = {
  active:      { label: 'Actif',       bg: 'rgba(16,185,129,0.1)',   color: '#10b981' },
  inactive:    { label: 'Inactif',     bg: 'rgba(148,163,184,0.15)', color: '#64748b' },
  blacklisted: { label: 'Liste noire', bg: 'rgba(220,38,38,0.1)',    color: '#dc2626' },
}

// ─── Recent orders table ───────────────────────────────────────
function RecentPurchaseOrders({ supplierId }: { supplierId: string }) {
  const { format } = useCurrency()
  const { data, isLoading } = usePurchaseOrders({ supplierId, limit: 5, page: 1 })
  const orders = data?.data ?? []
  const STATUS_PO: Record<string, { label: string; color: string; bg: string }> = {
    draft:              { label: 'Brouillon',  color: '#64748b', bg: 'rgba(148,163,184,0.15)' },
    sent:               { label: 'Envoyé',     color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
    confirmed:          { label: 'Confirmé',   color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)'   },
    partially_received: { label: 'Partiel',    color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
    received:           { label: 'Reçu',       color: '#16a34a', bg: 'rgba(16,163,74,0.1)'    },
    invoiced:           { label: 'Facturé',    color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
    closed:             { label: 'Clôturé',    color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
    cancelled:          { label: 'Annulé',     color: '#dc2626', bg: 'rgba(239,68,68,0.1)'    },
  }
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
          Bons de commande récents
        </p>
        <Link href={`${ROUTES.PURCHASE_ORDERS}?supplierId=${supplierId}`}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Voir tout →</Link>
      </div>
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 36, background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} className="animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <ShoppingCart size={26} style={{ color: 'var(--text-3)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px' }}>Aucun bon de commande</p>
          <Link href={`${ROUTES.PURCHASE_ORDERS}/new?supplierId=${supplierId}`}
            style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            + Créer un BC
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° BC', 'Date', 'Montant TTC', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textAlign: h === 'Montant TTC' ? 'right' : 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(po => {
                const st = STATUS_PO[po.status] ?? STATUS_PO.draft
                return (
                  <tr key={po.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>
                      <Link href={`${ROUTES.PURCHASE_ORDERS}/${po.id}`}
                        style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {po.number}
                      </Link>
                    </td>
                    <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(po.issueDate)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{format(po.totalTtc)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Recent supplier invoices ──────────────────────────────────
function RecentSupplierInvoices({ supplierId }: { supplierId: string }) {
  const { format } = useCurrency()
  const { data, isLoading } = useSupplierInvoices({ supplierId, limit: 5, page: 1 })
  const invoices = data?.data ?? []
  const STATUS_SI: Record<string, { label: string; color: string; bg: string }> = {
    received:       { label: 'Reçue',       color: '#2563eb', bg: 'rgba(59,130,246,0.1)'  },
    validated:      { label: 'Validée',     color: '#2D7DD2', bg: '#eff6ff'               },
    partially_paid: { label: 'Part. payée', color: '#d97706', bg: '#fffbeb'               },
    paid:           { label: 'Payée',       color: '#16a34a', bg: '#f0fdf4'               },
    disputed:       { label: 'Contestée',   color: '#dc2626', bg: '#fef2f2'               },
    cancelled:      { label: 'Annulée',     color: '#94a3b8', bg: '#f8fafc'               },
  }
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
          Factures fournisseur récentes
        </p>
        <Link href={`${ROUTES.SUPPLIER_INVOICES}?supplierId=${supplierId}`}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Voir tout →</Link>
      </div>
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 36, background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} className="animate-pulse" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <FileInput size={26} style={{ color: 'var(--text-3)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Aucune facture fournisseur</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° Facture', 'Date', 'Montant TTC', 'Solde dû', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textAlign: (h === 'Montant TTC' || h === 'Solde dû') ? 'right' : 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const st = STATUS_SI[inv.status] ?? STATUS_SI.received
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>
                      <Link href={`${ROUTES.SUPPLIER_INVOICES}/${inv.id}`}
                        style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(inv.invoiceDate)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{format(inv.totalTtc)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: inv.balanceDue > 0 ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                      {inv.balanceDue > 0 ? format(inv.balanceDue) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 180 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }     = use(params)
  const router     = useRouter()
  const { can }    = usePermission()
  const { format } = useCurrency()

  const [showDeactivate, setShowDeactivate] = useState(false)
  const { data: supplier, isLoading } = useSupplier(id)
  const updateMutation = useUpdateSupplier(id)

  const handleDeactivate = () => {
    updateMutation.mutate({ status: 'inactive' }, {
      onSuccess: () => { setShowDeactivate(false); toast.success('Fournisseur désactivé') },
    })
  }

  if (!can('supplier', 'read')) return <AccessDenied message="Vous n'avez pas accès aux fournisseurs." />
  if (isLoading) return <Skeleton />
  if (!supplier) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Fournisseur introuvable</p>
      <Link href={ROUTES.SUPPLIERS} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        ← Retour aux fournisseurs
      </Link>
    </div>
  )

  const statusCfg = STATUS_CFG[supplier.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.inactive
  const isActive  = supplier.status === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Back */}
      <Link href={ROUTES.SUPPLIERS}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
        <ChevronLeft size={14} /> Fournisseurs
      </Link>

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Left: avatar + name + badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: isActive ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: isActive ? 'var(--primary)' : 'var(--text-3)', fontFamily: 'var(--font-display)', flexShrink: 0, border: `2px solid ${isActive ? 'rgba(45,125,210,0.2)' : 'var(--border)'}` }}>
              {getInitials(supplier.name)}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                  {supplier.name}
                </h1>
                <span style={{ ...statusCfg, fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase' }}>
                  {statusCfg.label}
                </span>
                {supplier.supplierCode && (
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    #{supplier.supplierCode}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  {supplier.type === 'company' ? <><Building2 size={13} /> Entreprise</> : <><User size={13} /> Particulier</>}
                </span>
                {supplier.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                    <Mail size={13} /> {supplier.email}
                  </span>
                )}
                {supplier.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                    <Phone size={13} /> {supplier.phone}
                  </span>
                )}
                {supplier.rating && <RatingStars rating={supplier.rating} />}
              </div>
            </div>
          </div>
          {/* Right: totals */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total achats</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: '0 0 6px' }}>{format(supplier.totalPurchases ?? 0)}</p>
            {(supplier.totalDue ?? 0) > 0 && (
              <p style={{ fontSize: 13, color: '#dc2626', fontFamily: 'var(--font-mono)', fontWeight: 700, margin: 0 }}>
                Solde dû : {format(supplier.totalDue ?? 0)}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('supplier', 'create') && (
            <Link href={`${ROUTES.PURCHASE_ORDERS}/new?supplierId=${id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <ShoppingCart size={13} /> Nouveau BC
            </Link>
          )}
          <Link href={`${ROUTES.SUPPLIER_INVOICES}?supplierId=${id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <FileInput size={13} /> Factures
          </Link>
          {can('supplier', 'update') && (
            <button onClick={() => router.push(`${ROUTES.SUPPLIERS}/${id}/edit`)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <Pencil size={13} /> Modifier
            </button>
          )}
          {can('supplier', 'update') && isActive && (
            <button onClick={() => setShowDeactivate(true)} disabled={updateMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <XCircle size={13} /> Désactiver
            </button>
          )}
        </div>
      </div>

      {/* Solde dû alert */}
      {(supplier.totalDue ?? 0) > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertTriangle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', margin: 0 }}>
            Solde en attente de <span style={{ fontFamily: 'var(--font-mono)' }}>{format(supplier.totalDue ?? 0)}</span> sur des factures fournisseur en cours.
          </p>
        </div>
      )}

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>

        {/* Main — tables */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <RecentPurchaseOrders supplierId={id} />
          <RecentSupplierInvoices supplierId={id} />
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI stats */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Statistiques
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([
                ['Total achats',     format(supplier.totalPurchases ?? 0),           'var(--primary)'],
                ['Solde dû',         format(supplier.totalDue ?? 0),                 (supplier.totalDue ?? 0) > 0 ? '#dc2626' : '#10b981'],
                ['Délai paiement',   `${supplier.defaultDueDays ?? 30} jours`,       '#d97706'],
                ['Bons de commande', String(supplier._count?.purchaseOrders ?? 0),   '#7c3aed'],
                ['Factures FF',      String(supplier._count?.invoices ?? 0),         '#0891b2'],
              ] as [string, string, string][]).map(([label, value, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact & infos */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Informations
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(supplier.address || supplier.city) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <MapPin size={13} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                    {[supplier.address, supplier.city, supplier.country !== 'Cameroun' ? supplier.country : null].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {supplier.website && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Globe size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <a href={supplier.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'none', wordBreak: 'break-all' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
                    {supplier.website}
                  </a>
                </div>
              )}
              {supplier.taxNumber && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}><Hash size={13} /> NIU</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{supplier.taxNumber}</span>
                </div>
              )}
              {supplier.rccm && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}><FileCheck size={13} /> RCCM</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{supplier.rccm}</span>
                </div>
              )}
              {supplier.accountingAccount && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}><Banknote size={13} /> SYSCOHADA</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{supplier.accountingAccount}</span>
                </div>
              )}
              {supplier.bankName && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CreditCard size={13} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                    {supplier.bankName}{supplier.bankAccount ? ` — ${supplier.bankAccount}` : ''}
                  </span>
                </div>
              )}
              <div style={{ paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <Clock size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Depuis le {formatDate(supplier.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Notes internes */}
          {supplier.internalNotes && can('supplier', 'update') && (
            <div className="card" style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <StickyNote size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Notes internes</p>
                  <p style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.6, margin: 0 }}>{supplier.internalNotes}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDeactivate && (
        <ConfirmDeactivateModal
          name={supplier.name}
          isPending={updateMutation.isPending}
          onConfirm={handleDeactivate}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </div>
  )
}
