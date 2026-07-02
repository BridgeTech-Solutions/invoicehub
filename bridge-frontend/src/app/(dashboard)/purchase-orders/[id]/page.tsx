'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  ChevronLeft, CheckCircle2, XCircle, PackageCheck, Copy,
  Pencil, Download, Calendar, Hash, Clock, Building2,
  History, CheckCircle, PenLine, Shield, AlertTriangle, FileText,
  Send, Loader2,
} from 'lucide-react'
import { submitButtonState } from '@/features/approvals/effectiveStatus'
import {
  usePurchaseOrder, useSendPurchaseOrder, useConfirmPurchaseOrder,
  useReceivePurchaseOrder, useClosePurchaseOrder, useCancelPurchaseOrder,
  useDuplicatePurchaseOrder, useDownloadPurchaseOrderPdf,
  useCreateSupplierInvoiceFromBC, useLinkedSupplierInvoices,
} from '@/features/purchase-orders/hooks'
import { ReceiveDrawer } from '@/features/purchase-orders/components/ReceiveDrawer'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { PurchaseOrderStatus, PurchaseOrder, LinkedSupplierInvoice } from '@/features/purchase-orders/types'

// ─── Status config ────────────────────────────────────────────────

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:              { label: 'Brouillon',          color: '#64748b', bg: 'rgba(148,163,184,0.15)' },
  sent:               { label: 'Envoyé',             color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
  confirmed:          { label: 'Confirmé',           color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)'   },
  partially_received: { label: 'Partiellement reçu', color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
  received:           { label: 'Réceptionné',        color: '#16a34a', bg: 'rgba(16,163,74,0.1)'    },
  invoiced:           { label: 'Facturé',            color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
  cancelled:          { label: 'Annulé',             color: '#dc2626', bg: 'rgba(239,68,68,0.1)'    },
  closed:             { label: 'Clôturé',            color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'   },
}

const TIMELINE: { status: PurchaseOrderStatus; label: string }[] = [
  { status: 'draft',     label: 'Brouillon'   },
  { status: 'sent',      label: 'Envoyé'      },
  { status: 'confirmed', label: 'Confirmé'    },
  { status: 'received',  label: 'Réceptionné' },
  { status: 'invoiced',  label: 'Facturé'     },
  { status: 'closed',    label: 'Clôturé'     },
]

const STATUS_ORDER: Record<PurchaseOrderStatus, number> = {
  draft: 0, sent: 1, confirmed: 2,
  partially_received: 2.5, received: 3, invoiced: 3.5, closed: 4, cancelled: -1,
}

// ─── Reception progress ───────────────────────────────────────────

function ReceptionProgress({ po }: { po: PurchaseOrder }) {
  const totalOrdered  = po.lines.reduce((s, l) => s + Number(l.quantityOrdered),  0)
  const totalReceived = po.lines.reduce((s, l) => s + Number(l.quantityReceived), 0)
  const pct = totalOrdered > 0 ? Math.min(100, Math.round(totalReceived / totalOrdered * 100)) : 0

  return (
    <div style={{ padding: '16px 18px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Réception</span>
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct === 100 ? '#10b981' : 'var(--primary)' }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', borderRadius: 3, background: pct === 100 ? '#10b981' : 'var(--primary)', width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Reçu</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)', margin: 0 }}>{totalReceived}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Commandé</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', margin: 0 }}>{totalOrdered}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Status timeline (sidebar) ────────────────────────────────────

const HISTORY_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  draft:              { label: 'Brouillon créé',    color: '#64748b', Icon: PenLine      },
  sent:               { label: 'Envoyé',            color: '#d97706', Icon: Shield       },
  confirmed:          { label: 'Confirmé',          color: '#2D7DD2', Icon: CheckCircle2 },
  partially_received: { label: 'Partiellement reçu',color: '#d97706', Icon: PackageCheck },
  received:           { label: 'Réceptionné',       color: '#16a34a', Icon: PackageCheck },
  invoiced:           { label: 'Facturé',           color: '#7c3aed', Icon: FileText     },
  closed:             { label: 'Clôturé',           color: '#7c3aed', Icon: CheckCircle  },
  cancelled:          { label: 'Annulé',            color: '#dc2626', Icon: XCircle      },
}

function StatusHistory({ history }: { history: Array<{ id: string; newStatus: string; changedAt: string; changedBy?: { firstName: string; lastName: string } | null }> }) {
  if (!history || history.length === 0) return (
    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, textAlign: 'center', padding: '8px 0' }}>Aucun événement</p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {history.map((h, idx) => {
        const meta   = HISTORY_META[h.newStatus] ?? { label: h.newStatus, color: '#64748b', Icon: History }
        const { Icon } = meta
        const isLast = idx === history.length - 1
        const who    = h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : 'Système'
        const when   = new Date(h.changedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        return (
          <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative' }}>
            {!isLast && <div style={{ position: 'absolute', left: 13, top: 28, width: 2, height: 'calc(100% - 4px)', background: 'var(--border)', zIndex: 0 }} />}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${meta.color}18`, border: `1.5px solid ${meta.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
              <Icon size={13} style={{ color: meta.color }} />
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: meta.color, fontFamily: 'var(--font-display)' }}>{meta.label}</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{who}</span>
                <span style={{ fontSize: 11.5, color: 'var(--border)' }}>·</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{when}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Approval warning ─────────────────────────────────────────────

function ApprovalBanner({ po }: { po: PurchaseOrder }) {
  if (!po.approvalRequest || po.approvalRequest.status === 'approved') return null
  const colors: Record<string, { bg: string; color: string; label: string }> = {
    pending:  { bg: 'rgba(245,158,11,0.08)', color: '#d97706', label: `Approbation en attente (étape ${po.approvalRequest.currentStep}/${po.approvalRequest.totalSteps})` },
    rejected: { bg: 'rgba(239,68,68,0.08)',  color: '#dc2626', label: 'Approbation rejetée' },
    expired:  { bg: 'rgba(148,163,184,0.1)', color: '#64748b', label: 'Demande d\'approbation expirée' },
  }
  const cfg = colors[po.approvalRequest.status] ?? colors.pending
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: cfg.bg, border: `1px solid ${cfg.color}33`, borderRadius: 'var(--radius-md)', marginTop: 14 }}>
      <AlertTriangle size={14} style={{ color: cfg.color, flexShrink: 0 }} />
      <p style={{ fontSize: 13, color: cfg.color, fontWeight: 600, fontFamily: 'var(--font-display)', margin: 0 }}>{cfg.label}</p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 28, width: 300, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { can }    = usePermission()
  const { format } = useCurrency()
  const { id }     = use(params)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  const { data: po, isLoading } = usePurchaseOrder(id)
  const sendMutation      = useSendPurchaseOrder()
  const confirmMutation   = useConfirmPurchaseOrder()
  const receiveMutation   = useReceivePurchaseOrder()
  const closeMutation     = useClosePurchaseOrder()
  const cancelMutation    = useCancelPurchaseOrder()
  const duplicateMutation = useDuplicatePurchaseOrder()
  const pdfMutation       = useDownloadPurchaseOrderPdf()
  const createFFMutation  = useCreateSupplierInvoiceFromBC()
  const { data: linkedFFs = [] } = useLinkedSupplierInvoices(id)

  if (isLoading) return <Skeleton />
  if (!po) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Bon de commande introuvable</p>
      <Link href={ROUTES.PURCHASE_ORDERS} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>← Retour aux bons de commande</Link>
    </div>
  )

  if (!can('purchase-order', 'read')) return <AccessDenied message="Vous n'avez pas accès aux bons de commande." />

  const cfg        = STATUS_CONFIG[po.status]
  const statusRank = STATUS_ORDER[po.status]
  const canEdit    = ['draft', 'sent'].includes(po.status)
  const canSend    = po.status === 'draft'
  // Bouton « Envoyer » : honnête sur la soumission pour validation si un workflow s'applique.
  const sendBtn    = submitButtonState({
    isPending:   po.approvalRequest?.status === 'pending',
    wasRejected: po.approvalRequest?.status === 'rejected',
    willSubmit:  !!po.willRequireApproval,
    directLabel: 'Envoyer',
  })
  const canConfirm = po.status === 'sent'
  const canReceive  = ['confirmed', 'partially_received'].includes(po.status)
  const canCreateFF = ['received', 'partially_received'].includes(po.status) && !po.fullyInvoiced
  const canClose    = ['received', 'partially_received', 'invoiced'].includes(po.status)
  const canCancel   = !['received', 'invoiced', 'closed', 'cancelled'].includes(po.status)

  const statusHistory = (po as any).statusHistory as Array<{ id: string; newStatus: string; changedAt: string; changedBy?: { firstName: string; lastName: string } | null }> | undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {showReceiveModal && (
        <ReceiveDrawer
          po={po}
          isPending={receiveMutation.isPending}
          onClose={() => setShowReceiveModal(false)}
          onConfirm={({ lines, receivedDate, notes }) => {
            receiveMutation.mutate(
              { id, data: { lines, receivedDate, notes } },
              { onSuccess: () => setShowReceiveModal(false) },
            )
          }}
        />
      )}

      {/* Back */}
      <Link href={ROUTES.PURCHASE_ORDERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
        <ChevronLeft size={14} /> Bons de commande
      </Link>

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Left: number + status + dates */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {po.number}
              </h1>
              <span style={{ ...cfg, fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '5px 14px', borderRadius: 20, textTransform: 'uppercase' }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                <Calendar size={13} /> {formatDate(po.issueDate)}
              </div>
              {po.expectedDeliveryDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <Clock size={13} /> Livraison prévue {formatDate(po.expectedDeliveryDate)}
                </div>
              )}
              {po.reference && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <Hash size={13} /> Réf. {po.reference}
                </div>
              )}
            </div>
          </div>
          {/* Right: total */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total TTC</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0 }}>{format(Number(po.totalTtc))}</p>
          </div>
        </div>

        {/* Approval warning */}
        <ApprovalBanner po={po} />

        {/* Actions */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => pdfMutation.mutate({ id, filename: `${po.number.replace(/\//g, '-')}.pdf` })}
            disabled={pdfMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: pdfMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: pdfMutation.isPending ? 0.65 : 1 }}>
            <Download size={13} /> PDF
          </button>
          <button onClick={() => duplicateMutation.mutate(id)} disabled={duplicateMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <Copy size={13} /> Dupliquer
          </button>
          {canEdit && (
            <Link href={`${ROUTES.PURCHASE_ORDERS}/${id}/edit`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <Pencil size={13} /> Modifier
            </Link>
          )}
          {canSend && (
            <button onClick={() => sendMutation.mutate(id)} disabled={sendMutation.isPending || sendBtn.disabled}
              title={sendBtn.disabled ? "En attente d'approbation" : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: sendBtn.disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: sendBtn.disabled ? 0.5 : 1 }}>
              {sendMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : sendBtn.variant === 'submit' ? <Send size={13} /> : <CheckCircle2 size={13} />} {sendBtn.label}
            </button>
          )}
          {canConfirm && (
            <button onClick={() => confirmMutation.mutate(id)} disabled={confirmMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#0891b2', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <CheckCircle2 size={13} /> Confirmer
            </button>
          )}
          {canReceive && (
            <button onClick={() => setShowReceiveModal(true)} disabled={receiveMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <PackageCheck size={13} /> Réceptionner
            </button>
          )}
          {canCreateFF && (
            <button
              onClick={() => createFFMutation.mutate(id)}
              disabled={createFFMutation.isPending}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                borderRadius:'var(--radius-md)', background:'#7c3aed', color:'#fff',
                border:'none', cursor: createFFMutation.isPending ? 'not-allowed' : 'pointer',
                fontSize:13, fontFamily:'var(--font-display)', fontWeight:600,
                opacity: createFFMutation.isPending ? 0.65 : 1 }}>
              <FileText size={13} /> Créer facture fournisseur
            </button>
          )}
          {canClose && (
            <button onClick={() => closeMutation.mutate(id)} disabled={closeMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <CheckCircle2 size={13} /> Clôturer
            </button>
          )}
          {canCancel && (
            <button onClick={() => cancelMutation.mutate(id)} disabled={cancelMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <XCircle size={13} /> Annuler
            </button>
          )}
        </div>
      </div>

      {/* Status stepper */}
      {po.status !== 'cancelled' && (
        <div className="card" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {TIMELINE.map(({ status, label }, i) => {
              const rank    = STATUS_ORDER[status]
              const done    = statusRank >= rank
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
        </div>
      )}

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lines table */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Lignes de commande
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    {['#', 'Désignation', 'Unité', 'Qté cmdée', 'Qté reçue', 'P.U. HT', 'TVA', 'Total HT'].map((h, i) => (
                      <th key={h} scope="col" style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i >= 2 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((line, i) => {
                    const received = Number(line.quantityReceived)
                    const ordered  = Number(line.quantityOrdered)
                    const full     = received >= ordered
                    return (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 10px', fontSize: 12, color: 'var(--text-3)', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '11px 10px', minWidth: 180 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{line.designation}</p>
                          {line.description && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.4 }}>{line.description}</p>}
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)' }}>{line.unit ?? '—'}</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{ordered}</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: full ? '#10b981' : received > 0 ? '#d97706' : 'var(--text-3)' }}>{received}</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {new Intl.NumberFormat('fr-FR').format(Number(line.unitPriceHt))}
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{Number(line.taxRate)}%</td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {new Intl.NumberFormat('fr-FR').format(Math.round(Number(line.netHt)))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ minWidth: 300, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Sous-total HT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{format(Number(po.subtotalHt))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>TVA</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{format(Number(po.totalTax))}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(Number(po.totalTtc))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & conditions */}
          {(po.notes || (po as any).paymentConditions) && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Conditions & Notes
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {(po as any).paymentConditions && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Conditions de paiement</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{(po as any).paymentConditions}</p>
                  </div>
                )}
                {po.notes && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>{po.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Factures fournisseurs liées */}
          {linkedFFs.length > 0 && (
            <div className="card" style={{ padding:'16px 18px' }}>
              <p style={{ fontSize:11, fontFamily:'var(--font-display)', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-3)', marginBottom:10 }}>
                Factures fournisseurs liées
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {linkedFFs.map((ff: LinkedSupplierInvoice) => (
                  <Link key={ff.id} href={`/supplier-invoices/${ff.id}`}
                    style={{ display:'flex', flexDirection:'column', gap:3, padding:'10px 12px',
                      borderRadius:'var(--radius-md)', background:'var(--surface)',
                      border:'1px solid var(--border)', textDecoration:'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12.5, fontWeight:700, color:'var(--primary)',
                        fontFamily:'var(--font-mono)' }}>{ff.number}</span>
                      <span style={{ fontSize:11, padding:'2px 7px', borderRadius:99,
                        background:'rgba(124,58,237,0.1)', color:'#7c3aed',
                        fontFamily:'var(--font-display)', fontWeight:600 }}>
                        {ff.status}
                      </span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-3)' }}>
                      <span>{new Date(ff.invoiceDate).toLocaleDateString('fr-FR')}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--text-1)' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(ff.totalTtc))} XAF
                      </span>
                    </div>
                    {ff.balanceDue > 0 && (
                      <span style={{ fontSize:11, color:'#dc2626', fontWeight:600 }}>
                        Solde dû : {new Intl.NumberFormat('fr-FR').format(Math.round(ff.balanceDue))} XAF
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Reception progress */}
          {!['draft', 'cancelled'].includes(po.status) && (
            <ReceptionProgress po={po} />
          )}

          {/* Supplier */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Fournisseur</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {getInitials(po.supplier.name)}
              </span>
              <div>
                <Link href={`${ROUTES.SUPPLIERS}/${po.supplierId}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{po.supplier.name}</p>
                </Link>
                {po.supplier.email && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{po.supplier.email}</p>}
                {po.supplier.phone && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>{po.supplier.phone}</p>}
              </div>
            </div>
            <Link href={`${ROUTES.SUPPLIERS}/${po.supplierId}`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
              Voir la fiche fournisseur →
            </Link>
          </div>

          {/* Meta info */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Informations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([
                ['Créé par',         `${po.createdBy.firstName} ${po.createdBy.lastName}`],
                ['Créé le',          formatDate(po.createdAt)],
                ['Modifié le',       formatDate(po.updatedAt)],
                ...(po.approvedBy ? [['Approuvé par', `${po.approvedBy.firstName} ${po.approvedBy.lastName}`]] : []),
                ...(po.approvedAt ? [['Approuvé le',  formatDate(po.approvedAt)]] : []),
                ...((po as any).deliveredAt ? [['Réceptionné le', formatDate((po as any).deliveredAt)]] : []),
                ...(po.paymentTermDays != null ? [['Délai paiement', `${po.paymentTermDays} jours`]] : []),
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{l}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, maxWidth: 150, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status history */}
          {statusHistory && statusHistory.length > 0 && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                <History size={13} style={{ color: 'var(--text-3)' }} />
                <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                  Cycle de vie
                </p>
              </div>
              <StatusHistory history={statusHistory} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
