'use client'

import { useState, useMemo, useEffect, useRef, useId } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Send, Loader2, Info, AlertTriangle } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { useClients } from '@/features/clients/hooks'
import { useClientQuickFill } from '@/features/clients/hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { useCreateProforma, useUpdateProforma, useSendProforma } from '../hooks'
import { useBankAccounts } from '@/features/invoices/hooks'
import type { Proforma, FormLine, DiscountType, CreateProformaPayload } from '../types'
import { lineToFormLine, makeBlankLine } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import { useSettings } from '@/features/settings/hooks'
import { useIsMobile } from '@/hooks/useMediaQuery'

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
  bankAccountId: string
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
      bankAccountId:       proforma.bankAccountId ?? '',
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
    bankAccountId:       '',
    lines:               [makeBlankLine(0)],
  }
}

// ─── Field component (C7+C8) ────────────────────────────────────

const Field = ({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string
  label: string
  required?: boolean
}) => (
  <label
    htmlFor={htmlFor}
    style={{
      fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
      fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5,
    }}
  >
    {label}
    {required && (
      <>
        <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
        <span className="sr-only">(obligatoire)</span>
      </>
    )}
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
      <Info size={14} aria-hidden="true" style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
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
  const isMobile          = useIsMobile()

  // Unique ID prefix for all fields (C7+C8)
  const uid = useId()
  const id  = (s: string) => `${uid}-${s}`

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
  const { data: bankAccounts = [] } = useBankAccounts()

  // Pré-sélectionner le compte par défaut si aucun compte sélectionné
  useEffect(() => {
    if (form.bankAccountId || bankAccounts.length === 0) return
    const def = bankAccounts.find(a => (a as any).isDefault) ?? bankAccounts[0]
    if (def) setF('bankAccountId', def.id)
  }, [bankAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

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
    ...(form.bankAccountId && { bankAccountId: form.bankAccountId }),
    lines: form.lines.map((l, i) => ({
      productId:     l.productId,
      sortOrder:     i,
      designation:   l.designation,
      description:   l.description || undefined,
      unit:          l.unit,
      quantity:      l.hideDetails ? 1 : l.quantity,
      unitPriceHt:   l.unitPriceHt,
      discountType:  l.discountType,
      discountValue: l.discountValue,
      taxRate:       l.taxRate,
      hideDetails:   l.hideDetails ?? false,
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

  const hasBlankLine = form.lines.length > 0 && form.lines.some(l => !l.designation.trim())

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
            <ChevronLeft size={13} aria-hidden="true" />
            Proformas
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
          {/* Sauvegarder brouillon */}
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
              minHeight: 44,
            }}
          >
            <Save size={14} aria-hidden="true" />
            Sauvegarder brouillon
          </button>

          {/* Enregistrer & Envoyer (H7: opacity instead of hardcoded colour) */}
          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
              opacity: (!canSave || isPending) ? 0.65 : 1,
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5,
              boxShadow: (!canSave || isPending) ? 'none' : '0 4px 12px rgba(45,125,210,0.3)',
              minHeight: 44,
            }}
          >
            {isPending
              ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              : <Send size={14} aria-hidden="true" />
            }
            Enregistrer &amp; Envoyer
          </button>
        </div>
      </div>

      {/* ── Body: 2-column grid (H6: responsive via useIsMobile) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '300px 1fr',
        gap: 24,
        alignItems: 'start',
      }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Informations générales (H8: <h2> not <p>) */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12, marginTop: 0 }}>
              Informations générales
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Client */}
              <div>
                <Field htmlFor={id('client')} label="Client" required />
                <select
                  id={id('client')}
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

              {/* Objet */}
              <div>
                <Field htmlFor={id('subject')} label="Objet / Sujet" />
                <input
                  id={id('subject')}
                  type="text"
                  value={form.subject}
                  onChange={(e) => setF('subject', e.target.value)}
                  placeholder="Ex: Fourniture & installation réseau"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Date + Validité (M8: responsive inner grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <Field htmlFor={id('issueDate')} label="Date d'émission" required />
                  <input
                    id={id('issueDate')}
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setF('issueDate', e.target.value)}
                    required
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <Field htmlFor={id('validityDays')} label="Validité (jours)" required />
                  <input
                    id={id('validityDays')}
                    type="number"
                    min="1"
                    max="365"
                    value={form.validityDays}
                    onChange={(e) => setF('validityDays', parseInt(e.target.value) || 30)}
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Valid-until display */}
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

          {/* Conditions & Notes (H8: <h2>) */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12, marginTop: 0 }}>
              Conditions &amp; Notes
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Field htmlFor={id('paymentConditions')} label="Conditions de paiement" />
                <textarea
                  id={id('paymentConditions')}
                  value={form.paymentConditions}
                  onChange={(e) => setF('paymentConditions', e.target.value)}
                  placeholder="Ex: 30% à la commande, solde à la livraison"
                  rows={2}
                  style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <Field htmlFor={id('bankAccount')} label="Compte bancaire de réception" />
                  <select
                    id={id('bankAccount')}
                    value={form.bankAccountId}
                    onChange={(e) => setF('bankAccountId', e.target.value)}
                    style={{ ...inputCss, cursor: 'pointer' }}
                    onFocus={focusOn} onBlur={focusOff}
                  >
                    <option value="">— Sélectionner un compte —</option>
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}{acc.bankName ? ` · ${acc.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Field htmlFor={id('deliveryDelay')} label="Délai de livraison" />
                <input
                  id={id('deliveryDelay')}
                  type="text"
                  value={form.deliveryDelay}
                  onChange={(e) => setF('deliveryDelay', e.target.value)}
                  placeholder="Ex: 15 jours ouvrés"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <Field htmlFor={id('warranty')} label="Garantie" />
                <input
                  id={id('warranty')}
                  type="text"
                  value={form.warranty}
                  onChange={(e) => setF('warranty', e.target.value)}
                  placeholder="Ex: 12 mois pièces et main d'œuvre"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>
              <div>
                <Field htmlFor={id('notes')} label="Notes internes" />
                <textarea
                  id={id('notes')}
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
          {/* Lignes (H8: <h2>) */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14, marginTop: 0 }}>
              Lignes de produits / services
            </h2>
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => setF('lines', lines)}
              clientId={form.clientId || undefined}
              stockMode="warn"
            />
          </div>

          {/* Totals (M7: maxWidth instead of fixed width) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ maxWidth: 380, width: '100%' }}>
              <TotalsPanel
                lines={form.lines}
                globalDiscountType={form.globalDiscountType}
                globalDiscountValue={form.globalDiscountValue}
                onGlobalDiscountTypeChange={(t) => setF('globalDiscountType', t)}
                onGlobalDiscountValueChange={(v) => setF('globalDiscountValue', v)}
              />
            </div>
          </div>

          {/* Validation errors (H9: AlertTriangle + role="alert") */}
          {hasBlankLine && (
            <div
              role="alert"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', background: 'rgba(239,68,68,0.05)',
                borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <AlertTriangle size={14} aria-hidden="true" style={{ color: '#ef4444', flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: 0 }}>
                Toutes les lignes doivent avoir une désignation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
