'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Loader2, Upload, RefreshCw, Landmark } from 'lucide-react'
import { useCreateExpense, useUpdateExpense } from '../hooks'
import { useExpenseCategories } from '../hooks'
import { useBankAccounts } from '@/features/invoices/hooks'
import { ROUTES, TAX_RATE_DEFAULT } from '@/lib/constants'
import { useCurrency } from '@/hooks/useCurrency'
import type { Expense, ExpensePaymentMethod } from '../types'

// ─── Constants ─────────────────────────────────────────────────

const PM_LABELS: Record<ExpensePaymentMethod, string> = {
  cash:          'Espèces',
  bank_transfer: 'Virement bancaire',
  mobile_money:  'Mobile Money',
  card:          'Carte bancaire',
  check:         'Chèque',
}

const PM_REF_PLACEHOLDER: Record<ExpensePaymentMethod, string> = {
  cash:          'N° reçu (facultatif)',
  bank_transfer: 'N° virement / référence',
  mobile_money:  'ID transaction (ex : CM-xxxxx)',
  card:          'N° terminal / autorisation',
  check:         'N° chèque',
}

// Modes qui impliquent l'utilisation d'un compte bancaire BTS
const BANK_MODES = new Set<ExpensePaymentMethod>(['bank_transfer', 'card', 'check'])

// ─── Types ─────────────────────────────────────────────────────

interface ExpenseFormProps {
  expense?: Expense
}

// ─── Sub-components ────────────────────────────────────────────

