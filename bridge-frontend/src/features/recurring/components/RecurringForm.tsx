'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Loader2, AlertCircle, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useClients } from '@/features/clients/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { useCreateRecurring, useUpdateRecurring } from '../hooks'
import { uuid } from '@/lib/document-math'
import type { RecurringTemplate, RecurringInterval, CreateRecurringPayload } from '../types'
import { makeBlankLine, computeLineValues } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import { useIsMobile } from '@/hooks/useMediaQuery'
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
    _localId:      uuid(),
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
  clientId:          string
  interval:          RecurringInterval
  nextInvoiceDate:   string
  endDate:           string
  subject:           string
  notes:             string
  paymentConditions: string
  currency:          string
  lines:             FormLine[]
}

// ─── Helpers ───────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd')

function initForm(template?: RecurringTemplate, defaultClientId?: string): FormState {
  if (template) {
    return {
      clientId:          template.client.id,
      interval:          template.interval,
      nextInvoiceDate:   template.nextInvoiceDate.slice(0, 10),
      endDate:           template.endDate?.slice(0, 10) ?? '',
      subject:           template.subject ?? '',
      notes:             template.notes ?? '',
      paymentConditions: template.paymentConditions ?? '',
      currency:          template.currency,
      lines:             template.lines.map(recurringLineToFormLine),
    }
  }
  return {
    clientId:          defaultClientId ?? '',
    interval:          'monthly',
    nextInvoiceDate:   today(),
    endDate:           '',
    subject:           '',
    notes:             '',
    paymentConditions: '',
    currency:          'XAF',
    lines:             [makeBlankLine(0)],
  }
}

// ─── Field wrapper ─────────────────────────────────────────────

function Field({ label, required, children, htmlFor, hint }: {
  label: string
  required?: boolean
  children: React.ReactNode
  htmlFor?: string
  hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 3 }}>
        {label}
        {required && <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        {required && <span className="sr-only">(obligatoire)</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>{hint}</p>}
    </div>
  )
}

// ─── Section header ────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>
      {children}
    </h2>
  )
}

// ─── Interval options ──────────────────────────────────────────

const INTERVALS: { value: RecurringInterval; label: string; desc: string }[] = [
  { value: 'monthly',   label: 'Mensuelle',     desc: 'Tous les mois' },
  { value: 'quarterly', label: 'Trimestrielle', desc: 'Tous les 3 mois' },
  { value: 'biannual',  label: 'Semestrielle',  desc: 'Tous les 6 mois' },
  { value: 'annual',    label: 'Annuelle',       desc: 'Une fois par an' },
]

const INTERVAL_COLORS: Record<RecurringInterval, { bg: string; border: string; color: string }> = {
  monthly:   { bg: 'rgba(45,125,210,0.08)',  border: 'rgba(45,125,210,0.4)',  color: '#2563eb' },
  quarterly: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.4)',  color: '#059669' },
  biannual:  { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.4)',  color: '#7c3aed' },
  annual:    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.4)',  color: '#d97706' },
}

// ─── Main form ─────────────────────────────────────────────────

