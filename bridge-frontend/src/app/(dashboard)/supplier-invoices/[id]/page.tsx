'use client'

import { use, useState, useRef } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, CheckCircle2, XCircle, Banknote, Building2, Calendar,
  Hash, Loader2, Clock, FileText, History, PenLine, CheckCircle, AlertTriangle,
  Paperclip, Upload, Download, Trash2, Send,
} from 'lucide-react'
import { submitButtonState } from '@/features/approvals/effectiveStatus'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  useSupplierInvoice, useValidateSupplierInvoice,
  useDeleteSupplierInvoice, useDisputeSupplierInvoice,
  useUploadSupplierInvoiceAttachment, useDownloadSupplierInvoiceAttachment, useDeleteSupplierInvoiceAttachment,
} from '@/features/supplier-invoices/hooks'
import { SupplierPaymentDrawer } from '@/features/supplier-invoices/components/SupplierPaymentDrawer'
import { ApprovalBanner } from '@/features/approvals/components/ApprovalBanner'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES, PAYMENT_METHODS } from '@/lib/constants'
import type { SupplierInvoiceStatus } from '@/features/supplier-invoices/types'

// ─── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<SupplierInvoiceStatus, { label: string; color: string; bg: string }> = {
  received:       { label: 'Reçue',        color: '#2563eb', bg: 'rgba(59,130,246,0.1)'   },
  validated:      { label: 'Validée',      color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)'   },
  partially_paid: { label: 'Part. payée',  color: '#d97706', bg: 'rgba(245,158,11,0.1)'   },
  paid:           { label: 'Payée',        color: '#16a34a', bg: 'rgba(16,163,74,0.1)'    },
  disputed:       { label: 'Contestée',    color: '#dc2626', bg: 'rgba(239,68,68,0.1)'    },
  cancelled:      { label: 'Annulée',      color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
}

// ─── Status history meta ──────────────────────────────────────

const HISTORY_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  received:       { label: 'Reçue',       color: '#2563eb', Icon: FileText     },
  validated:      { label: 'Validée',     color: '#2D7DD2', Icon: CheckCircle2 },
  partially_paid: { label: 'Paiement partiel', color: '#d97706', Icon: Banknote },
  paid:           { label: 'Payée',       color: '#16a34a', Icon: CheckCircle  },
  disputed:       { label: 'Contestée',   color: '#dc2626', Icon: AlertTriangle },
  cancelled:      { label: 'Annulée',     color: '#94a3b8', Icon: XCircle      },
}

// ─── Payment progress bar ─────────────────────────────────────

