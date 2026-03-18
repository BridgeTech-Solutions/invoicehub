'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useClients } from '@/features/clients/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { useCreateRecurring, useUpdateRecurring } from '../hooks'
import type { RecurringTemplate, RecurringInterval, CreateRecurringPayload } from '../types'
import { makeBlankLine, computeLineValues } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import type { FormLine, DiscountType } from '@/features/proformas/types'
import type { RecurringLine } from '../types'

function recurringLineToFormLine(l: RecurringLine): FormLine {
  const qty   = Number(l.quantity)
  const price = Number(l.unitPriceHt)
  const disc  = l.discountType as DiscountType
  const discV = Number(l.discountValue)
  const tax   = Number(l.taxRate)
  const computed = computeLineValues(qty, price, disc, discV, tax)
  return {
    _localId:      crypto.randomUUID(),
    productId:     undefined,
    sortOrder:     l.sortOrder,
    designation:   l.designation,
    description:   l.description ?? '',
    unit:          l.unit,
    quantity:      qty,
    unitPriceHt:   price,
    discountType:  disc,
    discountValue: discV,
    taxRate:       tax,
    ...computed,
  }
}

// ─── Types ─────────────────────────────────────────────────────

interface RecurringFormProps {
  template?: RecurringTemplate
  defaultClientId?: string
}

interface FormState {
  clientId: string
  interval: RecurringInterval
  nextInvoiceDate: string
  endDate: string
  subject: string
  notes: string
  paymentConditions: string
  currency: string
  lines: FormLine[]
}

// ─── Helpers ───────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd')

function initForm(template?: RecurringTemplate, defaultClientId?: string): FormState {
  if (template) {
    return {
      clientId:         template.client.id,
      interval:         template.interval,
      nextInvoiceDate:  template.nextInvoiceDate.slice(0, 10),
      endDate:          template.endDate?.slice(0, 10) ?? '',
      subject:          template.subject ?? '',
      notes:            template.notes ?? '',
      paymentConditions: template.paymentConditions ?? '',
      currency:         template.currency,
      lines:            template.lines.map(recurringLineToFormLine),
    }
  }
  return {
    clientId:         defaultClientId ?? '',
    interval:         'monthly',
    nextInvoiceDate:  today(),
    endDate:          '',
    subject:          '',
    notes:            '',
    paymentConditions: '',
    currency:         'XAF',
    lines:            [makeBlankLine(0)],
  }
}

// ─── Label helper ───────────────────────────────────────────────

const FL = ({ label, required }: { label: string; required?: boolean }) => (
  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
    {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
  </label>
)

// ─── Interval options ──────────────────────────────────────────

const INTERVALS: { value: RecurringInterval; label: string; desc: string }[] = [
  { value: 'monthly',   label: 'Mensuelle',      desc: 'Tous les mois' },
  { value: 'quarterly', label: 'Trimestrielle',  desc: 'Tous les 3 mois' },
  { value: 'biannual',  label: 'Semestrielle',   desc: 'Tous les 6 mois' },
  { value: 'annual',    label: 'Annuelle',        desc: 'Une fois par an' },
]

const INTERVAL_COLORS: Record<RecurringInterval, { bg: string; border: string; color: string }> = {
  monthly:   { bg: 'rgba(45,125,210,0.08)',  border: 'rgba(45,125,210,0.4)',  color: '#2563eb' },
  quarterly: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.4)',  color: '#059669' },
  biannual:  { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.4)',  color: '#7c3aed' },
  annual:    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.4)',  color: '#d97706' },
}

// ─── Main form ─────────────────────────────────────────────────

