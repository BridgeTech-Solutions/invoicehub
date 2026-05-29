'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Loader2, AlertTriangle } from 'lucide-react'
import { useCreateSupplierInvoice, useUpdateSupplierInvoice } from '../hooks'
import { useSuppliers } from '@/features/suppliers/hooks'
import { usePurchaseOrders } from '@/features/purchase-orders/hooks'
import { useSettings } from '@/features/settings/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { makeBlankLine } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import type { FormLine, DiscountType } from '@/features/proformas/types'
import type { SupplierInvoice, SupplierInvoiceLine } from '../types'

// ─── Types ─────────────────────────────────────────────────────

interface SupplierInvoiceFormProps {
  si?: SupplierInvoice
  defaultSupplierId?: string
}

interface FormState {
  supplierId:          string
  purchaseOrderId:     string
  supplierRef:         string
  invoiceDate:         string
  dueDate:             string
  accountingAccount:   string
  notes:               string
  lines:               FormLine[]
  globalDiscountType:  DiscountType
  globalDiscountValue: number
}

// ─── Helpers ───────────────────────────────────────────────────

function siLineToFormLine(l: SupplierInvoiceLine, i: number): FormLine {
  return {
    _localId:       crypto.randomUUID(),
    productId:      l.productId  ?? undefined,
    sortOrder:      l.sortOrder  ?? i,
    designation:    l.designation,
    description:    l.description ?? '',
    unit:           l.unit,
    quantity:       Number(l.quantity),
    unitPriceHt:    Number(l.unitPriceHt),
    discountType:   'none' as DiscountType,
    discountValue:  0,
    taxRate:        Number(l.taxRate),
    subtotalHt:     Number(l.subtotalHt),
    discountAmount: 0,
    netHt:          Number(l.subtotalHt),
    taxAmount:      Number(l.taxAmount),
    totalTtc:       Number(l.totalTtc),
    hideDetails:    false,
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function initForm(si?: SupplierInvoice, opts?: { defaultSupplierId?: string; defaultTaxRate?: number }): FormState {
  if (si) {
    return {
      supplierId:          si.supplierId,
      purchaseOrderId:     si.purchaseOrderId   ?? '',
      supplierRef:         si.supplierInvoiceNumber ?? '',
      invoiceDate:         si.invoiceDate.slice(0, 10),
      dueDate:             si.dueDate?.slice(0, 10) ?? '',
      accountingAccount:   si.accountingAccount  ?? '401000',
      notes:               si.notes              ?? '',
      lines:               si.lines.map(siLineToFormLine),
      globalDiscountType:  'none',
      globalDiscountValue: 0,
    }
  }
  return {
    supplierId:          opts?.defaultSupplierId ?? '',
    purchaseOrderId:     '',
    supplierRef:         '',
    invoiceDate:         today(),
    dueDate:             '',
    accountingAccount:   '401000',
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

export function SupplierInvoiceForm({ si, defaultSupplierId }: SupplierInvoiceFormProps) {
  const isEdit = !!si

  const createMutation = useCreateSupplierInvoice()
  const updateMutation = useUpdateSupplierInvoice(si?.id ?? '')
  const isPending      = createMutation.isPending || updateMutation.isPending

  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const suppliers = suppliersData?.data ?? []

  const { data: settings } = useSettings()
  const settingsApplied = useRef(false)

  const [form, setForm] = useState<FormState>(() =>
    initForm(si, { defaultSupplierId, defaultTaxRate: undefined })
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // BCs liés au fournisseur sélectionné (statut received = prêt pour facturation)
  const { data: posData } = usePurchaseOrders({
    supplierId: form.supplierId || undefined,
    status: 'received',
    limit: 100,
  })
  const purchaseOrders = posData?.data ?? []

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

  // Réinitialiser le BC lié si le fournisseur change
  useEffect(() => {
    if (!isEdit) setF('purchaseOrderId', '')
  }, [form.supplierId, isEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ──

  function validate() {
    const e: Record<string, string> = {}
    if (!form.supplierId)  e.supplierId  = 'Fournisseur requis'
    if (!form.invoiceDate) e.invoiceDate = 'Date requise'
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
      supplierId:        form.supplierId,
      supplierInvoiceRef: form.supplierRef       || undefined,
      purchaseOrderId:   form.purchaseOrderId   || undefined,
      invoiceDate:       form.invoiceDate,
      dueDate:           form.dueDate           || undefined,
      notes:             form.notes             || undefined,
      accountingAccount: form.accountingAccount || undefined,
      lines: form.lines.map((l, i) => ({
        productId:   l.productId,
        designation: l.designation,
        description: l.description || undefined,
        unit:        l.unit || 'U',
        quantity:    Number(l.quantity),
        unitPrice:   Number(l.unitPriceHt),
        taxRate:     Number(l.taxRate),
        sortOrder:   i + 1,
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

  const backHref  = isEdit ? `${ROUTES.SUPPLIER_INVOICES}/${si.id}` : ROUTES.SUPPLIER_INVOICES
  const backLabel = isEdit ? (si.number ?? 'Facture fournisseur') : 'Factures fournisseurs'

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
            {isEdit ? 'Modifier la facture fournisseur' : 'Nouvelle facture fournisseur'}
          </h1>
          {isEdit ? (
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° {si.number}
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
          {isEdit ? 'Enregistrer les modifications' : 'Enregistrer la facture'}
        </button>
      </div>

      {/* ── Body: 2 colonnes ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]" style={{ alignItems: 'start' }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Fournisseur + BC lié */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Fournisseur')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Fournisseur" required htmlFor="si-supplier" />
                <select
                  id="si-supplier"
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

              {form.supplierId && purchaseOrders.length > 0 && (
                <div>
                  <FL label="Bon de commande lié" htmlFor="si-po" />
                  <select
                    id="si-po"
                    value={form.purchaseOrderId}
                    onChange={e => setF('purchaseOrderId', e.target.value)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    <option value="">— Aucun bon de commande —</option>
                    {purchaseOrders.map(po => (
                      <option key={po.id} value={po.id}>
                        {po.number} · {new Intl.NumberFormat('fr-FR').format(Math.round(po.totalTtc))} XAF
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Données de la facture */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Données de la facture')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="N° facture fournisseur" htmlFor="si-supplierRef" />
                <input
                  id="si-supplierRef"
                  type="text"
                  value={form.supplierRef}
                  onChange={e => setF('supplierRef', e.target.value)}
                  placeholder="Réf. sur la facture reçue"
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Date de facture" required htmlFor="si-invoiceDate" />
                  <input
                    id="si-invoiceDate"
                    type="date"
                    value={form.invoiceDate}
                    onChange={e => { setF('invoiceDate', e.target.value); setErrors(er => ({ ...er, invoiceDate: '' })) }}
                    style={{ ...inputCss, borderColor: errors.invoiceDate ? '#ef4444' : 'var(--border)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  {errors.invoiceDate && (
                    <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">
                      {errors.invoiceDate}
                    </span>
                  )}
                </div>
                <div>
                  <FL label="Date d'échéance" htmlFor="si-dueDate" />
                  <input
                    id="si-dueDate"
                    type="date"
                    value={form.dueDate}
                    onChange={e => setF('dueDate', e.target.value)}
                    style={inputCss}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Comptabilité & Notes */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Comptabilité & Notes')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Compte SYSCOHADA" htmlFor="si-account" />
                <input
                  id="si-account"
                  type="text"
                  value={form.accountingAccount}
                  onChange={e => setF('accountingAccount', e.target.value)}
                  placeholder="401000"
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <FL label="Notes internes" htmlFor="si-notes" />
                <textarea
                  id="si-notes"
                  value={form.notes}
                  onChange={e => setF('notes', e.target.value)}
                  placeholder="Observations, instructions particulières…"
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

          {/* Lignes de facturation */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>
              Lignes de facturation
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
