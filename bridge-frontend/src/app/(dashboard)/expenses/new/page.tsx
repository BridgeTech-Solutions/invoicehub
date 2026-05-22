'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCreateExpense } from '@/features/expenses/hooks'
import { useExpenseCategories } from '@/features/expenses/hooks'
import { ROUTES, TAX_RATE_DEFAULT } from '@/lib/constants'
import { formatXAF } from '@/lib/utils'
import type { ExpensePaymentMethod } from '@/features/expenses/types'

const PM_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Espèces', bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile Money', card: 'Carte bancaire', check: 'Chèque',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border)', background: 'var(--bg)',
  fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 }

export default function NewExpensePage() {
  const createMutation   = useCreateExpense()
  const { data: cats }   = useExpenseCategories()

  const [designation,       setDesignation]       = useState('')
  const [description,       setDescription]       = useState('')
  const [categoryId,        setCategoryId]        = useState('')
  const [supplierName,      setSupplierName]      = useState('')
  const [expenseDate,       setExpenseDate]       = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod,     setPaymentMethod]     = useState<ExpensePaymentMethod>('cash')
  const [amountHt,          setAmountHt]          = useState<number>(0)
  const [taxRate,           setTaxRate]           = useState<number>(TAX_RATE_DEFAULT)
  const [accountingAccount, setAccountingAccount] = useState('')
  const [analyticalAxis,    setAnalyticalAxis]    = useState('')
  const [notes,             setNotes]             = useState('')
  const [isRecurring,       setIsRecurring]       = useState(false)
  const [errors,            setErrors]            = useState<Record<string, string>>({})

  const taxAmount = amountHt * (taxRate / 100)
  const totalTtc  = amountHt + taxAmount

  function validate() {
    const e: Record<string, string> = {}
    if (!designation.trim()) e.designation = 'Désignation requise'
    if (!expenseDate)        e.expenseDate  = 'Date requise'
    if (amountHt <= 0)       e.amountHt    = 'Montant invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    createMutation.mutate({
      designation,
      description:       description || undefined,
      categoryId:        categoryId || undefined,
      supplierName:      supplierName || undefined,
      expenseDate,
      paymentMethod,
      amountHt:          Number(amountHt),
      taxRate:           Number(taxRate),
      accountingAccount: accountingAccount || undefined,
      analyticalAxis:    analyticalAxis || undefined,
      notes:             notes || undefined,
      isRecurring,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={ROUTES.EXPENSES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Notes de frais
        </Link>
        <PageHeader title="Nouvelle dépense" description="Déclarez une note de frais ou une dépense opérationnelle" />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Identification */}
          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Identification</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1', ...field }}>
                <label style={lbl}>Désignation <span style={{ color: '#dc2626' }}>*</span></label>
                <input value={designation} onChange={e => { setDesignation(e.target.value); setErrors(er => ({ ...er, designation: '' })) }}
                  placeholder="Ex : Déjeuner client, Transport, Fournitures…"
                  style={{ ...inp, borderColor: errors.designation ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.designation ? '#dc2626' : 'var(--border)')} />
                {errors.designation && <span style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>{errors.designation}</span>}
              </div>

              <div style={field}>
                <label style={lbl}>Catégorie</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}>
                  <option value="">— Sans catégorie —</option>
                  {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={field}>
                <label style={lbl}>Fournisseur / Bénéficiaire</label>
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                  placeholder="Nom du fournisseur"
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={{ gridColumn: '1 / -1', ...field }}>
                <label style={lbl}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  placeholder="Détails supplémentaires…"
                  style={{ ...inp, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Montant & paiement */}
          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Montant & paiement</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div style={field}>
                <label style={lbl}>Date de la dépense <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                  style={{ ...inp, borderColor: errors.expenseDate ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.expenseDate ? '#dc2626' : 'var(--border)')} />
              </div>

              <div style={field}>
                <label style={lbl}>Mode de paiement</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                  style={{ ...inp, cursor: 'pointer' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}>
                  {(Object.entries(PM_LABELS)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div style={field}>
                <label style={lbl}>Montant HT (XAF) <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="number" min={0} step="any" value={amountHt}
                  onChange={e => { setAmountHt(Number(e.target.value)); setErrors(er => ({ ...er, amountHt: '' })) }}
                  style={{ ...inp, fontFamily: 'var(--font-mono)', borderColor: errors.amountHt ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = errors.amountHt ? '#dc2626' : 'var(--border)')} />
                {errors.amountHt && <span style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>{errors.amountHt}</span>}
              </div>

              <div style={field}>
                <label style={lbl}>Taux TVA (%)</label>
                <input type="number" min={0} max={100} step="any" value={taxRate}
                  onChange={e => setTaxRate(Number(e.target.value))}
                  style={{ ...inp, fontFamily: 'var(--font-mono)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={field}>
                <label style={lbl}>Compte SYSCOHADA</label>
                <input value={accountingAccount} onChange={e => setAccountingAccount(e.target.value)}
                  placeholder="Ex : 624000"
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>

              <div style={field}>
                <label style={lbl}>Axe analytique</label>
                <input value={analyticalAxis} onChange={e => setAnalyticalAxis(e.target.value)}
                  placeholder="Ex : PROJ-2026-001"
                  style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>

            {/* Recap montant */}
            <div style={{ display: 'flex', gap: 16, marginTop: 16, padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>Montant HT</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{formatXAF(amountHt)}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>TVA ({taxRate}%)</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{formatXAF(taxAmount)}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>Total TTC</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>{formatXAF(totalTtc)}</p>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Options */}
          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Options</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={field}>
                <label style={lbl}>Notes internes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Informations complémentaires…"
                  style={{ ...inp, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)' }}>Dépense récurrente</span>
                </label>
                <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-3)' }}>
                  <Upload size={16} />
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>Joindre un justificatif</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
            <Link href={ROUTES.EXPENSES}
              style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              Annuler
            </Link>
            <button type="submit" disabled={createMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: createMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.3)', opacity: createMutation.isPending ? 0.7 : 1 }}>
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Enregistrer la dépense
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
