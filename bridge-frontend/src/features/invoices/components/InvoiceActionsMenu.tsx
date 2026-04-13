'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap, XCircle, Copy, Trash2, FileDown, Loader2, Pencil,
  CreditCard, FileX, AlertTriangle,
} from 'lucide-react'
import {
  useIssueInvoice, useCancelInvoice, useDuplicateInvoice,
  useDownloadInvoicePdf, useCreateAvoir, useDeleteInvoice,
} from '../hooks'
import { PaymentModal }  from './PaymentModal'
import { CancelModal }   from './CancelModal'
import { AvoirModal }    from './AvoirModal'
import type { Invoice }  from '../types'
import { ROUTES }        from '@/lib/constants'

// ─── Modal de confirmation de suppression ─────────────────────────

function ConfirmDeleteModal({
  number, isPending, onConfirm, onCancel,
}: { number: string; isPending: boolean; onConfirm: () => void; onCancel: () => void }) {
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
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} aria-hidden style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, fontFamily: 'var(--font-display)', margin: '0 0 6px' }}>
              Supprimer la facture
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Voulez-vous supprimer définitivement <strong>{number}</strong> ? Cette action est irréversible.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', background: '#ef4444', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1 }}>
            {isPending ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface InvoiceActionsMenuProps {
  invoice: Invoice
}

export function InvoiceActionsMenu({ invoice }: InvoiceActionsMenuProps) {
  const router = useRouter()
  const [showPayment, setShowPayment] = useState(false)
  const [showCancel,  setShowCancel]  = useState(false)
  const [showAvoir,   setShowAvoir]   = useState(false)
  const [showDelete,  setShowDelete]  = useState(false)

  const issueMutation     = useIssueInvoice()
  const duplicateMutation = useDuplicateInvoice()
  const deleteMutation    = useDeleteInvoice()
  const pdfMutation       = useDownloadInvoicePdf()

  const { id, status, type, number } = invoice

  const btnPrimary: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 16px', borderRadius: 'var(--radius-md)',
    background: 'var(--primary)', color: '#fff', border: 'none',
    cursor: 'pointer', fontSize: 13.5,
    fontFamily: 'var(--font-display)', fontWeight: 600,
    boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
  }
  const btnSecondary: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5,
    fontFamily: 'var(--font-display)', fontWeight: 500,
  }
  const btnDanger: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)',
    color: '#ef4444', cursor: 'pointer', fontSize: 13.5,
    fontFamily: 'var(--font-display)', fontWeight: 500,
  }
  const btnGreen: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 16px', borderRadius: 'var(--radius-md)',
    background: '#10b981', color: '#fff', border: 'none',
    cursor: 'pointer', fontSize: 13.5,
    fontFamily: 'var(--font-display)', fontWeight: 600,
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
  }
  const btnPurple: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.05)',
    color: '#7c3aed', cursor: 'pointer', fontSize: 13.5,
    fontFamily: 'var(--font-display)', fontWeight: 500,
  }

  const isLoading = issueMutation.isPending || duplicateMutation.isPending || pdfMutation.isPending

  const canPay    = ['issued', 'partially_paid', 'overdue'].includes(status)
  const canCancel = ['issued', 'partially_paid', 'overdue'].includes(status)
  const canEdit   = status === 'draft'
  const canIssue  = status === 'draft'
  // Avoir : tous les statuts acceptés par le backend (hors draft/cancelled/avoir)
  const canAvoir  = ['issued', 'partially_paid', 'paid', 'overdue'].includes(status)

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* PDF — always */}
        <button
          style={btnSecondary}
          disabled={isLoading}
          onClick={() => pdfMutation.mutate({ id, filename: `${number.replace(/\//g, '-')}.pdf` })}
        >
          {pdfMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          Télécharger PDF
        </button>

        {/* Duplicate — always */}
        <button
          style={btnSecondary}
          disabled={isLoading}
          onClick={() => duplicateMutation.mutate(id)}
        >
          {duplicateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
          Dupliquer
        </button>

        {/* Edit — draft only */}
        {canEdit && (
          <button
            style={btnSecondary}
            onClick={() => router.push(`${ROUTES.INVOICES}/${id}?mode=edit`)}
          >
            <Pencil size={14} /> Modifier
          </button>
        )}

        {/* Issue — draft only */}
        {canIssue && (
          <button
            style={btnPrimary}
            disabled={isLoading || issueMutation.isPending}
            onClick={() => issueMutation.mutate(id)}
          >
            {issueMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Émettre la facture
          </button>
        )}

        {/* Payment — issued / partially_paid / overdue */}
        {canPay && (
          <button style={btnGreen} onClick={() => setShowPayment(true)}>
            <CreditCard size={14} /> Enregistrer paiement
          </button>
        )}

        {/* Cancel — issued / partially_paid / overdue */}
        {canCancel && (
          <button style={btnDanger} onClick={() => setShowCancel(true)}>
            <XCircle size={14} /> Annuler
          </button>
        )}

        {/* Create avoir — paid invoices (manual avoir) */}
        {canAvoir && type !== 'avoir' && (
          <button style={btnPurple} onClick={() => setShowAvoir(true)}>
            <FileX size={14} /> Créer un avoir
          </button>
        )}

        {/* Delete — draft only */}
        {status === 'draft' && (
          <button
            style={btnDanger}
            disabled={isLoading || deleteMutation.isPending}
            onClick={() => setShowDelete(true)}
          >
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Supprimer
          </button>
        )}
      </div>

      {/* Linked avoir badge */}
      {invoice.linkedAvoir && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 'var(--radius-md)', marginTop: 10 }}>
          <FileX size={13} style={{ color: '#7c3aed' }} />
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>
            Avoir associé :{' '}
            <button
              type="button"
              onClick={() => router.push(`${ROUTES.INVOICES}/${invoice.linkedAvoir!.id}`)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#7c3aed', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, textDecoration: 'underline' }}
            >
              {invoice.linkedAvoir.number}
            </button>
          </p>
        </div>
      )}

      {/* Modals */}
      {showPayment && <PaymentModal  invoice={invoice}        onClose={() => setShowPayment(false)} />}
      {showCancel  && <CancelModal   invoiceId={id} invoiceNumber={number} onClose={() => setShowCancel(false)} />}
      {showAvoir   && <AvoirModal    invoice={invoice}        onClose={() => setShowAvoir(false)} />}
      {showDelete  && (
        <ConfirmDeleteModal
          number={number}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(id)}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </>
  )
}
