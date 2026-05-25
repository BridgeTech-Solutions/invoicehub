'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  ChevronLeft, CheckCircle2, XCircle, PackageCheck, Copy,
  Pencil, Clock, ShoppingCart, Building2, Calendar, Hash,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  usePurchaseOrder, useApprovePurchaseOrder, useReceivePurchaseOrder,
  useCancelPurchaseOrder, useDuplicatePurchaseOrder,
} from '@/features/purchase-orders/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { PurchaseOrderStatus } from '@/features/purchase-orders/types'

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:              { label: 'Brouillon',         color: '#64748b', bg: '#f1f5f9' },
  pending:            { label: 'En attente',         color: '#d97706', bg: '#fffbeb' },
  approved:           { label: 'Approuvé',           color: '#2D7DD2', bg: '#eff6ff' },
  ordered:            { label: 'Commandé',           color: '#0891b2', bg: '#ecfeff' },
  partially_received: { label: 'Partiellement reçu', color: '#d97706', bg: '#fffbeb' },
  received:           { label: 'Reçu',               color: '#16a34a', bg: '#f0fdf4' },
  billed:             { label: 'Facturé',            color: '#7c3aed', bg: '#faf5ff' },
  cancelled:          { label: 'Annulé',             color: '#94a3b8', bg: '#f8fafc' },
}

const TIMELINE: { status: PurchaseOrderStatus; label: string }[] = [
  { status: 'draft',    label: 'Brouillon' },
  { status: 'pending',  label: 'En attente' },
  { status: 'approved', label: 'Approuvé' },
  { status: 'ordered',  label: 'Commandé' },
  { status: 'received', label: 'Reçu' },
  { status: 'billed',   label: 'Facturé' },
]
const STATUS_ORDER: Record<PurchaseOrderStatus, number> = {
  draft: 0, pending: 1, approved: 2, ordered: 3,
  partially_received: 3.5, received: 4, billed: 5, cancelled: -1,
}