const FL = ({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) => (
  <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
    {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
  </label>
)

const sectionTitle = (t: string) => (
  <h3 style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
    {t}
  </h3>
)

// ─── Main component ────────────────────────────────────────────

export function ExpenseForm({ expense }: ExpenseFormProps) {
  const { format } = useCurrency()
  const isEdit = !!expense

  const createMutation = useCreateExpense()
  const updateMutation = useUpdateExpense(expense?.id ?? '')
  const isPending      = createMutation.isPending || updateMutation.isPending

  const { data: cats }              = useExpenseCategories()
  const { data: bankAccounts = [] } = useBankAccounts()

  // ── Form state ──

  const [designation,       setDesignation]       = useState(expense?.designation       ?? '')
  const [description,       setDescription]       = useState(expense?.description       ?? '')
  const [categoryId,        setCategoryId]        = useState(expense?.categoryId        ?? '')
  const [supplierName,      setSupplierName]      = useState(expense?.supplierName      ?? '')
  const [expenseDate,       setExpenseDate]       = useState(expense?.expenseDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [paymentMethod,     setPaymentMethod]     = useState<ExpensePaymentMethod>(expense?.paymentMethod ?? 'cash')
  const [bankAccountId,     setBankAccountId]     = useState('')  // UI-only — identifie le compte débité
  const [paymentRef,        setPaymentRef]        = useState('')
  const [analyticalAxis,    setAnalyticalAxis]    = useState(expense?.analyticalAxis    ?? '')
  const [amountHt,          setAmountHt]          = useState<number>(expense?.amountHt  ?? 0)
  const [taxRate,           setTaxRate]           = useState<number>(expense?.taxRate   ?? TAX_RATE_DEFAULT)
  const [accountingAccount, setAccountingAccount] = useState(expense?.accountingAccount ?? '')
  const [notes,             setNotes]             = useState(expense?.notes             ?? '')
  const [isRecurring,       setIsRecurring]       = useState(expense?.isRecurring       ?? false)
  const [errors,            setErrors]            = useState<Record<string, string>>({})

  // Pré-sélectionner le compte par défaut à l'ouverture
  useEffect(() => {
    if (bankAccountId || bankAccounts.length === 0) return
    const def = bankAccounts.find((a: any) => a.isDefault) ?? null
    if (def) setBankAccountId((def as any).id)
  }, [bankAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Réinitialiser le compte banque si on passe à espèces/mobile money
  useEffect(() => {
    if (!BANK_MODES.has(paymentMethod)) setBankAccountId('')
  }, [paymentMethod])

  const taxAmount = amountHt * (taxRate / 100)
  const totalTtc  = amountHt + taxAmount
  const needsBank = BANK_MODES.has(paymentMethod)

  // ── Validation ──

  function validate() {
    const e: Record<string, string> = {}
    if (!designation.trim()) e.designation = 'Désignation requise'
    if (!expenseDate)        e.expenseDate  = 'Date requise'
    if (amountHt <= 0)       e.amountHt    = 'Montant doit être supérieur à 0'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    // Inclure la banque sélectionnée dans les notes si le champ notes est vide
    const selectedBank = bankAccounts.find((a: any) => a.id === bankAccountId)
    let finalNotes = notes.trim()
    if (selectedBank && needsBank && finalNotes === '') {
      finalNotes = `[Compte débité : ${(selectedBank as any).name}]`
    } else if (selectedBank && needsBank && !finalNotes.includes('[Compte débité')) {
      finalNotes = `[Compte débité : ${(selectedBank as any).name}] ${finalNotes}`.trim()
    }

    const payload = {
      designation,
      description:       description       || undefined,
      categoryId:        categoryId        || undefined,
      supplierName:      supplierName      || undefined,
      expenseDate,
      paymentMethod,
      amountHt:          Number(amountHt),
      taxRate:           Number(taxRate),
      accountingAccount: accountingAccount || undefined,
      analyticalAxis:    analyticalAxis    || undefined,
      notes:             finalNotes        || undefined,
      isRecurring,
    }

    if (isEdit) updateMutation.mutate(payload)
    else        createMutation.mutate(payload)
  }

  // ── Styles ──

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
  }
  const focusOn  = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--primary)';
    (e.target as HTMLElement).style.boxShadow   = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--border)';
    (e.target as HTMLElement).style.boxShadow   = 'none'
  }

  const backHref  = isEdit ? `${ROUTES.EXPENSES}/${expense.id}` : ROUTES.EXPENSES
  const backLabel = isEdit ? (expense.designation ?? 'Dépense') : 'Notes de frais'

  return (
    <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
            <ChevronLeft size={13} /> {backLabel}
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {isEdit ? expense.designation : 'Déclarez une note de frais ou une dépense opérationnelle'}
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            background: isPending ? '#93b8e0' : 'var(--primary)',
            color: '#fff', border: 'none',
            cursor: isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            boxShadow: isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
          }}
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isEdit ? 'Enregistrer les modifications' : 'Enregistrer la dépense'}
        </button>
      </div>

      {/* ── Body: 2 colonnes ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]" style={{ alignItems: 'start' }}>

        {/* LEFT ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identification */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Identification')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Désignation" required htmlFor="exp-designation" />
                <input
                  id="exp-designation"
                  type="text"
                  value={designation}
                  onChange={e => { setDesignation(e.target.value); setErrors(er => ({ ...er, designation: '' })) }}
                  placeholder="Ex : Déjeuner client, Transport, Fournitures…"
                  style={{ ...inputCss, borderColor: errors.designation ? '#ef4444' : 'var(--border)' }}
                  onFocus={focusOn} onBlur={focusOff}
                />
                {errors.designation && <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">{errors.designation}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Catégorie" htmlFor="exp-category" />
                  <select
                    id="exp-category"
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    <option value="">— Sans catégorie —</option>
                    {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <FL label="Fournisseur / Bénéficiaire" htmlFor="exp-supplier" />
                  <input
                    id="exp-supplier"
                    type="text"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="Nom du prestataire…"
                    style={inputCss}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              <div>
                <FL label="Description" htmlFor="exp-description" />
                <textarea
                  id="exp-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Détails supplémentaires sur la dépense…"
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Options')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Notes internes" htmlFor="exp-notes" />
                <textarea
                  id="exp-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Informations complémentaires, contexte…"
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: isRecurring ? 'rgba(45,125,210,0.04)' : 'transparent', transition: 'all 0.15s' }}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={e => setIsRecurring(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={13} style={{ color: isRecurring ? 'var(--primary)' : 'var(--text-3)' }} />
                    <span style={{ fontSize: 13.5, fontWeight: isRecurring ? 600 : 400, color: isRecurring ? 'var(--primary)' : 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Dépense récurrente</span>
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>Se reproduit régulièrement (abonnement, loyer…)</p>
                </div>
              </label>

              <div
                style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-3)', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
              >
                <Upload size={15} />
                <div>
                  <p style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, margin: 0 }}>Joindre un justificatif</p>
                  <p style={{ fontSize: 11.5, margin: '2px 0 0', color: 'var(--text-3)' }}>PDF, JPG, PNG — max 5 Mo</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Paiement */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Paiement')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Date de la dépense" required htmlFor="exp-date" />
                  <input
                    id="exp-date"
                    type="date"
                    value={expenseDate}
                    onChange={e => { setExpenseDate(e.target.value); setErrors(er => ({ ...er, expenseDate: '' })) }}
                    style={{ ...inputCss, borderColor: errors.expenseDate ? '#ef4444' : 'var(--border)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  {errors.expenseDate && <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">{errors.expenseDate}</span>}
                </div>
                <div>
                  <FL label="Mode de paiement" htmlFor="exp-method" />
                  <select
                    id="exp-method"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    {(Object.entries(PM_LABELS) as [ExpensePaymentMethod, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compte bancaire débité — visible si mode bancaire */}
              {needsBank && (
                <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.04)', border: '1.5px solid rgba(45,125,210,0.18)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <Landmark size={13} style={{ color: 'var(--primary)' }} />
                    <FL label="Compte bancaire débité" htmlFor="exp-bank" />
                  </div>
                  <select
                    id="exp-bank"
                    value={bankAccountId}
                    onChange={e => setBankAccountId(e.target.value)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    <option value="">— Sélectionner un compte BTS —</option>
                    {(bankAccounts as any[]).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}{acc.bankName ? ` · ${acc.bankName}` : ''}{acc.iban ? ` · ${acc.iban.slice(-4)}` : ''}
                      </option>
                    ))}
                  </select>
                  {bankAccounts.length === 0 && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                      Aucun compte configuré — ajoutez-en dans Paramètres → Facturation.
                    </p>
                  )}
                </div>
              )}

              <div>
                <FL label={`Référence de paiement`} htmlFor="exp-paymentRef" />
                <input
                  id="exp-paymentRef"
                  type="text"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  placeholder={PM_REF_PLACEHOLDER[paymentMethod]}
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                  {PM_REF_PLACEHOLDER[paymentMethod]}
                </p>
              </div>
            </div>
          </div>

          {/* Montant */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Montant')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Montant HT (XAF)" required htmlFor="exp-ht" />
                  <input
                    id="exp-ht"
                    type="number" min={0} step="any"
                    value={amountHt}
                    onChange={e => { setAmountHt(Number(e.target.value)); setErrors(er => ({ ...er, amountHt: '' })) }}
                    style={{ ...inputCss, fontFamily: 'var(--font-mono)', borderColor: errors.amountHt ? '#ef4444' : 'var(--border)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  {errors.amountHt && <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">{errors.amountHt}</span>}
                </div>
                <div>
                  <FL label="Taux TVA (%)" htmlFor="exp-tva" />
                  <input
                    id="exp-tva"
                    type="number" min={0} max={100} step="any"
                    value={taxRate}
                    onChange={e => setTaxRate(Number(e.target.value))}
                    style={{ ...inputCss, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Compte SYSCOHADA" htmlFor="exp-account" />
                  <input
                    id="exp-account"
                    type="text"
                    value={accountingAccount}
                    onChange={e => setAccountingAccount(e.target.value)}
                    placeholder="624000"
                    style={inputCss}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <FL label="Axe analytique" htmlFor="exp-axis" />
                  <input
                    id="exp-axis"
                    type="text"
                    value={analyticalAxis}
                    onChange={e => setAnalyticalAxis(e.target.value)}
                    placeholder="PROJ-2026-001"
                    style={inputCss}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Récapitulatif TTC */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--border)' }}>
                {[
                  { label: 'Montant HT', value: format(amountHt), bold: false },
                  { label: `TVA ${taxRate}%`, value: format(taxAmount), bold: false },
                  { label: 'Total TTC', value: format(totalTtc), bold: true },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '12px 16px',
                      background: item.bold ? 'var(--primary)' : i % 2 === 0 ? 'var(--surface-2)' : 'var(--surface)',
                      borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <p style={{ fontSize: 11, color: item.bold ? 'rgba(255,255,255,0.7)' : 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>{item.label}</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: item.bold ? 15 : 13.5, color: item.bold ? '#fff' : 'var(--text-1)', margin: 0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
