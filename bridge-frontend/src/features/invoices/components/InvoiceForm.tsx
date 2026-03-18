'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Save, Zap, Loader2, Info,
  AlertTriangle, AlertCircle, XCircle, FileText, Copy,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useClients } from '@/features/clients/hooks'
import { useClientQuickFill } from '@/features/clients/hooks'
import { useInvoices, useInvoice } from '../hooks'
import { LineItemsEditor } from '@/components/document/LineItemsEditor'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import {
  useCreateInvoice, useUpdateInvoice, useIssueInvoice, useComputeInvoice,
} from '../hooks'
import type {
  Invoice, FormLine, DiscountType, InvoiceType,
  CreateInvoicePayload, ComputeWarning, ComputeWarningType,
} from '../types'
import { lineToFormLine, makeBlankLine, computeDocumentTotals } from '@/lib/document-math'
import { ROUTES } from '@/lib/constants'
import { formatXAF } from '@/lib/utils'
import { useSettings } from '@/features/settings/hooks'

// ─── Types ─────────────────────────────────────────────────────

interface InvoiceFormProps {
  invoice?: Invoice
  defaultClientId?: string
  defaultType?: InvoiceType
  defaultProformaId?: string
  defaultParentInvoiceId?: string
}

interface FormState {
  type: InvoiceType
  clientId: string
  issueDate: string
  dueDate: string
  subject: string
  clientReference: string
  notes: string
  paymentConditions: string
  globalDiscountType: DiscountType
  globalDiscountValue: number
  acomptePercentage: number
  parentInvoiceId: string
  lines: FormLine[]
}

// ─── Helpers ───────────────────────────────────────────────────

const today     = () => format(new Date(), 'yyyy-MM-dd')
const in30days  = () => {
  const d = new Date(); d.setDate(d.getDate() + 30); return format(d, 'yyyy-MM-dd')
}

function initForm(invoice?: Invoice, opts?: Omit<InvoiceFormProps, 'invoice'>): FormState {
  if (invoice) {
    return {
      type:                invoice.type,
      clientId:            invoice.clientId,
      issueDate:           format(parseISO(invoice.issueDate), 'yyyy-MM-dd'),
      dueDate:             format(parseISO(invoice.dueDate), 'yyyy-MM-dd'),
      subject:             invoice.subject          ?? '',
      clientReference:     invoice.clientReference  ?? '',
      notes:               invoice.notes            ?? '',
      paymentConditions:   invoice.paymentConditions ?? '',
      globalDiscountType:  invoice.globalDiscountType,
      globalDiscountValue: Number(invoice.globalDiscountValue),
      acomptePercentage:   invoice.acomptePercentage ?? 30,
      parentInvoiceId:     invoice.parentInvoiceId  ?? '',
      lines:               invoice.lines.map(lineToFormLine),
    }
  }
  return {
    type:                opts?.defaultType          ?? 'standard',
    clientId:            opts?.defaultClientId      ?? '',
    issueDate:           today(),
    dueDate:             in30days(),
    subject:             '',
    clientReference:     '',
    notes:               '',
    paymentConditions:   '',
    globalDiscountType:  'none',
    globalDiscountValue: 0,
    acomptePercentage:   30,
    parentInvoiceId:     opts?.defaultParentInvoiceId ?? '',
    lines:               [makeBlankLine(0)],
  }
}

// ─── Field label ───────────────────────────────────────────────

const FL = ({ label, required }: { label: string; required?: boolean }) => (
  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5 }}>
    {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
  </label>
)

// ─── Warning bar ───────────────────────────────────────────────

const WARNING_ICONS: Record<ComputeWarningType, typeof AlertTriangle> = {
  CLIENT_UNPAID_BALANCE:       AlertTriangle,
  UNUSUAL_AMOUNT:              AlertCircle,
  DUPLICATE_RISK:              AlertTriangle,
  DUPLICATE_CLIENT_REFERENCE:  XCircle,
}