export function RecurringForm({ template, defaultClientId }: RecurringFormProps) {
  const isEdit = !!template
  const [form, setForm] = useState<FormState>(() => initForm(template, defaultClientId))

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const { data: clientsData } = useClients({ limit: 200, status: 'active' })
  const clients = clientsData?.data ?? []

  const createMutation = useCreateRecurring()
  const updateMutation = useUpdateRecurring(template?.id ?? '')

  const isPending = createMutation.isPending || updateMutation.isPending
  const canSave   = !!form.clientId && !!form.nextInvoiceDate && form.lines.length > 0 && form.lines.every(l => l.designation.trim())

  const buildPayload = (): CreateRecurringPayload => ({
    clientId:         form.clientId,
    interval:         form.interval,
    nextInvoiceDate:  form.nextInvoiceDate,
    endDate:          form.endDate || undefined,
    subject:          form.subject || undefined,
    notes:            form.notes || undefined,
    paymentConditions: form.paymentConditions || undefined,
    currency:         form.currency || 'XAF',
    lines: form.lines.map((l, i) => ({
      sortOrder:     i,
      designation:   l.designation,
      description:   l.description || undefined,
      unit:          l.unit,
      quantity:      l.quantity,
      unitPriceHt:   l.unitPriceHt,
      discountType:  l.discountType,
      discountValue: l.discountValue,
      taxRate:       l.taxRate,
    })),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = buildPayload()
    if (isEdit) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link
            href={isEdit ? `${ROUTES.RECURRING}/${template.id}` : ROUTES.RECURRING}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}
          >
            <ChevronLeft size={13} /> {isEdit ? 'Détail du gabarit' : 'Gabarits récurrents'}
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier le gabarit' : 'Nouveau gabarit récurrent'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {isEdit ? `Client : ${template.client.name}` : 'Les factures seront générées automatiquement selon la fréquence choisie'}
          </p>
        </div>

        <button
          type="button"
          disabled={!canSave || isPending}
          onClick={handleSubmit}
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
          {isEdit ? 'Enregistrer les modifications' : 'Créer le gabarit'}
        </button>
      </div>

      {/* Body: 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Client & fréquence */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Informations générales
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <FL label="Client" required />
                <select
                  value={form.clientId}
                  onChange={(e) => setF('clientId', e.target.value)}
                  required
                  style={{ ...inputCss, cursor: 'pointer' }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <FL label="Objet / Sujet" />
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setF('subject', e.target.value)}
                  placeholder="Ex: Maintenance mensuelle réseau"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>

            </div>
          </div>

          {/* Planification */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Planification
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Fréquence */}
              <div>
                <FL label="Fréquence" required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {INTERVALS.map(({ value, label, desc }) => {
                    const active = form.interval === value
                    const c = INTERVAL_COLORS[value]
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setF('interval', value)}
                        style={{
                          padding: '9px 10px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                          border: `1.5px solid ${active ? c.border : 'var(--border)'}`,
                          background: active ? c.bg : 'var(--bg)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: active ? c.color : 'var(--text-2)', margin: '0 0 1px', fontFamily: 'var(--font-display)' }}>{label}</p>
                        <p style={{ fontSize: 11, color: active ? c.color : 'var(--text-3)', margin: 0, opacity: 0.85 }}>{desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <FL label="Première / prochaine facture" required />
                <input
                  type="date"
                  value={form.nextInvoiceDate}
                  onChange={(e) => setF('nextInvoiceDate', e.target.value)}
                  required
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <FL label="Date de fin (optionnel)" />
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setF('endDate', e.target.value)}
                  min={form.nextInvoiceDate}
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  Laisser vide pour une récurrence sans fin
                </p>
              </div>

            </div>
          </div>

          {/* Conditions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Conditions & Notes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <FL label="Conditions de paiement" />
                <textarea
                  value={form.paymentConditions}
                  onChange={(e) => setF('paymentConditions', e.target.value)}
                  placeholder="Ex: Paiement à 30 jours"
                  rows={2}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <FL label="Notes internes" />
                <textarea
                  value={form.notes}
                  onChange={(e) => setF('notes', e.target.value)}
                  placeholder="Remarques visibles uniquement en interne…"
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
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Lignes de produits / services
            </p>
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => setF('lines', lines)}
              clientId={form.clientId || undefined}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 340 }}>
              <TotalsPanel
                lines={form.lines}
                globalDiscountType="none"
                globalDiscountValue={0}
                readonly
              />
            </div>
          </div>

          {form.lines.length > 0 && form.lines.some(l => !l.designation.trim()) && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: 0 }}>
                ⚠ Toutes les lignes doivent avoir une désignation.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