export function RecurringForm({ template, defaultClientId }: RecurringFormProps) {
  const isEdit   = !!template
  const isMobile = useIsMobile()
  const [form, setForm] = useState<FormState>(() => initForm(template, defaultClientId))

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const { data: clientsData } = useClients({ limit: 200, status: 'active' })
  const clients = clientsData?.data ?? []

  const createMutation = useCreateRecurring()
  const updateMutation = useUpdateRecurring(template?.id ?? '')

  const isPending = createMutation.isPending || updateMutation.isPending
  const isError   = createMutation.isError   || updateMutation.isError
  const canSave   = !!form.clientId && !!form.nextInvoiceDate && form.lines.length > 0 && form.lines.every(l => l.designation.trim())

  // ─── Unique IDs ───────────────────────────────────────────────
  const idClient           = useId()
  const idSubject          = useId()
  const idIntervalGroup    = useId()
  const idNextDate         = useId()
  const idEndDate          = useId()
  const idPaymentCond      = useId()
  const idNotes            = useId()

  const buildPayload = (): CreateRecurringPayload => ({
    clientId:          form.clientId,
    interval:          form.interval,
    nextInvoiceDate:   form.nextInvoiceDate,
    endDate:           form.endDate || undefined,
    subject:           form.subject || undefined,
    notes:             form.notes || undefined,
    paymentConditions: form.paymentConditions || undefined,
    currency:          form.currency || 'XAF',
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
    if (!canSave) return
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
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
  }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
  }

  const hasEmptyLine = form.lines.length > 0 && form.lines.some(l => !l.designation.trim())

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {/* ── Top bar ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link
            href={isEdit ? `${ROUTES.RECURRING}/${template.id}` : ROUTES.RECURRING}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}
          >
            <ChevronLeft size={13} aria-hidden />
            {isEdit ? 'Détail du gabarit' : 'Gabarits récurrents'}
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier le gabarit' : 'Nouveau gabarit récurrent'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {isEdit
              ? `Client : ${template.client.name}`
              : 'Les factures seront générées automatiquement selon la fréquence choisie'}
          </p>
        </div>

        <button
          type="submit"
          disabled={!canSave || isPending}
          aria-disabled={!canSave || isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            background: 'var(--primary)', color: '#fff', border: 'none',
            cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
            opacity: (!canSave || isPending) ? 0.65 : 1,
            boxShadow: (!canSave || isPending) ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
            transition: 'opacity 0.15s, box-shadow 0.15s',
          }}
        >
          {isPending
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Save size={14} aria-hidden />}
          {isEdit ? 'Enregistrer les modifications' : 'Créer le gabarit'}
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────── */}
      {isError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 20, borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
          <AlertCircle size={14} aria-hidden />
          <span style={{ fontSize: 13 }}>
            {isEdit ? 'Erreur lors de la mise à jour du gabarit.' : 'Erreur lors de la création du gabarit.'} Veuillez réessayer.
          </span>
        </div>
      )}

      {/* ── Body: responsive grid ─────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '300px 1fr',
        gap: 24,
        alignItems: 'start',
      }}>

        {/* ── LEFT — Informations ────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Client & objet */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <SectionHead>Informations générales</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <Field label="Client" required htmlFor={idClient}>
                <select
                  id={idClient}
                  value={form.clientId}
                  onChange={(e) => setF('clientId', e.target.value)}
                  required
                  aria-required
                  style={{ ...inputCss, cursor: 'pointer' }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Objet / Sujet" htmlFor={idSubject}>
                <input
                  id={idSubject}
                  type="text"
                  value={form.subject}
                  onChange={(e) => setF('subject', e.target.value)}
                  placeholder="Ex: Maintenance mensuelle réseau"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </Field>

            </div>
          </div>

          {/* Planification */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <SectionHead>Planification</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Fréquence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span id={idIntervalGroup} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Fréquence
                  <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
                  <span className="sr-only">(obligatoire)</span>
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={idIntervalGroup}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}
                >
                  {INTERVALS.map(({ value, label, desc }) => {
                    const active = form.interval === value
                    const c = INTERVAL_COLORS[value]
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
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

              <Field label="Première / prochaine facture" required htmlFor={idNextDate}>
                <input
                  id={idNextDate}
                  type="date"
                  value={form.nextInvoiceDate}
                  onChange={(e) => setF('nextInvoiceDate', e.target.value)}
                  required
                  aria-required
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </Field>

              <Field
                label="Date de fin (optionnel)"
                htmlFor={idEndDate}
                hint="Laisser vide pour une récurrence sans fin"
              >
                <input
                  id={idEndDate}
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setF('endDate', e.target.value)}
                  min={form.nextInvoiceDate}
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </Field>

            </div>
          </div>

          {/* Conditions & Notes */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <SectionHead>Conditions &amp; Notes</SectionHead>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Conditions de paiement" htmlFor={idPaymentCond}>
                <textarea
                  id={idPaymentCond}
                  value={form.paymentConditions}
                  onChange={(e) => setF('paymentConditions', e.target.value)}
                  placeholder="Ex: Paiement à 30 jours"
                  rows={2}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </Field>
              <Field label="Notes internes" htmlFor={idNotes}>
                <textarea
                  id={idNotes}
                  value={form.notes}
                  onChange={(e) => setF('notes', e.target.value)}
                  placeholder="Remarques visibles uniquement en interne…"
                  rows={3}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </Field>
            </div>
          </div>

        </div>

        {/* ── RIGHT — Lignes + Totaux ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <SectionHead>Lignes de produits / services</SectionHead>
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => setF('lines', lines)}
              clientId={form.clientId || undefined}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: 380 }}>
              <TotalsPanel
                lines={form.lines}
                globalDiscountType="none"
                globalDiscountValue={0}
                readonly
              />
            </div>
          </div>

          {hasEmptyLine && (
            <div
              role="alert"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle size={14} aria-hidden style={{ color: '#ef4444', flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: 0 }}>
                Toutes les lignes doivent avoir une désignation.
              </p>
            </div>
          )}
        </div>

      </div>
    </form>
  )
}
