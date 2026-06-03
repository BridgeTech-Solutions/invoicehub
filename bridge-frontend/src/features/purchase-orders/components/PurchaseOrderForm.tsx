'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Loader2, AlertTriangle } from 'lucide-react'
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from '../hooks'
import { useSuppliers } from '@/features/suppliers/hooks'
import { useSettings } from '@/features/settings/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { makeBlankLine } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import type { FormLine, DiscountType } from '@/features/proformas/types'
import type { PurchaseOrder, PurchaseOrderLine } from '../types'

// ─── Types ─────────────────────────────────────────────────────

interface PurchaseOrderFormProps {
  po?: PurchaseOrder
  defaultSupplierId?: string
}

interface FormState {
  supplierId:       string
  orderDate:        string
  expectedDate:     string
  reference:        string
  paymentTermDays:  number
  notes:            string
  lines:            FormLine[]
  globalDiscountType:  DiscountType
  globalDiscountValue: number
}

// ─── Helpers ───────────────────────────────────────────────────

function poLineToFormLine(l: PurchaseOrderLine, i: number): FormLine {
  return {
    _localId:       crypto.randomUUID(),
    productId:      l.productId  ?? undefined,
    sortOrder:      l.sortOrder  ?? i,
    designation:    l.designation,
    description:    l.description ?? '',
    unit:           l.unit,
    quantity:       Number(l.quantityOrdered),
    unitPriceHt:    Number(l.unitPriceHt),
    discountType:   (l.discountType as DiscountType) ?? 'none',
    discountValue:  Number(l.discountValue),
    taxRate:        Number(l.taxRate),
    subtotalHt:     Number(l.subtotalHt),
    discountAmount: Number(l.discountAmount),
    netHt:          Number(l.netHt),
    taxAmount:      Number(l.taxAmount),
    totalTtc:       Number(l.totalTtc),
    hideDetails:    false,
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function initForm(po?: PurchaseOrder, opts?: { defaultSupplierId?: string; defaultTaxRate?: number }): FormState {
  if (po) {
    return {
      supplierId:          po.supplierId,
      orderDate:           po.issueDate.slice(0, 10),
      expectedDate:        po.expectedDeliveryDate?.slice(0, 10) ?? '',
      reference:           po.reference    ?? '',
      paymentTermDays:     po.paymentTermDays,
      notes:               po.notes        ?? '',
      lines:               po.lines.map(poLineToFormLine),
      globalDiscountType:  'none',
      globalDiscountValue: 0,
    }
  }
  return {
    supplierId:          opts?.defaultSupplierId ?? '',
    orderDate:           today(),
    expectedDate:        '',
    reference:           '',
    paymentTermDays:     30,
    notes:               '',
    lines:               [makeBlankLine(0, opts?.defaultTaxRate ?? 19.25)],
    globalDiscountType:  'none',
    globalDiscountValue: 0,
  }
}

// ─── Field label ───────────────────────────────────────────────

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

export function PurchaseOrderForm({ po, defaultSupplierId }: PurchaseOrderFormProps) {
  const isEdit = !!po

  const createMutation = useCreatePurchaseOrder()
  const updateMutation = useUpdatePurchaseOrder(po?.id ?? '')
  const isPending      = createMutation.isPending || updateMutation.isPending

  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const suppliers = suppliersData?.data ?? []

  const { data: settings } = useSettings()
  const settingsApplied = useRef(false)

  const [form, setForm] = useState<FormState>(() =>
    initForm(po, { defaultSupplierId, defaultTaxRate: undefined })
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Apply defaultTaxRate from settings on new document
  useEffect(() => {
    if (isEdit || !settings || settingsApplied.current) return
    settingsApplied.current = true
    setForm(prev => ({
      ...prev,
      lines: prev.lines.length === 1 && !prev.lines[0]!.designation
        ? [makeBlankLine(0, settings.defaultTaxRate)]
        : prev.lines,
    }))
  }, [settings, isEdit])

  // Pré-remplir délai paiement depuis le fournisseur sélectionné
  useEffect(() => {
    if (isEdit) return
    const sup = suppliers.find(s => s.id === form.supplierId)
    if (sup && (sup as any).paymentTermDays) setF('paymentTermDays', (sup as any).paymentTermDays)
  }, [form.supplierId, suppliers, isEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ──

  function validate() {
    const e: Record<string, string> = {}
    if (!form.supplierId) e.supplierId = 'Fournisseur requis'
    if (!form.orderDate)  e.orderDate  = 'Date requise'
    if (form.lines.length === 0) e.lines = 'Au moins une ligne requise'
    form.lines.forEach((l, i) => {
      if (!l.designation.trim()) e[`line_${i}`] = 'Désignation requise'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const payload = {
      supplierId:       form.supplierId,
      orderDate:        form.orderDate,
      expectedDate:     form.expectedDate  || undefined,
      reference:        form.reference     || undefined,
      notes:            form.notes         || undefined,
      paymentTermDays:  Number(form.paymentTermDays),
      lines: form.lines.map((l, i) => ({
        productId:    l.productId,
        designation:  l.designation,
        description:  l.description || undefined,
        unit:         l.unit || 'U',
        quantity:     l.hideDetails ? 1 : Number(l.quantity),
        unitPriceHt:  Number(l.unitPriceHt),
        taxRate:      Number(l.taxRate),
        sortOrder:    i + 1,
      })),
    }
    if (isEdit) updateMutation.mutate(payload)
    else        createMutation.mutate(payload)
  }

  const canSave = !!form.supplierId && form.lines.length > 0 && form.lines.every(l => l.designation.trim())

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

  const backHref  = isEdit ? `${ROUTES.PURCHASE_ORDERS}/${po.id}` : ROUTES.PURCHASE_ORDERS
  const backLabel = isEdit ? (po.number ?? 'Bon de commande') : 'Bons de commande'

  return (
    <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link
            href={backHref}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            <ChevronLeft size={13} /> {backLabel}
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier le bon de commande' : 'Nouveau bon de commande'}
          </h1>
          {isEdit ? (
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° {po.number}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° attribué automatiquement à la création
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSave || isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            background: (!canSave || isPending) ? '#93b8e0' : 'var(--primary)',
            color: '#fff', border: 'none',
            cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            boxShadow: (!canSave || isPending) ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
          }}
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isEdit ? 'Enregistrer les modifications' : 'Créer le bon de commande'}
        </button>
      </div>

      {/* ── Body: 2 colonnes ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]" style={{ alignItems: 'start' }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Fournisseur & dates */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Informations générales')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Fournisseur" required htmlFor="po-supplier" />
                <select
                  id="po-supplier"
                  value={form.supplierId}
                  onChange={e => { setF('supplierId', e.target.value); setErrors(er => ({ ...er, supplierId: '' })) }}
                  disabled={isEdit}
                  style={{ ...inputCss, cursor: isEdit ? 'default' : 'pointer', opacity: isEdit ? 0.7 : 1, borderColor: errors.supplierId ? '#ef4444' : 'var(--border)' }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un fournisseur —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.supplierId && (
                  <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">
                    {errors.supplierId}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Date de commande" required htmlFor="po-orderDate" />
                  <input
                    id="po-orderDate"
                    type="date"
                    value={form.orderDate}
                    onChange={e => { setF('orderDate', e.target.value); setErrors(er => ({ ...er, orderDate: '' })) }}
                    style={{ ...inputCss, borderColor: errors.orderDate ? '#ef4444' : 'var(--border)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  {errors.orderDate && (
                    <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">
                      {errors.orderDate}
                    </span>
                  )}
                </div>
                <div>
                  <FL label="Livraison prévue" htmlFor="po-expectedDate" />
                  <input
                    id="po-expectedDate"
                    type="date"
                    value={form.expectedDate}
                    onChange={e => setF('expectedDate', e.target.value)}
                    style={inputCss}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              <div>
                <FL label="Référence interne" htmlFor="po-reference" />
                <input
                  id="po-reference"
                  type="text"
                  value={form.reference}
                  onChange={e => setF('reference', e.target.value)}
                  placeholder="Ex : REF-2026-001"
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Conditions & Notes')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Délai de paiement (jours)" htmlFor="po-paymentTerms" />
                <input
                  id="po-paymentTerms"
                  type="number"
                  min={0}
                  value={form.paymentTermDays}
                  onChange={e => setF('paymentTermDays', Number(e.target.value))}
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <FL label="Notes / Instructions" htmlFor="po-notes" />
                <textarea
                  id="po-notes"
                  value={form.notes}
                  onChange={e => setF('notes', e.target.value)}
                  placeholder="Instructions particulières, conditions de livraison…"
                  rows={3}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Lignes + Totaux */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Erreur lignes */}
          {errors.lines && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: 13, color: '#ef4444' }}>{errors.lines}</span>
            </div>
          )}

          {/* Lignes de commande */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>
              Lignes de commande
            </p>
            <LineItemsEditor
              lines={form.lines}
              onChange={lines => setF('lines', lines)}
            />
          </div>

          {/* Totaux */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 340 }}>
              <TotalsPanel
                lines={form.lines}
                globalDiscountType={form.globalDiscountType}
                globalDiscountValue={form.globalDiscountValue}
                onGlobalDiscountTypeChange={t => setF('globalDiscountType', t as DiscountType)}
                onGlobalDiscountValueChange={v => setF('globalDiscountValue', v)}
              />
            </div>
          </div>

          {/* Validation hint */}
          {form.lines.some(l => !l.designation.trim()) && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} aria-hidden="true" /> Toutes les lignes doivent avoir une désignation.
              </p>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
