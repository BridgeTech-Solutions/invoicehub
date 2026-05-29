'use client'

import { use, useState, useRef, useEffect, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Pencil, AlertTriangle, Loader2,
  Mail, Phone, MapPin, Globe, Building2, User, Clock,
  Hash, FileCheck, CreditCard, StickyNote, ShoppingCart,
  FileInput, TrendingDown, Star, Banknote, XCircle,
} from 'lucide-react'
import { useSupplier, useUpdateSupplier } from '@/features/suppliers/hooks'
import { usePurchaseOrders } from '@/features/purchase-orders/hooks'
import { useSupplierInvoices } from '@/features/supplier-invoices/hooks'
import { PageHeader } from '@/components/layout/PageHeader'
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
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 28px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <XCircle size={18} style={{ color: '#dc2626' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 6px' }}>
              Désactiver ce fournisseur
            </h3>
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

// ─── Info row helper ───────────────────────────────────────────
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: 'var(--text-3)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

// ─── Status config ─────────────────────────────────────────────
const STATUS_CFG = {
  active:      { label: 'Actif',        bg: 'rgba(34,197,94,0.1)',   color: '#16a34a' },
  inactive:    { label: 'Inactif',      bg: 'rgba(148,163,184,0.15)', color: '#64748b' },
  blacklisted: { label: 'Liste noire',  bg: 'rgba(220,38,38,0.1)',   color: '#dc2626' },
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

// ─── Recent orders table ───────────────────────────────────────
function RecentPurchaseOrders({ supplierId }: { supplierId: string }) {
  const { format } = useCurrency()
  const { data, isLoading } = usePurchaseOrders({ supplierId, limit: 5, page: 1 })
  const orders = data?.data ?? []

  const STATUS_PO: Record<string, { label: string; color: string; bg: string }> = {
    draft:     { label: 'Brouillon',  color: '#64748b', bg: '#f1f5f9' },
    sent:      { label: 'Envoyé',     color: '#2D7DD2', bg: '#eff6ff' },
    confirmed: { label: 'Confirmé',   color: '#7c3aed', bg: '#f5f3ff' },
    received:  { label: 'Reçu',       color: '#16a34a', bg: '#f0fdf4' },
    cancelled: { label: 'Annulé',     color: '#94a3b8', bg: '#f8fafc' },
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Bons de commande récents</p>
        <Link href={`${ROUTES.PURCHASE_ORDERS}?supplierId=${supplierId}`}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Voir tout
        </Link>
      </div>
      {isLoading ? (
        <div style={{ padding: 20 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 36, background: 'var(--border)', borderRadius: 4, marginBottom: 8, opacity: 0.5 }} className="animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <ShoppingCart size={28} style={{ color: 'var(--text-3)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucun bon de commande</p>
          <Link href={`${ROUTES.PURCHASE_ORDERS}/new?supplierId=${supplierId}`}
            style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', marginTop: 6, display: 'inline-block', fontWeight: 500 }}>
            Créer un bon de commande
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['N° BC', 'Date', 'Montant TTC', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((po, i) => {
                const st = STATUS_PO[po.status] ?? STATUS_PO.draft
                return (
                  <tr key={po.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <Link href={`${ROUTES.PURCHASE_ORDERS}/${po.id}`}
                        style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {po.number}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(po.orderDate)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{format(po.totalTtc)}</td>
                    <td style={{ padding: '9px 14px' }}>
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
    received:        { label: 'Reçue',         color: '#2563eb', bg: 'rgba(59,130,246,0.1)' },
    validated:       { label: 'Validée',        color: '#2D7DD2', bg: '#eff6ff' },
    partially_paid:  { label: 'Part. payée',    color: '#d97706', bg: '#fffbeb' },
    paid:            { label: 'Payée',          color: '#16a34a', bg: '#f0fdf4' },
    disputed:        { label: 'Contestée',      color: '#dc2626', bg: '#fef2f2' },
    cancelled:       { label: 'Annulée',        color: '#94a3b8', bg: '#f8fafc' },
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Factures fournisseur récentes</p>
        <Link href={`${ROUTES.SUPPLIER_INVOICES}?supplierId=${supplierId}`}
          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Voir tout
        </Link>
      </div>
      {isLoading ? (
        <div style={{ padding: 20 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 36, background: 'var(--border)', borderRadius: 4, marginBottom: 8, opacity: 0.5 }} className="animate-pulse" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <FileInput size={28} style={{ color: 'var(--text-3)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune facture fournisseur</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['N° Facture', 'Date', 'Montant TTC', 'Solde dû', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'left', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const st = STATUS_SI[inv.status] ?? STATUS_SI.received
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <Link href={`${ROUTES.SUPPLIER_INVOICES}/${inv.id}`}
                        style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(inv.invoiceDate)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{format(inv.totalTtc)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: inv.balanceDue > 0 ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                      {format(inv.balanceDue)}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
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

// ─── Main page ─────────────────────────────────────────────────

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { can } = usePermission()
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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 14, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 28, width: 280, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card" style={{ padding: 24 }}>
          <div style={{ height: 60, background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
        </div>
      </div>
    )
  }

  if (!supplier) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Fournisseur introuvable</p>
        <Link href={ROUTES.SUPPLIERS} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
          ← Retour aux fournisseurs
        </Link>
      </div>
    )
  }

  const statusCfg = STATUS_CFG[supplier.status] ?? STATUS_CFG.inactive
  const isActive  = supplier.status === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Breadcrumb */}
      <Link href={ROUTES.SUPPLIERS}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
        <ChevronLeft size={14} /> Retour aux fournisseurs
      </Link>

      {/* Header */}
      <PageHeader
        title={supplier.name}
        description={supplier.type === 'company' ? 'Entreprise' : supplier.type === 'individual' ? 'Particulier' : supplier.type}
        actions={
          <>
            {can('supplier', 'create') && (
              <Link href={`${ROUTES.PURCHASE_ORDERS}/new?supplierId=${id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                <ShoppingCart size={14} /> Nouveau BC
              </Link>
            )}
            {can('supplier', 'update') && (
              <button onClick={() => router.push(`${ROUTES.SUPPLIERS}/${id}/edit`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
                <Pencil size={14} /> Modifier
              </button>
            )}
          </>
        }
      />

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left — Fiche fournisseur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identity card */}
          <div className="card" style={{ padding: 20 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <span style={{ width: 60, height: 60, borderRadius: '50%', background: isActive ? 'rgba(45,125,210,0.1)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: isActive ? 'var(--primary)' : 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 10, border: `2px solid ${isActive ? 'rgba(45,125,210,0.2)' : 'var(--border)'}` }}>
                {getInitials(supplier.name)}
              </span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{supplier.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
                {supplier.type === 'company'
                  ? <><Building2 size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12, color: 'var(--text-3)' }}>Entreprise</span></>
                  : <><User size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12, color: 'var(--text-3)' }}>Particulier</span></>}
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
              </div>
              {supplier.rating && (
                <div style={{ marginTop: 8 }}>
                  <RatingStars rating={supplier.rating} />
                </div>
              )}
              {supplier.supplierCode && (
                <span style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>#{supplier.supplierCode}</span>
              )}
            </div>

            {/* Details list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {supplier.email && (
                <InfoRow icon={<Mail size={14} />}>
                  <a href={`mailto:${supplier.email}`} style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 13 }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)' }}>
                    {supplier.email}
                  </a>
                </InfoRow>
              )}
              {supplier.phone && (
                <InfoRow icon={<Phone size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{supplier.phone}</span>
                </InfoRow>
              )}
              {(supplier.address || supplier.city || supplier.country) && (
                <InfoRow icon={<MapPin size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    {[supplier.address, supplier.city, supplier.country !== 'Cameroun' ? supplier.country : null].filter(Boolean).join(' · ')}
                  </span>
                </InfoRow>
              )}
              {supplier.website && (
                <InfoRow icon={<Globe size={14} />}>
                  <a href={supplier.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 13 }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)' }}>
                    {supplier.website}
                  </a>
                </InfoRow>
              )}
              {supplier.taxNumber && (
                <InfoRow icon={<Hash size={14} />}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>NIU</span>
                  <span className="doc-number" style={{ fontSize: 12 }}>{supplier.taxNumber}</span>
                </InfoRow>
              )}
              {supplier.rccm && (
                <InfoRow icon={<FileCheck size={14} />}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>RCCM</span>
                  <span className="doc-number" style={{ fontSize: 12 }}>{supplier.rccm}</span>
                </InfoRow>
              )}
              {supplier.accountingAccount && (
                <InfoRow icon={<Banknote size={14} />}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>SYSCOHADA</span>
                  <span className="doc-number" style={{ fontSize: 12 }}>{supplier.accountingAccount}</span>
                </InfoRow>
              )}
              {supplier.bankName && (
                <InfoRow icon={<CreditCard size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {supplier.bankName}{supplier.bankAccount ? ` — ${supplier.bankAccount}` : ''}
                  </span>
                </InfoRow>
              )}
              {supplier.internalNotes && can('supplier', 'update') && (
                <div style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <StickyNote size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>{supplier.internalNotes}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <Clock size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Fournisseur depuis le {formatDate(supplier.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Statistiques
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Total achats',    value: format(supplier.totalPurchases ?? 0), color: 'var(--primary)' },
                { label: 'Solde dû',        value: format(supplier.totalDue ?? 0),       color: (supplier.totalDue ?? 0) > 0 ? '#dc2626' : '#16a34a' },
                { label: 'Délai paiement',  value: `${supplier.defaultDueDays} jours`,   color: '#d97706' },
                { label: 'Bons de commande', value: String(supplier._count?.purchaseOrders ?? 0), color: '#7c3aed' },
                { label: 'Factures',        value: String(supplier._count?.invoices ?? 0), color: '#0891b2' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>
              Actions rapides
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href={`${ROUTES.PURCHASE_ORDERS}/new?supplierId=${id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', textDecoration: 'none', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 500 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}>
                <ShoppingCart size={13} /> Créer un bon de commande
              </Link>
              <Link href={`${ROUTES.SUPPLIER_INVOICES}?supplierId=${id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', textDecoration: 'none', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 500 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}>
                <FileInput size={13} /> Voir les factures fournisseur
              </Link>
              {can('supplier', 'update') && isActive && (
                <button
                  onClick={() => setShowDeactivate(true)}
                  disabled={updateMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: '#dc2626', fontFamily: 'var(--font-body)', fontWeight: 500, textAlign: 'left' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#dc2626'; (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.04)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <XCircle size={13} /> Désactiver ce fournisseur
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right — History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Solde dû banner */}
          {(supplier.totalDue ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <TrendingDown size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: '#991b1b', marginBottom: 2 }}>Solde fournisseur en attente</p>
                <p style={{ fontSize: 13, color: '#b91c1c' }}>
                  <span className="amount">{format(supplier.totalDue ?? 0)}</span> à régler sur des factures fournisseur en cours.
                </p>
              </div>
            </div>
          )}

          <RecentPurchaseOrders supplierId={id} />
          <RecentSupplierInvoices supplierId={id} />
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