const WARNING_COLORS: Record<ComputeWarningType, string> = {
  CLIENT_UNPAID_BALANCE:       '#d97706',
  UNUSUAL_AMOUNT:              '#0284c7',
  DUPLICATE_RISK:              '#d97706',
  DUPLICATE_CLIENT_REFERENCE:  '#ef4444',
}

function ComputeWarnings({ warnings }: { warnings: ComputeWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {warnings.map((w, i) => {
        const Icon  = WARNING_ICONS[w.type] ?? AlertCircle
        const color = WARNING_COLORS[w.type] ?? '#d97706'
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '9px 14px',
            background: `${color}0f`,
            border: `1px solid ${color}33`,
            borderRadius: 'var(--radius-md)',
          }}>
            <Icon size={14} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
              {w.message}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Quick Fill Banner ──────────────────────────────────────────

function QuickFillBanner({ clientId, onApply }: { clientId: string; onApply: (cond: string) => void }) {
  const { data } = useClientQuickFill(clientId)
  if (!data) return null

  const behavior = data.paymentBehavior
  const isOnTime = behavior?.onTimeRate != null && behavior.onTimeRate >= 80
  const isLate   = behavior?.avgDaysLate != null && behavior.avgDaysLate > 5
  const hasConds = !!data.lastPaymentConditions
  if (!isOnTime && !isLate && !hasConds && !data.unpaidBalance) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
      background: 'rgba(45,125,210,0.05)', border: '1px solid rgba(45,125,210,0.2)',
      borderRadius: 'var(--radius-md)',
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
        {data.unpaidBalance > 0 && (
          <p style={{ margin: '0 0 3px', color: '#d97706' }}>
            Solde impayé existant : <strong>{formatXAF(data.unpaidBalance)}</strong>
          </p>
        )}
        {data.lastPaymentConditions && (
          <button
            type="button"
            onClick={() => onApply(data.lastPaymentConditions!)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)', textDecoration: 'underline' }}
          >
            Appliquer conditions habituelles : « {data.lastPaymentConditions} »
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Type selector ─────────────────────────────────────────────

const TYPE_OPTS: { value: InvoiceType; label: string; color: string }[] = [
  { value: 'standard', label: 'Standard',  color: 'var(--primary)' },
  { value: 'acompte',  label: 'Acompte',   color: '#7c3aed' },
  { value: 'solde',    label: 'Solde',     color: '#0891b2' },
]

function TypeSelector({ value, onChange, disabled }: {
  value: InvoiceType; onChange: (t: InvoiceType) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TYPE_OPTS.map(opt => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13,
            fontFamily: 'var(--font-display)', fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer',
            border: `2px solid ${value === opt.value ? opt.color : 'var(--border)'}`,
            background: value === opt.value ? `${opt.color}15` : 'var(--surface)',
            color: value === opt.value ? opt.color : 'var(--text-3)',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Due date hint ──────────────────────────────────────────────

function DueDateHint({ dueDate }: { dueDate: string }) {
  try {
    const d    = parseISO(dueDate)
    const now  = new Date()
    const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
    if (diff < 0)  return <span style={{ color: '#ef4444', fontSize: 11.5, marginTop: 3, display: 'block' }}>⚠ Échéance dépassée de {Math.abs(diff)} jours</span>
    if (diff === 0) return <span style={{ color: '#d97706', fontSize: 11.5, marginTop: 3, display: 'block' }}>Échéance aujourd'hui</span>
    return <span style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 3, display: 'block' }}>Dans {diff} jour{diff > 1 ? 's' : ''}</span>
  } catch { return null }
}

// ─── Main form ─────────────────────────────────────────────────

export function InvoiceForm({ invoice, defaultClientId, defaultType, defaultProformaId, defaultParentInvoiceId }: InvoiceFormProps) {
  const isEdit = !!invoice

  const [form, setForm]         = useState<FormState>(() => initForm(invoice, { defaultClientId, defaultType, defaultParentInvoiceId }))
  const [warnings, setWarnings] = useState<ComputeWarning[]>([])
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsApplied         = useRef(false)

  const { data: settings } = useSettings()

  // Apply settings defaults once on new documents (not edit mode)
  useEffect(() => {
    if (isEdit || !settings || settingsApplied.current) return
    settingsApplied.current = true
    const due = new Date()
    due.setDate(due.getDate() + settings.defaultInvoiceDueDays)
    setForm(prev => ({
      ...prev,
      dueDate: format(due, 'yyyy-MM-dd'),
      lines: prev.lines.length === 1 && !prev.lines[0].designation
        ? [makeBlankLine(0, settings.defaultTaxRate)]
        : prev.lines,
    }))
  }, [settings, isEdit])

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const { data: clientsData } = useClients({ limit: 200, status: 'active' })
  const clients = clientsData?.data ?? []

  // Load acompte invoices for the client — needed for "solde" (deduction) and "acompte" (multi-versement link)
  const { data: acompteInvoicesData } = useInvoices(
    (form.type === 'solde' || form.type === 'acompte') && form.clientId
      ? { clientId: form.clientId, type: 'acompte', limit: 50 }
      : undefined
  )
  const acompteInvoices = acompteInvoicesData?.data ?? []

  // Load full detail of the selected parent acompte (to copy its lines)
  const { data: parentAcompteDetail } = useInvoice(
    form.type === 'acompte' && form.parentInvoiceId ? form.parentInvoiceId : ''
  )

  const createMutation  = useCreateInvoice()
  const updateMutation  = useUpdateInvoice(invoice?.id ?? '')
  const issueMutation   = useIssueInvoice()
  const computeMutation = useComputeInvoice()

  const isPending = createMutation.isPending || updateMutation.isPending || issueMutation.isPending
  const canSave   = !!form.clientId && form.lines.length > 0 && form.lines.every(l => l.designation.trim()) && !!form.dueDate

  // Compute document totals for acompte hint
  const docTotals = useMemo(() =>
    computeDocumentTotals(form.lines, form.globalDiscountType, form.globalDiscountValue),
    [form.lines, form.globalDiscountType, form.globalDiscountValue]
  )

  // Debounced compute dry-run
  const triggerCompute = useCallback(() => {
    if (!form.clientId || form.lines.length === 0 || form.lines.some(l => !l.designation.trim())) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      computeMutation.mutate({
        clientId: form.clientId,
        lines: form.lines.map(l => ({
          quantity:      l.quantity,
          unitPriceHt:   l.unitPriceHt,
          discountType:  l.discountType,
          discountValue: l.discountValue,
          taxRate:       l.taxRate,
          designation:   l.designation,
        })),
        globalDiscountType:  form.globalDiscountType,
        globalDiscountValue: form.globalDiscountValue,
        clientReference:     form.clientReference || undefined,
      }, {
        onSuccess: (result) => setWarnings(result.warnings),
        onError:   () => {},
      })
    }, 800)
  }, [form.clientId, form.lines, form.globalDiscountType, form.globalDiscountValue, form.clientReference]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    triggerCompute()
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [triggerCompute])

  const buildPayload = (): CreateInvoicePayload => ({
    type:                form.type,
    clientId:            form.clientId,
    issueDate:           form.issueDate,
    dueDate:             form.dueDate,
    subject:             form.subject          || undefined,
    clientReference:     form.clientReference  || undefined,
    notes:               form.notes            || undefined,
    paymentConditions:   form.paymentConditions || undefined,
    globalDiscountType:  form.globalDiscountType,
    globalDiscountValue: form.globalDiscountValue,
    ...(form.type === 'acompte' && { acomptePercentage: form.acomptePercentage }),
    // Acompte : parentInvoiceId optionnel pour les 2ème/3ème versements (multi-acomptes)
    ...(form.type === 'acompte' && form.parentInvoiceId && { parentInvoiceId: form.parentInvoiceId }),
    ...(form.type === 'solde'   && form.parentInvoiceId && { parentInvoiceId: form.parentInvoiceId }),
    ...(defaultProformaId && !isEdit && { proformaId: defaultProformaId }),
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

  const handleDraft = () => {
    const payload = buildPayload()
    if (isEdit) updateMutation.mutate(payload)
    else        createMutation.mutate(payload)
  }

  const handleIssue = () => {
    const payload = buildPayload()
    if (isEdit) {
      updateMutation.mutate(payload, {
        onSuccess: () => issueMutation.mutate(invoice!.id),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => issueMutation.mutate(created.id),
      })
    }
  }

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const focusOn  = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--primary)';
    (e.target as HTMLElement).style.boxShadow   = '0 0 0 3px var(--primary-light)'
  }
  const focusOff = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'var(--border)';
    (e.target as HTMLElement).style.boxShadow   = 'none'
  }

  const sectionTitle = (t: string) => (
    <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
      {t}
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <Link href={ROUTES.INVOICES} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 4 }}>
            <ChevronLeft size={13} /> Factures
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {isEdit ? 'Modifier la facture' : 'Nouvelle facture'}
            </h1>
            {!isEdit && <TypeSelector value={form.type} onChange={(t) => setF('type', t)} />}
          </div>
          {isEdit ? (
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° {invoice.number}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              N° attribué automatiquement à l'émission
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={handleDraft}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: 13.5,
              cursor: (!canSave || isPending) ? 'not-allowed' : 'pointer',
              opacity: (!canSave || isPending) ? 0.6 : 1,
              fontFamily: 'var(--font-display)', fontWeight: 500,
            }}
          >
            {(createMutation.isPending || updateMutation.isPending) && !issueMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Save size={14} />
            }
            Sauvegarder brouillon
          </button>

          <button
            type="button"
            disabled={!canSave || isPending}
            onClick={handleIssue}
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
            {issueMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Zap size={14} />
            }
            {isEdit ? 'Enregistrer & Émettre' : 'Créer & Émettre'}
          </button>
        </div>
      </div>

      {/* ── Body: 2-column grid ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Général */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Informations générales')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Type (edit mode) */}
              {isEdit && (
                <div>
                  <FL label="Type de facture" />
                  <div style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
                      {invoice.type.charAt(0).toUpperCase() + invoice.type.slice(1)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>(non modifiable)</span>
                  </div>
                </div>
              )}

              {/* Client */}
              <div>
                <FL label="Client" required />
                <select
                  value={form.clientId}
                  onChange={(e) => setF('clientId', e.target.value)}
                  disabled={isEdit}
                  style={{ ...inputCss, cursor: isEdit ? 'default' : 'pointer', opacity: isEdit ? 0.7 : 1 }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {form.clientId && !isEdit && (
                <QuickFillBanner
                  clientId={form.clientId}
                  onApply={(cond) => setF('paymentConditions', cond)}
                />
              )}

              {/* Subject */}
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

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL label="Date d'émission" />
                  <input
                    type="date" value={form.issueDate}
                    onChange={(e) => setF('issueDate', e.target.value)}
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <FL label="Échéance" required />
                  <input
                    type="date" value={form.dueDate}
                    onChange={(e) => setF('dueDate', e.target.value)}
                    required
                    style={inputCss} onFocus={focusOn} onBlur={focusOff}
                  />
                  <DueDateHint dueDate={form.dueDate} />
                </div>
              </div>

              {/* Client reference */}
              <div>
                <FL label="Référence client (N° BC)" />
                <input
                  type="text" value={form.clientReference}
                  onChange={(e) => setF('clientReference', e.target.value)}
                  placeholder="Ex: BC-2024-0042"
                  style={inputCss} onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Proforma ref (readonly) */}
              {(defaultProformaId || invoice?.proformaId) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(45,125,210,0.15)' }}>
                  <FileText size={13} style={{ color: 'var(--primary)' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                    Convertie depuis une proforma
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Acompte % panel */}
          {form.type === 'acompte' && (
            <div className="card" style={{ padding: '18px 20px', border: '1.5px solid rgba(124,58,237,0.2)', background: 'rgba(124,58,237,0.02)' }}>
              {sectionTitle('Acompte')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Pourcentage */}
                <div>
                  <FL label="Pourcentage d'acompte" required />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range" min="1" max="99" value={form.acomptePercentage}
                      onChange={(e) => setF('acomptePercentage', parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: '#7c3aed' }}
                    />
                    <input
                      type="number" min="1" max="99" value={form.acomptePercentage}
                      onChange={(e) => setF('acomptePercentage', Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
                      style={{ width: 72, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7c3aed', outline: 'none', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>%</span>
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                    Détail HT / TVA / TTC visible dans le récapitulatif →
                  </p>
                </div>

                {/* Liaison multi-acomptes — toujours visible si client sélectionné */}
                {form.clientId && (
                  <div style={{ borderTop: '1px solid rgba(124,58,237,0.15)', paddingTop: 14 }}>
                    <FL label="Versement additionnel (projet multi-acomptes)" />
                    <select
                      value={form.parentInvoiceId}
                      onChange={(e) => setF('parentInvoiceId', e.target.value)}
                      style={{ ...inputCss, cursor: 'pointer' }}
                      onFocus={focusOn} onBlur={focusOff}
                    >
                      <option value="">— 1er acompte (aucun lien) —</option>
                      {acompteInvoices.length === 0
                        ? []
                        : acompteInvoices.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} — {formatXAF(Number(inv.totalTtc))} ({
                                inv.status === 'paid'           ? '✓ payé' :
                                inv.status === 'partially_paid' ? 'part. payé' :
                                inv.status === 'issued'         ? 'émis' : inv.status
                              })
                            </option>
                          ))
                      }
                    </select>
                    {acompteInvoices.length === 0 && form.clientId && (
                      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                        Aucun acompte existant pour ce client — ce sera le 1er versement.
                      </p>
                    )}
                    {form.parentInvoiceId && (
                      <p style={{ fontSize: 11.5, color: '#7c3aed', marginTop: 4 }}>
                        Ce versement sera groupé avec l'acompte lié lors de la facturation du solde.
                      </p>
                    )}

                    {/* Bouton copier les lignes du parent */}
                    {form.parentInvoiceId && parentAcompteDetail?.lines && parentAcompteDetail.lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setF('lines', parentAcompteDetail.lines.map(lineToFormLine))}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          marginTop: 10, padding: '7px 13px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1.5px solid rgba(124,58,237,0.35)',
                          background: 'rgba(124,58,237,0.06)',
                          color: '#7c3aed', fontSize: 12.5, cursor: 'pointer',
                          fontFamily: 'var(--font-display)', fontWeight: 600,
                        }}
                      >
                        <Copy size={13} />
                        Reprendre les lignes de {parentAcompteDetail.number}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Solde parent invoice */}
          {form.type === 'solde' && (() => {
            const parentAcompte   = acompteInvoices.find(i => i.id === form.parentInvoiceId)
            const siblingAcomptes = form.parentInvoiceId
              ? acompteInvoices.filter(i => i.parentInvoiceId === form.parentInvoiceId)
              : []
            const allLinked       = parentAcompte ? [parentAcompte, ...siblingAcomptes] : []
            const totalEncaisse   = allLinked.reduce((s, a) => s + Number(a.amountPaid), 0)
            const totalFacture    = allLinked.reduce((s, a) => s + Number(a.totalTtc), 0)
            const balanceRestante = allLinked.reduce((s, a) => s + Number(a.balanceDue), 0)

            const statusColor = (st: string) =>
              st === 'paid' ? '#16a34a' : st === 'partially_paid' ? '#d97706' : st === 'issued' ? '#2563eb' : '#64748b'
            const statusLabel = (st: string) =>
              st === 'paid' ? 'Payé' : st === 'partially_paid' ? 'Part. payé' : st === 'issued' ? 'Émis' : st === 'draft' ? 'Brouillon' : st

            return (
              <div className="card" style={{ padding: '18px 20px', border: '1.5px solid rgba(8,145,178,0.2)', background: 'rgba(8,145,178,0.02)' }}>
                {sectionTitle('Acompte(s) à déduire')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  <div>
                    <FL label="Acompte de référence (1er versement)" required />
                    <select
                      value={form.parentInvoiceId}
                      onChange={(e) => setF('parentInvoiceId', e.target.value)}
                      style={{ ...inputCss, cursor: 'pointer' }}
                      onFocus={focusOn} onBlur={focusOff}
                    >
                      <option value="">— Sélectionner l'acompte —</option>
                      {acompteInvoices
                        .filter(i => !i.parentInvoiceId) // seulement les acomptes "racine"
                        .map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.number} — {formatXAF(Number(inv.totalTtc))} ({statusLabel(inv.status)})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Tableau récap des acomptes liés */}
                  {allLinked.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid rgba(8,145,178,0.2)' }}>
                      {allLinked.map((inv, idx) => (
                        <div key={inv.id} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto auto',
                          gap: 8, alignItems: 'center',
                          padding: '9px 12px',
                          background: idx % 2 === 0 ? 'rgba(8,145,178,0.03)' : 'transparent',
                          borderBottom: idx < allLinked.length - 1 ? '1px solid rgba(8,145,178,0.1)' : 'none',
                        }}>
                          <div>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
                              {inv.number}
                            </span>
                            {idx > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>2ème versement</span>}
                          </div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: `${statusColor(inv.status)}18`, color: statusColor(inv.status), fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {statusLabel(inv.status)}
                          </span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0891b2', fontFamily: 'var(--font-mono)' }}>
                              {formatXAF(Number(inv.amountPaid))}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>encaissé</span>
                          </div>
                        </div>
                      ))}

                      {/* Total row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '10px 12px', background: 'rgba(8,145,178,0.08)', borderTop: '2px solid rgba(8,145,178,0.2)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                            Facturé : {formatXAF(totalFacture)}
                          </span>
                          {balanceRestante > 0 && (
                            <span style={{ fontSize: 11.5, color: '#d97706' }}>
                              ⚠ Impayé : {formatXAF(balanceRestante)}
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Total déduit</p>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0891b2', fontFamily: 'var(--font-mono)' }}>
                            {formatXAF(totalEncaisse)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Avertissement acompte non soldé */}
                  {parentAcompte && balanceRestante > 0 && (
                    <div style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.07)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>⚠</span>
                      <p style={{ fontSize: 12.5, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                        L'acompte n'est pas entièrement encaissé ({formatXAF(balanceRestante)} restant). Seuls les paiements reçus seront déduits du solde.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Conditions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            {sectionTitle('Conditions & Notes')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <FL label="Conditions de paiement" />
                <textarea
                  value={form.paymentConditions}
                  onChange={(e) => setF('paymentConditions', e.target.value)}
                  placeholder="Ex: Virement à 30 jours date facture"
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

          {/* Compute warnings */}
          {warnings.length > 0 && <ComputeWarnings warnings={warnings} />}

          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                Lignes de produits / services
              </p>
              {computeMutation.isPending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-3)' }}>
                  <Loader2 size={11} className="animate-spin" /> Vérification…
                </div>
              )}
            </div>
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
                onGlobalDiscountTypeChange={(t) => setF('globalDiscountType', t as DiscountType)}
                onGlobalDiscountValueChange={(v) => setF('globalDiscountValue', v)}
                invoiceType={form.type}
                acomptePercentage={form.acomptePercentage}
              />
            </div>
          </div>

          {/* Validation hint */}
          {form.lines.some(l => !l.designation.trim()) && (
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
