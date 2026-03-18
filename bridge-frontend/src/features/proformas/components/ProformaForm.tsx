'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Send, Loader2, Info } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { useClients } from '@/features/clients/hooks'
import { useClientQuickFill } from '@/features/clients/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { useCreateProforma, useUpdateProforma, useSendProforma } from '../hooks'
import type { Proforma, FormLine, DiscountType, CreateProformaPayload } from '../types'
import { lineToFormLine, makeBlankLine } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import { formatXAF } from '@/lib/utils'
import { useSettings } from '@/features/settings/hooks'

// ─── Types ─────────────────────────────────────────────────────

interface ProformaFormProps {
  /** If provided = edit mode */
  proforma?: Proforma
  /** Pre-select a client (from URL param clientId) */
  defaultClientId?: string
}

interface FormState {
  clientId: string
  issueDate: string
  validityDays: number
  subject: string
  notes: string
  paymentConditions: string
  deliveryDelay: string
  warranty: string
  globalDiscountType: DiscountType
  globalDiscountValue: number
  lines: FormLine[]
}

// ─── Helpers ───────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd')

function initForm(proforma?: Proforma, defaultClientId?: string): FormState {
  if (proforma) {
    const issue   = format(parseISO(proforma.issueDate), 'yyyy-MM-dd')
    const validUntil = format(parseISO(proforma.validUntil), 'yyyy-MM-dd')
    const issueD  = parseISO(issue)
    const validD  = parseISO(validUntil)
    const days    = Math.round((validD.getTime() - issueD.getTime()) / 86_400_000)
    return {
      clientId:            proforma.clientId,
      issueDate:           issue,
      validityDays:        Math.max(1, days),
      subject:             proforma.subject ?? '',
      notes:               proforma.notes ?? '',
      paymentConditions:   proforma.paymentConditions ?? '',
      deliveryDelay:       proforma.deliveryDelay ?? '',
      warranty:            proforma.warranty ?? '',
      globalDiscountType:  proforma.globalDiscountType,
      globalDiscountValue: Number(proforma.globalDiscountValue),
      lines:               proforma.lines.map(lineToFormLine),
    }
  }
  return {
    clientId:            defaultClientId ?? '',
    issueDate:           today(),
    validityDays:        30,
    subject:             '',
    notes:               '',
    paymentConditions:   '',
    deliveryDelay:       '',
    warranty:            '',
    globalDiscountType:  'none',
    globalDiscountValue: 0,
    lines:               [makeBlankLine(0)],
  }
}

// ─── Label helper ───────────────────────────────────────────────

