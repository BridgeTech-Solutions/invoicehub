'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, CheckCircle2, XCircle, Banknote, Building2, Calendar, Hash, Loader2 } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useSupplierInvoice, useApproveSupplierInvoice,
  useRecordSupplierPayment, useCancelSupplierInvoice,
} from '@/features/supplier-invoices/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES, PAYMENT_METHODS } from '@/lib/constants'
import type { SupplierInvoiceStatus } from '@/features/supplier-invoices/types'

const STATUS_CONFIG: Record<SupplierInvoiceStatus, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Brouillon',   color: '#64748b', bg: '#f1f5f9' },
  pending_approval: { label: 'En attente',  color: '#d97706', bg: '#fffbeb' },
  approved:         { label: 'Approuvée',   color: '#2D7DD2', bg: '#eff6ff' },
  partially_paid:   { label: 'Part. payée', color: '#d97706', bg: '#fffbeb' },
  paid:             { label: 'Payée',       color: '#16a34a', bg: '#f0fdf4' },
  overdue:          { label: 'En retard',   color: '#dc2626', bg: '#fef2f2' },
  cancelled:        { label: 'Annulée',     color: '#94a3b8', bg: '#f8fafc' },
}

function PaymentModal({ invoiceId, maxAmount, onClose }: { invoiceId: string; maxAmount: number; onClose: () => void }) {
  const recordMutation = useRecordSupplierPayment(invoiceId)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount,      setAmount]      = useState(maxAmount)
  const [method,      setMethod]      = useState('virement')
  const [reference,   setReference]  = useState('')
  const [notes,       setNotes]       = useState('')

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    recordMutation.mutate({ paymentDate, amount: Number(amount), method, reference: reference || undefined, notes: notes || undefined }, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 460, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Enregistrer un paiement</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Date</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inp}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Montant (XAF)</label>
              <input type="number" min={1} max={maxAmount} value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ ...inp, fontFamily: 'var(--font-mono)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp, cursor: 'pointer' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Référence</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° virement, chèque…" style={inp}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={recordMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: recordMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: recordMutation.isPending ? 0.7 : 1 }}>
              {recordMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              <Banknote size={13} /> Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SupplierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { can } = usePermission()
  const { format } = useCurrency()
  const { id }          = use(params)
  const [showPayModal, setShowPayModal] = useState(false)
  const { data: inv, isLoading } = useSupplierInvoice(id)
  const approveMutation = useApproveSupplierInvoice()
  const cancelMutation  = useCancelSupplierInvoice()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {[240, 100, 320].map((h, i) => (
          <div key={i} className="card animate-pulse" style={{ height: h }} />
        ))}
      </div>
    )
  }

  if (!inv) return null

  const cfg       = STATUS_CONFIG[inv.status]
  const canApprove = inv.status === 'pending_approval'
  const canPay     = ['approved', 'partially_paid', 'overdue'].includes(inv.status)
  const canCancel  = !['paid', 'cancelled'].includes(inv.status)
  const paidPct    = inv.totalTtc > 0 ? Math.min(100, Math.round((inv.amountPaid / inv.totalTtc) * 100)) : 0

  if (!can('supplier', 'read')) return <AccessDenied message="Vous n'avez pas accès aux factures fournisseurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980, animation: 'page-in 0.2s ease' }}>
      {showPayModal && (
        <PaymentModal invoiceId={id} maxAmount={inv.balanceDue} onClose={() => setShowPayModal(false)} />
      )}

      <div>
        <Link href={ROUTES.SUPPLIER_INVOICES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Factures fournisseurs
        </Link>
        <PageHeader
          title={inv.number}
          description={`Facture fournisseur · ${formatDate(inv.invoiceDate)}`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              {canApprove && (
                <button onClick={() => approveMutation.mutate(id)} disabled={approveMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Approuver
                </button>
              )}
              {canPay && (
                <button onClick={() => setShowPayModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <Banknote size={13} /> Payer
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

      {/* Status + solde */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statut</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', width: 'fit-content' }}>
            {cfg.label}
          </span>
        </div>
        <div className="card" style={{ padding: '16px 20px', borderLeft: '3px solid var(--primary)' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total TTC</p>
          <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(inv.totalTtc)}</p>
        </div>
        <div className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${inv.balanceDue > 0 ? '#dc2626' : '#16a34a'}` }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Solde dû</p>
          <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: inv.balanceDue > 0 ? '#dc2626' : '#16a34a' }}>{format(inv.balanceDue)}</p>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paidPct}%`, background: paidPct === 100 ? '#16a34a' : 'var(--primary)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{paidPct}% payé</p>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Fournisseur</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <Link href={`${ROUTES.SUPPLIERS}/${inv.supplierId}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-1)')}>
                {inv.supplier.name}
              </Link>
              {inv.supplier.email && <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{inv.supplier.email}</p>}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Détails</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: Calendar, label: 'Date facture',   value: formatDate(inv.invoiceDate) },
              { icon: Calendar, label: 'Échéance',       value: inv.dueDate ? formatDate(inv.dueDate) : '—' },
              { icon: Hash,     label: 'Réf. fournisseur', value: inv.supplierRef ?? '—' },
              { icon: Hash,     label: 'Compte SYSCO.',  value: inv.accountingAccount ?? '—' },
              ...(inv.purchaseOrderNumber ? [{ icon: Hash, label: 'Bon de commande', value: inv.purchaseOrderNumber }] : []),
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', width: 130 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Lignes</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Désignation', 'Unité', 'Qté', 'P.U. HT', 'TVA', 'Total TTC'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Désignation' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line, i) => (
                <tr key={line.id} style={{ borderBottom: i < inv.lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-1)', fontWeight: 500 }}>
                    <div>{line.designation}</div>
                    {line.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{line.description}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-2)' }}>{line.unit}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{line.quantity}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{new Intl.NumberFormat('fr-FR').format(line.unitPriceHt)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-3)' }}>{line.taxRate}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{new Intl.NumberFormat('fr-FR').format(Math.round(line.totalTtc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Sous-total HT', format(inv.subtotalHt)], ['TVA', format(inv.totalTax)]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(inv.totalTtc)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payments history */}
      {inv.payments.length > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Historique des paiements</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Montant' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < inv.payments.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{formatDate(p.paymentDate)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: 12.5 }}>{p.reference ?? '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#16a34a' }}>{format(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inv.notes && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Notes</h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{inv.notes}</p>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 2px' }}>
        Créé par {inv.createdBy.firstName} {inv.createdBy.lastName} · {formatDate(inv.createdAt)}
      </div>
    </div>
  )
}