function PaymentProgress({ totalTtc, amountPaid, balanceDue }: { totalTtc: number; amountPaid: number; balanceDue: number }) {
  const { format } = useCurrency()
  const pct = totalTtc > 0 ? Math.min(100, Math.round(amountPaid / totalTtc * 100)) : 0
  return (
    <div style={{ padding: '16px 18px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Règlement</span>
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct === 100 ? '#10b981' : 'var(--primary)' }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', borderRadius: 3, background: pct === 100 ? '#10b981' : 'var(--primary)', width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Payé</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)', margin: 0 }}>{format(amountPaid)}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Solde dû</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: balanceDue > 0 ? '#ef4444' : '#10b981', fontFamily: 'var(--font-mono)', margin: 0 }}>{format(balanceDue)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Status timeline ──────────────────────────────────────────

function StatusHistory({ history }: { history: Array<{ id: string; newStatus: string; changedAt: string; changedBy?: { firstName: string; lastName: string } | null }> }) {
  if (!history || history.length === 0) return (
    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, textAlign: 'center', padding: '8px 0' }}>Aucun événement</p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {history.map((h, idx) => {
        const meta   = HISTORY_META[h.newStatus] ?? { label: h.newStatus, color: '#64748b', Icon: PenLine }
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

// ─── Dispute modal ────────────────────────────────────────────

function DisputeModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const disputeMutation = useDisputeSupplierInvoice()
  const [reason, setReason] = useState('')
  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 460, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ color: '#dc2626' }} /> Contester la facture
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; disputeMutation.mutate({ id: invoiceId, reason: reason.trim() }, { onSuccess: onClose }) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Motif de la contestation</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} required autoFocus placeholder="Décrivez le motif du litige…" style={{ ...inp, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={disputeMutation.isPending || !reason.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', cursor: (disputeMutation.isPending || !reason.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: (disputeMutation.isPending || !reason.trim()) ? 0.7 : 1 }}>
              {disputeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />} Contester
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 28, width: 300, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function SupplierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { can }    = usePermission()
  const { format } = useCurrency()
  const { id }     = use(params)
  const [showPayModal, setShowPayModal]         = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)

  const { data: inv, isLoading } = useSupplierInvoice(id)
  const validateMutation = useValidateSupplierInvoice()
  const deleteMutation   = useDeleteSupplierInvoice()
  const uploadAttachment   = useUploadSupplierInvoiceAttachment(id)
  const downloadAttachment = useDownloadSupplierInvoiceAttachment()
  const deleteAttachment   = useDeleteSupplierInvoiceAttachment(id)
  const fileInputRef       = useRef<HTMLInputElement>(null)

  if (isLoading) return <Skeleton />
  if (!inv) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Facture introuvable</p>
      <Link href={ROUTES.SUPPLIER_INVOICES} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        ← Retour aux factures
      </Link>
    </div>
  )
  if (!can('supplier', 'read')) return <AccessDenied message="Vous n'avez pas accès aux factures fournisseurs." />

  const cfg         = STATUS_CONFIG[inv.status]
  const canValidate = inv.status === 'received'
  // Pré-requis de validation — miroir du garde-fou backend (numéro fournisseur
  // d'origine + document scanné obligatoires avant comptabilisation OHADA).
  const missingSupplierRef = !inv.supplierInvoiceNumber || inv.supplierInvoiceNumber.trim() === ''
  const missingAttachment  = !inv.attachmentPath
  const validateBlocked    = canValidate && (missingSupplierRef || missingAttachment)
  // « Valider » honnête : soumission pour validation si un workflow d'approbation s'applique.
  const validateBtn        = submitButtonState({
    isPending:   inv.approvalRequest?.status === 'pending',
    wasRejected: inv.approvalRequest?.status === 'rejected',
    willSubmit:  !!inv.willRequireApproval,
    directLabel: 'Valider',
  })
  const canPay      = ['validated', 'partially_paid'].includes(inv.status)
  const canDispute  = ['received', 'validated'].includes(inv.status)
  const canDelete   = inv.status === 'received'
  const isOverdue   = inv.dueDate && !['paid', 'cancelled'].includes(inv.status) && new Date(inv.dueDate) < new Date()

  const statusHistory = (inv as any).statusHistory as Array<{ id: string; newStatus: string; changedAt: string; changedBy?: { firstName: string; lastName: string } | null }> | undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {showPayModal && (
        <SupplierPaymentDrawer invoice={inv} onClose={() => setShowPayModal(false)} />
      )}

      {showDisputeModal && (
        <DisputeModal invoiceId={id} onClose={() => setShowDisputeModal(false)} />
      )}

      {/* Back */}
      <Link href={ROUTES.SUPPLIER_INVOICES}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
        <ChevronLeft size={14} /> Factures fournisseurs
      </Link>

      {/* Statut d'approbation (workflow) */}
      <ApprovalBanner request={inv.approvalRequest ?? null} />

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Left: number + badges + dates */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {inv.number}
              </h1>
              <span style={{ ...cfg, fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '5px 14px', borderRadius: 20, textTransform: 'uppercase' }}>
                {cfg.label}
              </span>
              {inv.supplierInvoiceNumber && (
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  Réf. {inv.supplierInvoiceNumber}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                <Calendar size={13} /> {formatDate(inv.invoiceDate)}
              </div>
              {inv.dueDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                  <Clock size={13} /> Échéance {formatDate(inv.dueDate)}
                  {isOverdue && <AlertTriangle size={12} style={{ color: '#ef4444' }} />}
                </div>
              )}
              {inv.purchaseOrderNumber && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <Hash size={13} />
                  {inv.purchaseOrderId
                    ? <Link href={`${ROUTES.PURCHASE_ORDERS}/${inv.purchaseOrderId}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>{inv.purchaseOrderNumber}</Link>
                    : <span style={{ fontFamily: 'var(--font-mono)' }}>{inv.purchaseOrderNumber}</span>
                  }
                </div>
              )}
            </div>
          </div>
          {/* Right: total */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total TTC</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0 }}>{format(inv.totalTtc)}</p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canValidate && can('supplier', 'update') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => validateMutation.mutate(id)}
                disabled={validateMutation.isPending || validateBlocked || validateBtn.disabled}
                title={validateBlocked
                  ? `Avant validation : ${[missingSupplierRef && 'numéro du fournisseur', missingAttachment && 'document original'].filter(Boolean).join(' + ')}`
                  : validateBtn.disabled ? "En attente d'approbation" : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: validateBlocked ? 'var(--surface-2)' : 'var(--primary)',
                  color: validateBlocked ? 'var(--text-3)' : '#fff',
                  border: validateBlocked ? '1.5px solid var(--border)' : 'none',
                  cursor: validateBlocked ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
                  opacity: validateMutation.isPending ? 0.7 : 1,
                }}>
                {validateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : validateBtn.variant === 'submit' ? <Send size={13} /> : <CheckCircle2 size={13} />} {validateBtn.label}
              </button>
              {validateBlocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#b45309' }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                  <span>
                    Requis pour valider :{' '}
                    {[missingSupplierRef && 'n° fournisseur', missingAttachment && 'document original']
                      .filter(Boolean).join(' + ')}
                  </span>
                </div>
              )}
            </div>
          )}
          {canPay && can('supplier', 'update') && (
            <button onClick={() => setShowPayModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <Banknote size={13} /> Enregistrer paiement
            </button>
          )}
          {canDispute && can('supplier', 'update') && (
            <button onClick={() => setShowDisputeModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <AlertTriangle size={13} /> Contester
            </button>
          )}
          {canDelete && can('supplier', 'update') && (
            <button onClick={() => { if (confirm('Supprimer cette facture ?')) deleteMutation.mutate(id) }} disabled={deleteMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <XCircle size={13} /> Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lines */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Lignes
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    {['#', 'Désignation', 'Unité', 'Qté', 'P.U. HT', 'TVA', 'Total HT'].map((h, i) => (
                      <th key={h} scope="col" style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((line, i) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 10px', fontSize: 12, color: 'var(--text-3)', width: 32 }}>{i + 1}</td>
                      <td style={{ padding: '11px 10px', minWidth: 180 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{line.designation}</p>
                        {line.description && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.4 }}>{line.description}</p>}
                      </td>
                      <td style={{ padding: '11px 10px', fontSize: 12.5, color: 'var(--text-3)' }}>{line.unit ?? '—'}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{Number(line.quantity)}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Number(line.unitPriceHt))}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{Number(line.taxRate)}%</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(Number(line.netHt)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ minWidth: 300, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Sous-total HT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{format(inv.subtotalHt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>TVA</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{format(inv.totalTax)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(inv.totalTtc)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payments history */}
          {inv.payments.length > 0 && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Paiements effectués
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Mode', 'Référence', 'Montant'].map((h, i) => (
                      <th key={h} scope="col" style={{ padding: '7px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i === 3 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < inv.payments.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)' }}>{formatDate(p.paymentDate)}</td>
                      <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)' }}>{PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method}</td>
                      <td style={{ padding: '10px', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{p.reference ?? '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                        {format(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {inv.notes && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>
                Notes
              </p>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{inv.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Payment progress */}
          {!['received', 'cancelled'].includes(inv.status) && (
            <PaymentProgress totalTtc={inv.totalTtc} amountPaid={inv.amountPaid} balanceDue={inv.balanceDue} />
          )}

          {/* Document fournisseur (pièce jointe — la vraie facture reçue) */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Document fournisseur
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment.mutate(f); e.target.value = '' }}
            />
            {inv.attachmentPath ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'rgba(16,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Paperclip size={15} style={{ color: '#16a34a' }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Document joint</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '1px 0 0' }}>Facture originale du fournisseur</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => downloadAttachment.mutate({ id, filename: `document-${inv.supplierInvoiceNumber || inv.number}`.replace(/\//g, '-') })}
                    disabled={downloadAttachment.isPending}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {downloadAttachment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Télécharger
                  </button>
                  {can('supplier', 'update') && (
                    <button
                      onClick={() => { if (confirm('Supprimer le document joint ?')) deleteAttachment.mutate() }}
                      disabled={deleteAttachment.isPending}
                      aria-label="Supprimer le document"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                      {deleteAttachment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Aucun document joint. Téléversez la facture originale reçue du fournisseur (PDF, image).
                </p>
                {can('supplier', 'update') && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAttachment.isPending}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--border)', background: 'var(--surface-2)', color: 'var(--primary)', cursor: uploadAttachment.isPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {uploadAttachment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploadAttachment.isPending ? 'Envoi…' : 'Ajouter le document'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Fournisseur */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Fournisseur</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {getInitials(inv.supplier.name)}
              </span>
              <div>
                <Link href={`${ROUTES.SUPPLIERS}/${inv.supplierId}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{inv.supplier.name}</p>
                </Link>
                {inv.supplier.email && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{inv.supplier.email}</p>}
                {inv.supplier.phone && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>{inv.supplier.phone}</p>}
              </div>
            </div>
            <Link href={`${ROUTES.SUPPLIERS}/${inv.supplierId}`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
              Voir la fiche fournisseur →
            </Link>
          </div>

          {/* Meta info */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Informations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([
                ['Créé par',       `${inv.createdBy.firstName} ${inv.createdBy.lastName}`],
                ['Créé le',        formatDate(inv.createdAt)],
                ['Modifié le',     formatDate(inv.updatedAt)],
                ['Date facture',   formatDate(inv.invoiceDate)],
                ...(inv.dueDate ? [['Échéance', formatDate(inv.dueDate)]] : []),
                ...(inv.accountingAccount ? [['Compte SYSCO', inv.accountingAccount]] : []),
                ...(inv.purchaseOrderNumber ? [['Bon de commande', inv.purchaseOrderNumber]] : []),
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