function ReceiveModal({ onConfirm, onClose, isPending }: {
  onConfirm: (data: { receivedDate: string; notes: string }) => void
  onClose: () => void
  isPending: boolean
}) {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]               = useState('')
  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Enregistrer la réception</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Date de réception</label>
          <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={inp}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Notes (facultatif)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Observations sur la livraison…"
            style={{ ...inp, resize: 'vertical' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
          <button onClick={() => onConfirm({ receivedDate, notes })} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.7 : 1 }}>
            <PackageCheck size={14} /> Confirmer réception
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { can } = usePermission()
  const { format } = useCurrency()
  const { id }    = use(params)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  const { data: po, isLoading } = usePurchaseOrder(id)
  const approveMutation  = useApprovePurchaseOrder()
  const receiveMutation  = useReceivePurchaseOrder()
  const cancelMutation   = useCancelPurchaseOrder()
  const duplicateMutation = useDuplicatePurchaseOrder()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 24, width: 240, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card animate-pulse" style={{ height: 80 }} />
        <div className="card animate-pulse" style={{ height: 300 }} />
      </div>
    )
  }

  if (!po) return null

  const cfg        = STATUS_CONFIG[po.status]
  const statusRank = STATUS_ORDER[po.status]
  const canEdit    = ['draft', 'pending'].includes(po.status)
  const canApprove = po.status === 'pending'
  const canReceive = ['approved', 'ordered', 'partially_received'].includes(po.status)
  const canCancel  = !['received', 'billed', 'cancelled'].includes(po.status)

  if (!can('purchase-order', 'read')) return <AccessDenied message="Vous n'avez pas accès aux bons de commande." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980, animation: 'page-in 0.2s ease' }}>
      {showReceiveModal && (
        <ReceiveModal
          isPending={receiveMutation.isPending}
          onClose={() => setShowReceiveModal(false)}
          onConfirm={data => { receiveMutation.mutate({ id, data }); setShowReceiveModal(false) }}
        />
      )}

      {/* Back + header */}
      <div>
        <Link href={ROUTES.PURCHASE_ORDERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Bons de commande
        </Link>
        <PageHeader
          title={po.number}
          description={`Bon de commande · ${formatDate(po.orderDate)}`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => duplicateMutation.mutate(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <Copy size={13} /> Dupliquer
              </button>
              {canEdit && (
                <Link href={`${ROUTES.PURCHASE_ORDERS}/${id}/edit`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <Pencil size={13} /> Modifier
                </Link>
              )}
              {canApprove && (
                <button onClick={() => approveMutation.mutate(id)} disabled={approveMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Approuver
                </button>
              )}
              {canReceive && (
                <button onClick={() => setShowReceiveModal(true)} disabled={receiveMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <PackageCheck size={13} /> Réceptionner
                </button>
              )}
              {canCancel && (
                <button onClick={() => cancelMutation.mutate(id)} disabled={cancelMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <XCircle size={13} /> Annuler
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* Status badge + timeline */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {cfg.label}
          </span>
          {po.status === 'cancelled' && (
            <span style={{ fontSize: 12.5, color: '#94a3b8', fontStyle: 'italic' }}>Ce bon de commande a été annulé</span>
          )}
        </div>
        {po.status !== 'cancelled' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {TIMELINE.map(({ status, label }, i) => {
              const rank = STATUS_ORDER[status]
              const done = statusRank >= rank
              const current = po.status === status || (status === 'received' && po.status === 'partially_received')
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'center', flex: i < TIMELINE.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: done ? 'var(--primary)' : 'var(--surface-2)', border: `2px solid ${done ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      {done && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: current ? 700 : 500, color: current ? 'var(--primary)' : done ? 'var(--text-2)' : 'var(--text-3)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                  {i < TIMELINE.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: done && STATUS_ORDER[TIMELINE[i + 1].status] <= statusRank ? 'var(--primary)' : 'var(--border)', margin: '0 4px', marginTop: -16, transition: 'background 0.2s' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Meta info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Supplier */}
        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Fournisseur</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <Link href={`${ROUTES.SUPPLIERS}/${po.supplierId}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textDecoration: 'none', fontFamily: 'var(--font-display)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-1)')}>
                {po.supplier.name}
              </Link>
              {po.supplier.email && <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{po.supplier.email}</p>}
              {po.supplier.phone && <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{po.supplier.phone}</p>}
            </div>
          </div>
        </div>

        {/* Dates & details */}
        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Détails</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: Calendar, label: 'Date commande', value: formatDate(po.orderDate) },
              { icon: Calendar, label: 'Livraison prévue', value: po.expectedDate ? formatDate(po.expectedDate) : '—' },
              { icon: Calendar, label: 'Date réception', value: po.receivedDate ? formatDate(po.receivedDate) : '—' },
              { icon: Hash, label: 'Référence', value: po.reference ?? '—' },
              { icon: Clock, label: 'Délai paiement', value: `${po.paymentTermDays} jours` },
            ].map(({ icon: Icon, label: lbl, value }) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', width: 120 }}>{lbl}</span>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Lignes de commande</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Désignation', 'Unité', 'Qté commandée', 'Qté reçue', 'P.U. HT', 'TVA', 'Total TTC'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Désignation' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line, i) => (
                <tr key={line.id} style={{ borderBottom: i < po.lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-1)', fontWeight: 500 }}>
                    <div>{line.designation}</div>
                    {line.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{line.description}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-2)' }}>{line.unit}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-1)', fontWeight: 600 }}>{line.quantity}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: line.receivedQty > 0 ? '#16a34a' : 'var(--text-3)', fontWeight: 600 }}>{line.receivedQty}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{new Intl.NumberFormat('fr-FR').format(line.unitPriceHt)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-3)' }}>{line.taxRate}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)' }}>{new Intl.NumberFormat('fr-FR').format(Math.round(line.totalTtc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totaux */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Sous-total HT</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(po.subtotalHt)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>TVA</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(po.totalTax)}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(po.totalTtc)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Notes</h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{po.notes}</p>
        </div>
      )}

      {/* Meta footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', padding: '4px 2px' }}>
        <span>Créé par {po.createdBy.firstName} {po.createdBy.lastName} · {formatDate(po.createdAt)}</span>
        {po.approvedBy && (
          <span>Approuvé par {po.approvedBy.firstName} {po.approvedBy.lastName} · {po.approvedAt ? formatDate(po.approvedAt) : ''}</span>
        )}
      </div>
    </div>
  )
}
