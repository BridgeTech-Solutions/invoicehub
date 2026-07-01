'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, CheckCircle2, XCircle, Banknote, Send, Tag, Calendar, User, Loader2 } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useExpense, useSubmitExpense, useApproveExpense,
  useRejectExpense,
} from '@/features/expenses/hooks'
import { PayExpenseDrawer } from '@/features/expenses/components/PayExpenseDrawer'
import { ApprovalBanner } from '@/features/approvals/components/ApprovalBanner'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'
import type { ExpenseStatus } from '@/features/expenses/types'

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon',  color: '#64748b', bg: '#f1f5f9' },
  submitted: { label: 'En attente', color: '#d97706', bg: '#fffbeb' },
  approved:  { label: 'Approuvée',  color: '#2D7DD2', bg: '#eff6ff' },
  paid:      { label: 'Payée',      color: '#16a34a', bg: '#f0fdf4' },
  rejected:  { label: 'Rejetée',    color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Annulée',    color: '#94a3b8', bg: '#f8fafc' },
}

const PM_LABELS: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', mobile_money: 'Mobile Money',
  card: 'Carte', check: 'Chèque', other: 'Autre',
}

function RejectModal({ onConfirm, onClose, isPending }: { onConfirm: (reason: string) => void; onClose: () => void; isPending: boolean }) {
  const [reason, setReason] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ padding: '28px 32px', width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Motif du rejet</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Expliquez pourquoi cette dépense est rejetée…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, resize: 'vertical', outline: 'none' }}
          onFocus={e => (e.target.style.borderColor = '#dc2626')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
          <button onClick={() => onConfirm(reason)} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isPending ? 0.7 : 1 }}>
            {isPending && <Loader2 size={13} className="animate-spin" />}
            Rejeter
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { can } = usePermission()
  const { format } = useCurrency()
  const { id }       = use(params)
  const [showReject, setShowReject] = useState(false)
  const [showPay,    setShowPay]    = useState(false)

  const { data: exp, isLoading } = useExpense(id)
  const submitMutation   = useSubmitExpense()
  const approveMutation  = useApproveExpense()
  const rejectMutation   = useRejectExpense()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {[80, 200, 160].map((h, i) => <div key={i} className="card animate-pulse" style={{ height: h }} />)}
      </div>
    )
  }

  if (!exp) return null

  const cfg        = STATUS_CONFIG[exp.status]
  const canSubmit  = exp.status === 'draft'
  const canApprove = exp.status === 'submitted'
  const canReject  = exp.status === 'submitted'
  const canMarkPaid = exp.status === 'approved'

  if (!can('expense', 'read')) return <AccessDenied message="Vous n'avez pas accès à cette dépense." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'page-in 0.2s ease' }}>
      {showReject && (
        <RejectModal isPending={rejectMutation.isPending}
          onClose={() => setShowReject(false)}
          onConfirm={reason => { rejectMutation.mutate({ id, reason }); setShowReject(false) }} />
      )}

      {showPay && (
        <PayExpenseDrawer
          expense={{ id, designation: exp.designation, amountTtc: exp.amountTtc, bankAccountId: (exp as { bankAccountId?: string | null }).bankAccountId ?? null }}
          onClose={() => setShowPay(false)} />
      )}

      <div>
        <Link href={ROUTES.EXPENSES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Notes de frais
        </Link>
        <PageHeader
          title={exp.designation}
          description={`Dépense · ${formatDate(exp.expenseDate)}`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              {canSubmit && (
                <button onClick={() => submitMutation.mutate(id)} disabled={submitMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <Send size={13} /> Soumettre
                </button>
              )}
              {canApprove && (
                <button onClick={() => approveMutation.mutate(id)} disabled={approveMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Approuver
                </button>
              )}
              {canReject && (
                <button onClick={() => setShowReject(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <XCircle size={13} /> Rejeter
                </button>
              )}
              {canMarkPaid && (
                <button onClick={() => setShowPay(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  <Banknote size={13} /> Marquer payée
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* Statut d'approbation (workflow) */}
      <ApprovalBanner request={exp.approvalRequest ?? null} />

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Statut</p>
          <span style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {cfg.label}
          </span>
        </div>
        <div className="card" style={{ padding: '16px 20px', borderLeft: '3px solid var(--primary)' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Montant TTC</p>
          <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(exp.amountTtc)}</p>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Mode de paiement</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{PM_LABELS[exp.paymentMethod] ?? exp.paymentMethod}</p>
        </div>
      </div>

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Informations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Calendar, label: 'Date',          value: formatDate(exp.expenseDate) },
              { icon: Tag,      label: 'Catégorie',     value: exp.category?.name ?? '—' },
              { icon: User,     label: 'Fournisseur',   value: exp.supplierName ?? '—' },
              { icon: User,     label: 'Soumis par',    value: `${exp.submittedBy.firstName} ${exp.submittedBy.lastName}` },
              ...(exp.approvedBy ? [{ icon: CheckCircle2, label: 'Approuvé par', value: `${exp.approvedBy.firstName} ${exp.approvedBy.lastName}` }] : []),
              ...(exp.analyticalAxis ? [{ icon: Tag, label: 'Axe analytique', value: exp.analyticalAxis }] : []),
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', width: 120 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '18px 22px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Montants</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Montant HT</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(exp.amountHt)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>TVA ({exp.taxRate}%)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{format(exp.taxAmount)}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(exp.amountTtc)}</span>
            </div>
            {exp.accountingAccount && can('accounting', 'read') && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
                Compte SYSCOHADA : <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{exp.accountingAccount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {exp.rejectionReason && (
        <div style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)', background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Motif du rejet</p>
          <p style={{ fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.6 }}>{exp.rejectionReason}</p>
        </div>
      )}

      {(exp.description || exp.notes) && (
        <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {exp.description && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description</p>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{exp.description}</p>
            </div>
          )}
          {exp.notes && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</p>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{exp.notes}</p>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 2px' }}>
        Créé le {formatDate(exp.createdAt)}
        {exp.paidAt && ` · Payé le ${formatDate(exp.paidAt)}`}
      </div>
    </div>
  )
}
