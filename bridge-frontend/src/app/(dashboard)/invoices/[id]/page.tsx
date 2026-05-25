'use client'

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Calendar, Clock, FileText, Link2, Trash2, FileDown, Loader2,
  User, Shield, CreditCard, PenLine, XCircle, CheckCircle, History, AlertTriangle, Tag,
} from 'lucide-react'
import { useInvoice, useDeletePayment, useDownloadReceipt, useInvoiceHistory } from '@/features/invoices/hooks'
import type { AuditLogEntry } from '@/features/invoices/api'
import { InvoiceActionsMenu } from '@/features/invoices/components/InvoiceActionsMenu'
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm'
import { InvoiceStatusTimeline } from '@/features/invoices/components/StatusTimeline'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { lineToFormLine } from '@/lib/document-math'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES, STATUS_LABELS, INVOICE_TYPES, PAYMENT_METHODS } from '@/lib/constants'
import type { InvoiceStatus, InvoiceType, DiscountType } from '@/features/invoices/types'
import { usePermission } from '@/hooks/usePermission'

// ─── Status / type badges ────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:          { background: 'rgba(148,163,184,0.15)', color: '#64748b' },
  issued:         { background: 'rgba(59,130,246,0.1)',   color: '#2563eb' },
  partially_paid: { background: 'rgba(245,158,11,0.1)',   color: '#d97706' },
  paid:           { background: 'rgba(16,185,129,0.1)',   color: '#059669' },
  overdue:        { background: 'rgba(249,115,22,0.1)',   color: '#ea580c' },
  cancelled:      { background: 'rgba(239,68,68,0.1)',    color: '#dc2626' },
}

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  standard:  { bg: 'rgba(45,125,210,0.1)',  color: 'var(--primary)' },
  acompte:   { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed'        },
  solde:     { bg: 'rgba(8,145,178,0.1)',   color: '#0891b2'        },
  avoir:     { bg: 'rgba(244,63,94,0.1)',   color: '#e11d48'        },
  recurring: { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a'        },
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{ ...s, fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '5px 14px', borderRadius: 20, textTransform: 'uppercase' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function TypeBadge({ type }: { type: InvoiceType }) {
  const t = TYPE_STYLE[type] ?? TYPE_STYLE.standard
  return (
    <span style={{ background: t.bg, color: t.color, fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase' }}>
      {INVOICE_TYPES[type as keyof typeof INVOICE_TYPES] ?? type}
    </span>
  )
}

// ─── Payment progress bar ────────────────────────────────────────

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

// ─── Audit timeline ──────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  CREATE:             { label: 'Créée',           color: '#10b981', Icon: CheckCircle },
  UPDATE:             { label: 'Modifiée',         color: '#2D7DD2', Icon: PenLine     },
  STATUS_CHANGE:      { label: 'Statut changé',    color: '#7c3aed', Icon: Shield      },
  PAYMENT_REGISTERED: { label: 'Paiement',         color: '#059669', Icon: CreditCard  },
  SOFT_DELETE:        { label: 'Supprimée',        color: '#ef4444', Icon: XCircle     },
  LOGIN:              { label: 'Connexion',         color: '#64748b', Icon: User        },
}

function AuditTimeline({ invoiceId }: { invoiceId: string }) {
  const { data: logs, isLoading } = useInvoiceHistory(invoiceId)

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} className="animate-pulse" />
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4, marginBottom: 5 }} className="animate-pulse" />
            <div style={{ height: 10, width: 180, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!logs || logs.length === 0) return (
    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Aucun événement enregistré
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {logs.map((log: AuditLogEntry, idx: number) => {
        const meta    = ACTION_META[log.action] ?? { label: log.action, color: '#64748b', Icon: History }
        const { Icon } = meta
        const isLast  = idx === logs.length - 1
        const who     = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Système'
        const when    = new Date(log.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

        // Extraire info utile du champ after/before
        let detail = ''
        if (log.action === 'PAYMENT_REGISTERED' && log.after && typeof log.after === 'object') {
          const a = log.after as Record<string, unknown>
          if (a['amount']) detail = `${Number(a['amount']).toLocaleString('fr-FR')} XAF`
          if (a['method']) detail += detail ? ` · ${a['method']}` : String(a['method'])
        } else if (log.action === 'STATUS_CHANGE' && log.after && typeof log.after === 'object') {
          const a = log.after as Record<string, unknown>
          if (a['status']) detail = String(a['status'])
        }

        return (
          <div key={log.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative' }}>
            {/* Ligne verticale */}
            {!isLast && (
              <div style={{ position: 'absolute', left: 13, top: 28, width: 2, height: 'calc(100% - 4px)', background: 'var(--border)', zIndex: 0 }} />
            )}
            {/* Icône */}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${meta.color}18`, border: `1.5px solid ${meta.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
              <Icon size={13} style={{ color: meta.color }} />
            </div>
            {/* Contenu */}
            <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: meta.color, fontFamily: 'var(--font-display)' }}>
                  {meta.label}
                </span>
                {detail && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    {detail}
                  </span>
                )}
              </div>
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

// ─── Skeleton ───────────────────────────────────────────────────

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

// ─── Detail view ─────────────────────────────────────────────────

function InvoiceDetailView({ id }: { id: string }) {
  const { format } = useCurrency()
  const { data: invoice, isLoading } = useInvoice(id)
  const deleteMutation  = useDeletePayment()
  const receiptMutation = useDownloadReceipt()
  const { can }         = usePermission()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  if (isLoading) return <Skeleton />
  if (!invoice) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Facture introuvable</p>
      <Link href={ROUTES.INVOICES} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        ← Retour aux factures
      </Link>
    </div>
  )

  const formLines   = invoice.lines.map(lineToFormLine)
  const isOverdue   = !['draft', 'paid', 'cancelled'].includes(invoice.status) && new Date(invoice.dueDate) < new Date()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <Link href={ROUTES.INVOICES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Retour aux factures
      </Link>

      {/* Header */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                <span className="doc-number">{invoice.number}</span>
              </h1>
              <TypeBadge type={invoice.type} />
              <StatusBadge status={invoice.status} />
            </div>
            {invoice.subject && (
              <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 8px' }}>{invoice.subject}</p>
            )}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                <Calendar size={13} /> {formatDate(invoice.issueDate)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                <Clock size={13} aria-hidden="true" /> Échéance {formatDate(invoice.dueDate)} {isOverdue && <AlertTriangle size={12} style={{ color: '#ef4444', marginLeft: 4 }} aria-hidden="true" />}
              </div>
              {invoice.clientReference && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <FileText size={13} /> BC : {invoice.clientReference}
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {invoice.type === 'acompte' ? 'Montant acompte TTC' : invoice.type === 'solde' ? 'Solde dû TTC' : 'Total TTC'}
            </p>
            <p style={{ fontSize: 24, fontWeight: 800, color: invoice.type === 'acompte' ? '#7c3aed' : invoice.type === 'solde' ? '#0891b2' : 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {invoice.type === 'solde'
                ? format(Number(invoice.amountDue))
                : format(Number(invoice.totalTtc))}
            </p>
          </div>
        </div>

        {/* Linked documents banner */}
        {(invoice.parentInvoice || invoice.creditedInvoice || invoice.linkedAvoir) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            {invoice.parentInvoice && (
              <Link href={`${ROUTES.INVOICES}/${invoice.parentInvoice.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', background: 'rgba(8,145,178,0.08)', borderRadius: 20, fontSize: 12.5, color: '#0891b2', textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <Link2 size={12} /> Acompte : {invoice.parentInvoice.number}
              </Link>
            )}
            {invoice.creditedInvoice && (
              <Link href={`${ROUTES.INVOICES}/${invoice.creditedInvoice.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', background: 'rgba(239,68,68,0.08)', borderRadius: 20, fontSize: 12.5, color: '#dc2626', textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <Link2 size={12} /> Facture créditée : {invoice.creditedInvoice.number}
              </Link>
            )}
            {invoice.linkedAvoir && (
              <Link href={`${ROUTES.INVOICES}/${invoice.linkedAvoir.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', background: 'rgba(124,58,237,0.08)', borderRadius: 20, fontSize: 12.5, color: '#7c3aed', textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <Link2 size={12} /> Avoir : {invoice.linkedAvoir.number}
              </Link>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <InvoiceActionsMenu invoice={invoice} />
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    {['#', 'Désignation', 'Qté', 'Unité', 'P.U. HT', 'Remise', 'TVA %', 'Total HT'].map((h, i) => (
                      <th key={h} scope="col" style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line, i) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 10px', fontSize: 12, color: 'var(--text-3)', width: 32 }}>{i + 1}</td>
                      <td style={{ padding: '11px 10px', minWidth: 180 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{line.designation}</p>
                        {line.description && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: line.description }} />}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>{Number(line.quantity)}</td>
                      <td style={{ padding: '11px 10px', fontSize: 12.5, color: 'var(--text-3)' }}>{line.unit}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Number(line.unitPriceHt))}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: Number(line.discountValue) > 0 ? '#d97706' : 'var(--text-3)' }}>
                        {line.discountType === 'none' ? '—' : line.discountType === 'percentage' ? `${Number(line.discountValue)}%` : format(Number(line.discountValue))}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{Number(line.taxRate)}%</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(Number(line.netHt)))} XAF
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ width: 320 }}>
                <TotalsPanel
                  lines={formLines}
                  globalDiscountType={invoice.globalDiscountType as DiscountType}
                  globalDiscountValue={Number(invoice.globalDiscountValue)}
                  readonly
                  invoiceType={invoice.type}
                  acomptePercentage={invoice.acomptePercentage ?? undefined}
                  totalAcomptesDeducted={Number(invoice.totalAcomptesDeducted ?? 0)}
                />
              </div>
            </div>
          </div>

          {/* Payments */}
          {invoice.payments && invoice.payments.filter(p => !p.deletedAt).length > 0 && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Paiements reçus
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Mode', 'Référence', 'Montant', ''].map((h, i) => (
                      <th key={i} scope="col" style={{ padding: '7px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: i >= 3 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.filter(p => !p.deletedAt).map((pay) => (
                    <tr key={pay.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)' }}>{formatDate(pay.paymentDate)}</td>
                      <td style={{ padding: '10px', fontSize: 13, color: 'var(--text-2)' }}>
                        {PAYMENT_METHODS[pay.method as keyof typeof PAYMENT_METHODS] ?? pay.method}
                      </td>
                      <td style={{ padding: '10px', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{pay.reference ?? '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                        +{format(Number(pay.amount))}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', width: 72 }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button type="button" aria-label="Télécharger le reçu PDF" disabled={receiptMutation.isPending}
                            onClick={() => receiptMutation.mutate({ id: pay.id, filename: `recu-${pay.id.slice(0,8)}.pdf` })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--primary)' }}>
                            {receiptMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                          </button>
                          {can('payment', 'delete') && (
                            pendingDeleteId === pay.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button type="button" onClick={() => { setPendingDeleteId(null); deleteMutation.mutate(pay.id) }} style={{ padding: '2px 8px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Confirmer</button>
                                <button type="button" onClick={() => setPendingDeleteId(null)} style={{ padding: '2px 6px', borderRadius: 4, background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <button type="button" aria-label="Annuler ce paiement" disabled={deleteMutation.isPending}
                                onClick={() => setPendingDeleteId(pay.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}>
                                <Trash2 size={13} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes */}
          {(invoice.notes || invoice.paymentConditions) && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Conditions & Notes
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {invoice.paymentConditions && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Conditions de paiement</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{invoice.paymentConditions}</p>
                  </div>
                )}
                {invoice.notes && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes internes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{invoice.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Payment progress */}
          {!['draft', 'cancelled'].includes(invoice.status) && invoice.type !== 'avoir' && (
            <PaymentProgress
              totalTtc={Number(invoice.amountDue)}
              amountPaid={Number(invoice.amountPaid)}
              balanceDue={Number(invoice.balanceDue)}
            />
          )}

          {/* Escompte de règlement */}
          {invoice.escompteRate != null && invoice.type !== 'avoir' && (
            (() => {
              const escompteApplied = invoice.payments?.some(p => p.escompteApplied) ?? false
              const now = new Date().toISOString().slice(0, 10)
              const deadline = invoice.escompteDeadline?.slice(0, 10)
              const expired = deadline != null && now > deadline
              const status = escompteApplied ? 'applied' : expired ? 'expired' : 'eligible'
              const badgeStyle: React.CSSProperties =
                status === 'applied'  ? { background: 'rgba(16,185,129,0.1)',  color: '#059669' } :
                status === 'expired'  ? { background: 'rgba(148,163,184,0.15)', color: '#64748b' } :
                                        { background: 'rgba(245,158,11,0.1)',   color: '#d97706' }
              const badgeLabel =
                status === 'applied' ? 'Appliqué' :
                status === 'expired' ? 'Expiré' : 'Applicable'
              return (
                <div className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={12} style={{ color: 'var(--text-3)' }} />
                      <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                        Escompte de règlement
                      </p>
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                      fontFamily: 'var(--font-display)', ...badgeStyle,
                    }}>
                      {badgeLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Taux</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{Number(invoice.escompteRate)}%</span>
                    </div>
                    {invoice.escompteDeadline && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Échéance</span>
                        <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>
                          {new Date(invoice.escompteDeadline).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Montant</span>
                      <span style={{ fontSize: 12.5, color: '#d97706', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {format(Number(invoice.escompteAmount))}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()
          )}

          {/* Compte bancaire de réception */}
          {invoice.bankAccount && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>Compte de réception</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{invoice.bankAccount.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{invoice.bankAccount.bankName}</p>
                {invoice.bankAccount.accountNumber && <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{invoice.bankAccount.accountNumber}</p>}
                {invoice.bankAccount.iban && <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>IBAN : {invoice.bankAccount.iban}</p>}
                {invoice.bankAccount.swiftBic && <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>SWIFT : {invoice.bankAccount.swiftBic}</p>}
              </div>
            </div>
          )}

          {/* Client */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Client</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {getInitials(invoice.client.name)}
              </span>
              <div>
                <Link href={`${ROUTES.CLIENTS}/${invoice.clientId}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{invoice.client.name}</p>
                </Link>
                {invoice.client.email && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{invoice.client.email}</p>}
                {invoice.client.phone && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>{invoice.client.phone}</p>}
              </div>
            </div>
            <Link href={`${ROUTES.CLIENTS}/${invoice.clientId}`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
              Voir la fiche client →
            </Link>
          </div>

          {/* Meta */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>Informations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                ['Créée par',  `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`],
                ['Créée le',   formatDate(invoice.createdAt)],
                ['Modifiée le', formatDate(invoice.updatedAt)],
                ...(invoice.issuedAt ? [['Émise le', formatDate(invoice.issuedAt)]] : []),
                ...(invoice.acomptePercentage != null ? [['% acompte', `${invoice.acomptePercentage}%`]] : []),
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{l}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500, maxWidth: 150, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status history */}
          {invoice.statusHistory && invoice.statusHistory.length > 0 && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>Cycle de vie</p>
              <InvoiceStatusTimeline history={invoice.statusHistory} />
            </div>
          )}

          {/* Audit history */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <History size={13} style={{ color: 'var(--text-3)' }} />
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                Journal des modifications
              </p>
            </div>
            <AuditTimeline invoiceId={invoice.id} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export default function InvoicePage() {
  const { id }       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const isEditMode   = searchParams.get('mode') === 'edit'
  const { data: invoice, isLoading } = useInvoice(id)

  if (isEditMode) {
    if (isLoading) return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 13, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card" style={{ padding: 24, height: 200 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
        </div>
      </div>
    )
    if (invoice?.status !== 'draft') {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 8 }}>
            Cette facture ne peut plus être modifiée (statut : {STATUS_LABELS[invoice?.status ?? ''] ?? invoice?.status}).
          </p>
          <Link href={`${ROUTES.INVOICES}/${id}`} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            ← Retour au détail
          </Link>
        </div>
      )
    }
    return <InvoiceForm invoice={invoice} />
  }

  return <InvoiceDetailView id={id} />
}
