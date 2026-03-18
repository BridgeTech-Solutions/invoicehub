'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send, CheckCircle2, XCircle, ArrowRightLeft, Copy,
  Trash2, FileDown, Loader2, ChevronDown, Pencil,
} from 'lucide-react'
import {
  useSendProforma, useAcceptProforma, useRejectProforma,
  useConvertProforma, useDuplicateProforma, useDeleteProforma,
  useDownloadProformaPdf,
} from '../hooks'
import type { Proforma } from '../types'
import { ROUTES } from '@/lib/constants'

// ─── Reject modal ───────────────────────────────────────────────

function RejectModal({ proformaId, onClose }: { proformaId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const mutation = useRejectProforma()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '24px' }}>
        <h3 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>
          Rejeter la proforma
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Motif du rejet (optionnel)</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Prix trop élevé, délai non compatible…"
          rows={3}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--border)', background: 'var(--bg)',
            fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
            outline: 'none', resize: 'vertical', lineHeight: 1.5, marginBottom: 16,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
          onBlur={(e)  => { e.target.style.borderColor = 'var(--border)' }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: proformaId, reason: reason || undefined }, { onSuccess: onClose })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#f43f5e', color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5 }}
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            <XCircle size={14} /> Rejeter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Convert modal ──────────────────────────────────────────────

function ConvertModal({ proforma, onClose }: { proforma: Proforma; onClose: () => void }) {
  const [invoiceType, setInvoiceType] = useState<'standard' | 'acompte'>('standard')
  const [pct, setPct] = useState(30)
  const mutation = useConvertProforma()

  const handleConvert = () => {
    mutation.mutate({
      id: proforma.id,
      data: {
        invoiceType,
        ...(invoiceType === 'acompte' && { acomptePercentage: pct }),
      },
    }, { onSuccess: onClose })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '24px' }}>
        <h3 className="font-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
          Convertir en facture
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 18 }}>
          Proforma {proforma.number}
        </p>

        {/* Type selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {([
            { value: 'standard', label: 'Facture standard', desc: 'Reprend l\'intégralité des montants de la proforma' },
            { value: 'acompte',  label: 'Facture d\'acompte', desc: 'Facture partielle (% du total TTC)' },
          ] as const).map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setInvoiceType(value)}
              style={{
                padding: '12px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                border: `2px solid ${invoiceType === value ? 'var(--primary)' : 'var(--border)'}`,
                background: invoiceType === value ? 'rgba(45,125,210,0.05)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <p style={{ fontSize: 13.5, fontWeight: 600, color: invoiceType === value ? 'var(--primary)' : 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>
                {label}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>{desc}</p>
            </button>
          ))}
        </div>

        {/* Acompte % */}
        {invoiceType === 'acompte' && (
          <div style={{ marginBottom: 20, padding: '14px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(45,125,210,0.15)' }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 8 }}>
              Pourcentage d'acompte
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range" min="1" max="99" value={pct}
                onChange={(e) => setPct(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)' }}
              />
              <input
                type="number" min="1" max="99" value={pct}
                onChange={(e) => setPct(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
                style={{ width: 72, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)', outline: 'none', textAlign: 'center' }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>%</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Montant de l'acompte :{' '}
              <strong style={{ color: 'var(--primary)' }}>
                {new Intl.NumberFormat('fr-FR').format(Math.round(Number(proforma.totalTtc) * pct / 100))} XAF
              </strong>
              {' '}sur{' '}
              <strong>{new Intl.NumberFormat('fr-FR').format(Math.round(Number(proforma.totalTtc)))} XAF</strong>
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleConvert}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            <ArrowRightLeft size={14} /> Convertir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main actions bar ───────────────────────────────────────────

interface ProformaActionsMenuProps {
  proforma: Proforma
}

export function ProformaActionsMenu({ proforma }: ProformaActionsMenuProps) {
  const router   = useRouter()
  const [showReject,  setShowReject]  = useState(false)
  const [showConvert, setShowConvert] = useState(false)

  const sendMutation      = useSendProforma()
  const acceptMutation    = useAcceptProforma()
  const duplicateMutation = useDuplicateProforma()
  const deleteMutation    = useDeleteProforma()
  const pdfMutation       = useDownloadProformaPdf()

  const { id, status, number } = proforma

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

  const isLoading = sendMutation.isPending || acceptMutation.isPending ||
    duplicateMutation.isPending || deleteMutation.isPending || pdfMutation.isPending

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* PDF download — always */}
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
        {status === 'draft' && (
          <button
            style={btnSecondary}
            onClick={() => router.push(`${ROUTES.PROFORMAS}/${id}?mode=edit`)}
          >
            <Pencil size={14} /> Modifier
          </button>
        )}

        {/* Send — draft or rejected */}
        {(status === 'draft' || status === 'rejected') && (
          <button
            style={btnPrimary}
            disabled={isLoading}
            onClick={() => sendMutation.mutate(id)}
          >
            {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Envoyer au client
          </button>
        )}

        {/* Accept — sent */}
        {status === 'sent' && (
          <button
            style={{ ...btnPrimary, background: '#10b981', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
            disabled={isLoading}
            onClick={() => acceptMutation.mutate(id)}
          >
            {acceptMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Accepter
          </button>
        )}

        {/* Reject — sent */}
        {status === 'sent' && (
          <button
            style={{ ...btnDanger }}
            onClick={() => setShowReject(true)}
          >
            <XCircle size={14} /> Rejeter
          </button>
        )}

        {/* Convert — sent or accepted */}
        {(status === 'sent' || status === 'accepted') && (
          <button
            style={{ ...btnSecondary, borderColor: 'rgba(45,125,210,0.35)', color: 'var(--primary)' }}
            onClick={() => setShowConvert(true)}
          >
            <ArrowRightLeft size={14} /> Convertir en facture
          </button>
        )}

        {/* Delete — draft only */}
        {status === 'draft' && (
          <button
            style={btnDanger}
            disabled={isLoading}
            onClick={() => {
              if (confirm(`Supprimer la proforma ${number} ?`)) deleteMutation.mutate(id)
            }}
          >
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Supprimer
          </button>
        )}
      </div>

      {/* Modals */}
      {showReject  && <RejectModal  proformaId={id} onClose={() => setShowReject(false)} />}
      {showConvert && <ConvertModal proforma={proforma} onClose={() => setShowConvert(false)} />}
    </>
  )
}
