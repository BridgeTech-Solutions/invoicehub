'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useExpense, useUpdateExpense } from '@/features/expenses/hooks'
import { useExpenseCategories } from '@/features/expenses/hooks'
import { ROUTES, TAX_RATE_DEFAULT } from '@/lib/constants'
import { formatXAF } from '@/lib/utils'
import type { ExpensePaymentMethod } from '@/features/expenses/types'

const PM_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Espèces', bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile Money', card: 'Carte bancaire', check: 'Chèque',
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, fontFamily: 'var(--font-display)' }
const fld: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 }

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }      = use(params)
  const { data: exp, isLoading } = useExpense(id)
  const updateMutation = useUpdateExpense(id)
  const { data: cats } = useExpenseCategories()

  const [designation,       setDesignation]       = useState('')
  const [description,       setDescription]       = useState('')
  const [categoryId,        setCategoryId]        = useState('')
  const [supplierName,      setSupplierName]      = useState('')
  const [expenseDate,       setExpenseDate]       = useState('')
  const [paymentMethod,     setPaymentMethod]     = useState<ExpensePaymentMethod>('cash')
  const [amountHt,          setAmountHt]          = useState<number>(0)
  const [taxRate,           setTaxRate]           = useState<number>(TAX_RATE_DEFAULT)
  const [accountingAccount, setAccountingAccount] = useState('')
  const [analyticalAxis,    setAnalyticalAxis]    = useState('')
  const [notes,             setNotes]             = useState('')
  const [isRecurring,       setIsRecurring]       = useState(false)
  const [errors,            setErrors]            = useState<Record<string, string>>({})
  const [ready,             setReady]             = useState(false)

  useEffect(() => {
    if (exp && !ready) {
      setDesignation(exp.designation)
      setDescription(exp.description ?? '')
      setCategoryId(exp.categoryId ?? '')
      setSupplierName(exp.supplierName ?? '')
      setExpenseDate(exp.expenseDate.slice(0, 10))
      setPaymentMethod(exp.paymentMethod)
      setAmountHt(exp.amountHt)
      setTaxRate(exp.taxRate)
      setAccountingAccount(exp.accountingAccount ?? '')
      setAnalyticalAxis(exp.analyticalAxis ?? '')
      setNotes(exp.notes ?? '')
      setIsRecurring(exp.isRecurring)
      setReady(true)
    }
  }, [exp, ready])

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
    updateMutation.mutate({
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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
        <div style={{ height: 20, width: 180, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card animate-pulse" style={{ height: 500 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={`${ROUTES.EXPENSES}/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> {exp?.designation ?? 'Dépense'}
        </Link>
        <PageHeader title="Modifier la dépense" description={`Mise à jour de ${exp?.designation ?? ''}`} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Identification</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1', ...fld }}>
                <label style={lbl}>Désignation *</label>
                <input value={designation} onChange={e => { setDesignation(e.target.value); setErrors(er => ({ ...er, designation: '' })) }}
                  style={{ ...inp, borderColor: errors.designation ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = errors.designation ? '#dc2626' : 'var(--border)')} />
                {errors.designation && <span style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>{errors.designation}</span>}
              </div>
              <div style={fld}>
                <label style={lbl}>Catégorie</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Sans catégorie —</option>
                  {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={fld}>
                <label style={lbl}>Fournisseur / Bénéficiaire</label>
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)} style={inp}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={{ gridColumn: '1 / -1', ...fld }}>
                <label style={lbl}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  style={{ ...inp, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Montant & paiement</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div style={fld}>
                <label style={lbl}>Date *</label>
                <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                  style={{ ...inp, borderColor: errors.expenseDate ? '#dc2626' : 'var(--border)' }} />
              </div>
              <div style={fld}>
                <label style={lbl}>Mode de paiement</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as ExpensePaymentMethod)} style={{ ...inp, cursor: 'pointer' }}>
                  {(Object.entries(PM_LABELS)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={fld}>
                <label style={lbl}>Montant HT (XAF) *</label>
                <input type="number" min={0} step="any" value={amountHt} onChange={e => { setAmountHt(Number(e.target.value)); setErrors(er => ({ ...er, amountHt: '' })) }}
                  style={{ ...inp, fontFamily: 'var(--font-mono)', borderColor: errors.amountHt ? '#dc2626' : 'var(--border)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = errors.amountHt ? '#dc2626' : 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>Taux TVA (%)</label>
                <input type="number" min={0} max={100} step="any" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={{ ...inp, fontFamily: 'var(--font-mono)' }} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>Compte SYSCOHADA</label>
                <input value={accountingAccount} onChange={e => setAccountingAccount(e.target.value)} placeholder="624000" style={inp} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div style={fld}>
                <label style={lbl}>Axe analytique</label>
                <input value={analyticalAxis} onChange={e => setAnalyticalAxis(e.target.value)} style={inp} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 16, padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
              {[['Montant HT', formatXAF(amountHt)], [`TVA (${taxRate}%)`, formatXAF(taxAmount)], ['Total TTC', formatXAF(totalTtc)]].map(([k, v], i) => (
                <div key={k} style={{ flex: 1 }}>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>{k}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontWeight: i === 2 ? 700 : 600, fontSize: i === 2 ? 16 : 14, color: i === 2 ? 'var(--primary)' : 'var(--text-1)' }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={fld}>
              <label style={lbl}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} onFocus={e => (e.target.style.borderColor = 'var(--primary)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>Dépense récurrente</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
            <Link href={`${ROUTES.EXPENSES}/${id}`}
              style={{ padding: '9px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              Annuler
            </Link>
            <button type="submit" disabled={updateMutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: updateMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMutation.isPending ? 0.7 : 1 }}>
              {updateMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Enregistrer les modifications
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
