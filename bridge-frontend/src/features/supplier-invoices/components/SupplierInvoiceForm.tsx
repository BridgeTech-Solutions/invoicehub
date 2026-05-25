'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { useCreateSupplierInvoice, useUpdateSupplierInvoice } from '../hooks'
import { useSuppliers } from '@/features/suppliers/hooks'
import { usePurchaseOrders } from '@/features/purchase-orders/hooks'
import { ROUTES, TAX_RATE_DEFAULT } from '@/lib/constants'
import { useCurrency } from '@/hooks/useCurrency'
import type { SupplierInvoice, CreateSILine } from '../types'

// ─── Types ─────────────────────────────────────────────────────

interface SupplierInvoiceFormProps {
  si?: SupplierInvoice
  defaultSupplierId?: string
}

interface LineState extends CreateSILine {
  _id: string
}

// ─── Helpers ───────────────────────────────────────────────────

let _lineId = 0
function newLine(): LineState {
  return {
    _id:         String(++_lineId),
    designation: '',
    description: '',
    unit:        'U',
    quantity:    1,
    unitPriceHt: 0,
    taxRate:     TAX_RATE_DEFAULT,
  }
}

function calcLine(l: LineState) {
  const ht  = l.quantity * l.unitPriceHt
  const tax = ht * ((l.taxRate ?? TAX_RATE_DEFAULT) / 100)
  return { ht, tax, ttc: ht + tax }
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

export function SupplierInvoiceForm({ si, defaultSupplierId }: SupplierInvoiceFormProps) {
  const { format } = useCurrency()
  const isEdit = !!si

  const createMutation = useCreateSupplierInvoice()
  const updateMutation = useUpdateSupplierInvoice(si?.id ?? '')
  const isPending      = createMutation.isPending || updateMutation.isPending

  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const suppliers = suppliersData?.data ?? []

  const [supplierId,        setSupplierId]        = useState(si?.supplierId        ?? defaultSupplierId ?? '')
  const [purchaseOrderId,   setPurchaseOrderId]   = useState(si?.purchaseOrderId   ?? '')
  const [supplierRef,       setSupplierRef]       = useState(si?.supplierRef       ?? '')
  const [invoiceDate,       setInvoiceDate]       = useState(si?.invoiceDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [dueDate,           setDueDate]           = useState(si?.dueDate?.slice(0, 10)    ?? '')
  const [accountingAccount, setAccountingAccount] = useState(si?.accountingAccount ?? '401000')
  const [notes,             setNotes]             = useState(si?.notes             ?? '')
  const [lines,             setLines]             = useState<LineState[]>(() =>
    si
      ? si.lines.map(l => ({ _id: String(++_lineId), designation: l.designation, description: l.description ?? '', unit: l.unit, quantity: l.quantity, unitPriceHt: l.unitPriceHt, taxRate: l.taxRate }))
      : [newLine()]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // BCs liés au fournisseur sélectionné (statut received = prêt pour facturation)
  const { data: posData } = usePurchaseOrders({
    supplierId: supplierId || undefined,
    status: 'received',
    limit: 100,
  })
  const purchaseOrders = posData?.data ?? []

  // Réinitialiser le BC lié si le fournisseur change
  useEffect(() => {
    if (!isEdit) setPurchaseOrderId('')
  }, [supplierId, isEdit])

  // ── Lines ──

  function addLine()                { setLines(l => [...l, newLine()]) }
  function removeLine(id: string)   { setLines(l => l.filter(x => x._id !== id)) }
  function setLine<K extends keyof LineState>(id: string, key: K, val: LineState[K]) {
    setLines(l => l.map(x => x._id === id ? { ...x, [key]: val } : x))
  }

  const totals = lines.reduce(
    (acc, l) => { const c = calcLine(l); return { ht: acc.ht + c.ht, tax: acc.tax + c.tax, ttc: acc.ttc + c.ttc } },
    { ht: 0, tax: 0, ttc: 0 },
  )

  // ── Validation ──

  function validate() {
    const e: Record<string, string> = {}
    if (!supplierId)   e.supplierId   = 'Fournisseur requis'
    if (!invoiceDate)  e.invoiceDate  = 'Date requise'
    if (lines.length === 0) e.lines = 'Au moins une ligne requise'
    lines.forEach((l, i) => {
      if (!l.designation.trim()) e[`line_${i}`] = 'Désignation requise'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const payload = {
      supplierId,
      supplierRef:       supplierRef       || undefined,
      purchaseOrderId:   purchaseOrderId   || undefined,
      invoiceDate,
      dueDate:           dueDate           || undefined,
      notes:             notes             || undefined,
      accountingAccount: accountingAccount || undefined,
      lines: lines.map((l, i) => ({
        designation:  l.designation,
        description:  l.description || undefined,
        unit:         l.unit || 'U',
        quantity:     Number(l.quantity),
        unitPriceHt:  Number(l.unitPriceHt),
        taxRate:      Number(l.taxRate),
        sortOrder:    i + 1,
      })),
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

  const backHref  = isEdit ? `${ROUTES.SUPPLIER_INVOICES}/${si.id}` : ROUTES.SUPPLIER_INVOICES
  const backLabel = isEdit ? (si.number ?? 'Facture fournisseur') : 'Factures fournisseurs'

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
                  value={supplierId}
                  onChange={e => { setSupplierId(e.target.value); setErrors(er => ({ ...er, supplierId: '' })) }}
                  disabled={isEdit}
                  style={{ ...inputCss, cursor: isEdit ? 'default' : 'pointer', opacity: isEdit ? 0.7 : 1, borderColor: errors.supplierId ? '#ef4444' : 'var(--border)' }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un fournisseur —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.supplierId && <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">{errors.supplierId}</span>}
              </div>

              {supplierId && purchaseOrders.length > 0 && (
                <div>
                  <FL label="Bon de commande lié" htmlFor="si-po" />
                  <select
                    id="si-po"
                    value={purchaseOrderId}
                    onChange={e => setPurchaseOrderId(e.target.value)}
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
                  value={supplierRef}
                  onChange={e => setSupplierRef(e.target.value)}
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
                    value={invoiceDate}
                    onChange={e => { setInvoiceDate(e.target.value); setErrors(er => ({ ...er, invoiceDate: '' })) }}
                    style={{ ...inputCss, borderColor: errors.invoiceDate ? '#ef4444' : 'var(--border)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  {errors.invoiceDate && <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }} role="alert">{errors.invoiceDate}</span>}
                </div>
                <div>
                  <FL label="Date d'échéance" htmlFor="si-dueDate" />
                  <input
                    id="si-dueDate"
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
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
                  value={accountingAccount}
                  onChange={e => setAccountingAccount(e.target.value)}
                  placeholder="401000"
                  style={inputCss}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <FL label="Notes internes" htmlFor="si-notes" />
                <textarea
                  id="si-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
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

          {/* Lignes */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                Lignes de facturation
              </p>
              <button
                type="button"
                onClick={addLine}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary)', background: 'rgba(45,125,210,0.06)', color: 'var(--primary)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
              >
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>

            {errors.lines && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 12 }}>
                <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: 13, color: '#ef4444' }}>{errors.lines}</span>
              </div>
            )}

            {/* Colonnes header */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 0.7fr 0.9fr 1.1fr 0.7fr 1fr 36px', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
              {['Désignation', 'Unité', 'Qté', 'P.U. HT', 'TVA %', 'Total TTC', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {lines.map((l, i) => {
              const c = calcLine(l)
              return (
                <div key={l._id} style={{ display: 'grid', gridTemplateColumns: '3fr 0.7fr 0.9fr 1.1fr 0.7fr 1fr 36px', gap: 8, alignItems: 'start', marginBottom: 8, paddingBottom: i < lines.length - 1 ? 8 : 0, borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                      value={l.designation}
                      onChange={e => { setLine(l._id, 'designation', e.target.value); setErrors(er => ({ ...er, [`line_${i}`]: '' })) }}
                      placeholder="Désignation *"
                      style={{ ...inputCss, padding: '7px 10px', fontSize: 13, borderColor: errors[`line_${i}`] ? '#ef4444' : 'var(--border)' }}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                    <input
                      value={l.description ?? ''}
                      onChange={e => setLine(l._id, 'description', e.target.value)}
                      placeholder="Description (facultatif)"
                      style={{ ...inputCss, padding: '5px 10px', fontSize: 12, color: 'var(--text-3)' }}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                    {errors[`line_${i}`] && <span style={{ fontSize: 11, color: '#ef4444' }}>{errors[`line_${i}`]}</span>}
                  </div>

                  <input
                    value={l.unit}
                    onChange={e => setLine(l._id, 'unit', e.target.value)}
                    placeholder="U"
                    style={{ ...inputCss, padding: '7px 8px', fontSize: 13, textAlign: 'center' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />

                  <input
                    type="number" min={0.001} step="any"
                    value={l.quantity}
                    onChange={e => setLine(l._id, 'quantity', Number(e.target.value))}
                    style={{ ...inputCss, padding: '7px 8px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />

                  <input
                    type="number" min={0} step="any"
                    value={l.unitPriceHt}
                    onChange={e => setLine(l._id, 'unitPriceHt', Number(e.target.value))}
                    style={{ ...inputCss, padding: '7px 8px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />

                  <input
                    type="number" min={0} max={100} step="any"
                    value={l.taxRate}
                    onChange={e => setLine(l._id, 'taxRate', Number(e.target.value))}
                    style={{ ...inputCss, padding: '7px 8px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                    onFocus={focusOn} onBlur={focusOff}
                  />

                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)', padding: '8px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {new Intl.NumberFormat('fr-FR').format(Math.round(c.ttc))}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeLine(l._id)}
                    disabled={lines.length === 1}
                    aria-label="Supprimer la ligne"
                    style={{ width: 32, height: 32, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.3 : 1, color: '#ef4444' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Totaux */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div className="card" style={{ padding: '18px 24px', minWidth: 300 }}>
              {[['Sous-total HT', format(totals.ht)], ['TVA', format(totals.tax)]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Total TTC</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{format(totals.ttc)}</span>
              </div>
            </div>
          </div>

          {/* Hint lignes invalides */}
          {lines.some(l => !l.designation.trim()) && (
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