const FL = ({ label, required }: { label: string; required?: boolean }) => (
  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
    {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
  </label>
)

// ─── Quick Fill Banner ──────────────────────────────────────────

function QuickFillBanner({ clientId, onApply }: { clientId: string; onApply: (cond: string) => void }) {
  const { data } = useClientQuickFill(clientId)
  if (!data) return null

  const behavior = data.paymentBehavior
  const isOnTime = behavior && behavior.onTimeRate !== null && behavior.onTimeRate >= 80
  const isLate   = behavior && behavior.avgDaysLate !== null && behavior.avgDaysLate > 5
  const hasConds = !!data.lastPaymentConditions
  if (!isOnTime && !isLate && !hasConds && !data.unpaidBalance) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
      background: 'rgba(45,125,210,0.05)', border: '1px solid rgba(45,125,210,0.2)',
      borderRadius: 'var(--radius-md)', marginBottom: 8,
    }}>
      <Info size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>
        {behavior && (
          <p style={{ margin: '0 0 3px' }}>
            Comportement paiement :{' '}
            <strong style={{ color: isOnTime ? '#16a34a' : isLate ? '#d97706' : 'var(--text-1)' }}>
              {isOnTime ? 'Ponctuel' : isLate ? `Retards (moy. ${behavior.avgDaysLate}j)` : 'Régulier'}
            </strong>
          </p>
        )}
        {data.lastPaymentConditions && (
          <button
            type="button"
            onClick={() => onApply(data.lastPaymentConditions!)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)', textDecoration: 'underline' }}
          >
            Appliquer les conditions habituelles : « {data.lastPaymentConditions} »
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main form ─────────────────────────────────────────────────

export function ProformaForm({ proforma, defaultClientId }: ProformaFormProps) {
  const isEdit = !!proforma
  const [form, setForm]   = useState<FormState>(() => initForm(proforma, defaultClientId))
  const [sendAfter, setSendAfter] = useState(false)
  const settingsApplied   = useRef(false)

  const { data: settings } = useSettings()

  // Apply settings defaults once on new documents (not edit mode)
  useEffect(() => {
    if (isEdit || !settings || settingsApplied.current) return
    settingsApplied.current = true
    setForm(prev => ({
      ...prev,
      validityDays: settings.defaultProformaValidityDays,
      lines: prev.lines.length === 1 && !prev.lines[0].designation
        ? [makeBlankLine(0, settings.defaultTaxRate)]
        : prev.lines,
    }))
  }, [settings, isEdit])

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  // Derived validUntil from issueDate + validityDays
  const validUntilISO = useMemo(() => {
    try {
      return format(addDays(parseISO(form.issueDate), form.validityDays), 'yyyy-MM-dd')
    } catch {
      return form.issueDate
    }
  }, [form.issueDate, form.validityDays])

  // Client list
  const { data: clientsData } = useClients({ limit: 200, status: 'active' })
  const clients = clientsData?.data ?? []

  // Mutations
  const createMutation = useCreateProforma()
  const updateMutation = useUpdateProforma(proforma?.id ?? '')
  const sendMutation   = useSendProforma()

  const isPending = createMutation.isPending || updateMutation.isPending || sendMutation.isPending
  const canSave   = form.clientId && form.lines.length > 0 && form.lines.every(l => l.designation.trim())

  const buildPayload = (): CreateProformaPayload => ({
    clientId:            form.clientId,
    issueDate:           form.issueDate,
    validUntil:          validUntilISO,
    subject:             form.subject  || undefined,
    notes:               form.notes    || undefined,
    paymentConditions:   form.paymentConditions || undefined,
    deliveryDelay:       form.deliveryDelay     || undefined,
    warranty:            form.warranty          || undefined,
    globalDiscountType:  form.globalDiscountType,
    globalDiscountValue: form.globalDiscountValue,
    lines: form.lines.map((l, i) => ({
      productId:     l.productId,
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

  const handleSubmit = (e: React.FormEvent, sendFlag: boolean) => {
    e.preventDefault()
    const payload = buildPayload()
    if (isEdit) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          if (sendFlag) sendMutation.mutate(created.id)
        },
      })
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
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <Link
            href={ROUTES.PROFORMAS}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}
          >
            <ChevronLeft size={13} /> Proformas
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {isEdit ? 'Modifier la proforma' : 'Nouvelle proforma'}
          </h1>
          {isEdit && (
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° {proforma.number}
            </p>
          )}
          {!isEdit && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° attribué automatiquement à la sauvegarde
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 13.5, cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
              opacity: (!canSave || isPending) ? 0.6 : 1,
              fontFamily: 'var(--font-display)', fontWeight: 500,
            }}
          >
            <Save size={14} /> Sauvegarder brouillon
          </button>
          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              background: (!canSave || isPending) ? '#93b8e0' : 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: (!canSave || isPending) ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
            }}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isEdit ? 'Enregistrer & Envoyer' : 'Enregistrer & Envoyer'}
          </button>
        </div>
      </div>

      {/* ── Body: 2-column grid ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Client */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
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

              {form.clientId && (
                <QuickFillBanner
                  clientId={form.clientId}
                  onApply={(cond) => setF('paymentConditions', cond)}
                />
              )}

              <div>
                <FL label="Objet / Sujet" />
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setF('subject', e.target.value)}
                  placeholder="Ex: Fourniture & installation réseau"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Date d'émission" required />
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setF('issueDate', e.target.value)}
                    required
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <FL label="Validité (jours)" required />
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={form.validityDays}
                    onChange={(e) => setF('validityDays', parseInt(e.target.value) || 30)}
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              <div style={{ padding: '8px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(45,125,210,0.15)' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                  Valide jusqu'au{' '}
                  <strong style={{ color: 'var(--primary)' }}>
                    {(() => {
                      try {
                        const d = addDays(parseISO(form.issueDate), form.validityDays)
                        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                      } catch { return '—' }
                    })()}
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Conditions & Notes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <FL label="Conditions de paiement" />
                <textarea
                  value={form.paymentConditions}
                  onChange={(e) => setF('paymentConditions', e.target.value)}
                  placeholder="Ex: 30% à la commande, solde à la livraison"
                  rows={2}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <FL label="Délai de livraison" />
                <input
                  type="text"
                  value={form.deliveryDelay}
                  onChange={(e) => setF('deliveryDelay', e.target.value)}
                  placeholder="Ex: 15 jours ouvrés"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <FL label="Garantie" />
                <input
                  type="text"
                  value={form.warranty}
                  onChange={(e) => setF('warranty', e.target.value)}
                  placeholder="Ex: 12 mois pièces et main d'œuvre"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <FL label="Notes internes" />
                <textarea
                  value={form.notes}
                  onChange={(e) => setF('notes', e.target.value)}
                  placeholder="Remarques, instructions particulières…"
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

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 340 }}>
              <TotalsPanel
                lines={form.lines}
                globalDiscountType={form.globalDiscountType}
                globalDiscountValue={form.globalDiscountValue}
                onGlobalDiscountTypeChange={(t) => setF('globalDiscountType', t)}
                onGlobalDiscountValueChange={(v) => setF('globalDiscountValue', v)}
              />
            </div>
          </div>

          {/* Validation errors */}
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
