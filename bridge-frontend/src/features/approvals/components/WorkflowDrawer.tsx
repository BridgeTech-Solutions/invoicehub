'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, Plus, Trash2, Settings2, ChevronUp, ChevronDown } from 'lucide-react'
import { useCreateApprovalWorkflow, useUpdateApprovalWorkflow } from '../hooks'
import { useRoles } from '@/features/users/hooks'
import type { ApprovalWorkflow, CreateWorkflowPayload, ApprovalTriggerOperator, ApprovalDocumentType } from '../types'
import { DOCUMENT_TYPE_LABELS, OPERATOR_LABELS, TRIGGER_FIELD_LABELS } from '../types'

const DOCUMENT_TYPES: { value: ApprovalDocumentType; label: string }[] = [
  { value: 'invoice',          label: 'Facture' },
  { value: 'proforma',         label: 'Proforma' },
  { value: 'purchase_order',   label: 'Bon de commande' },
  { value: 'supplier_invoice', label: 'Facture fournisseur' },
  { value: 'expense',          label: 'Dépense' },
]

const TRIGGER_FIELDS: Record<ApprovalDocumentType, { value: string; label: string }[]> = {
  invoice:          [{ value: 'totalTtc', label: 'Montant TTC' }, { value: 'totalHt', label: 'Montant HT' }, { value: 'type', label: 'Type de facture' }],
  proforma:         [{ value: 'totalTtc', label: 'Montant TTC' }, { value: 'totalHt', label: 'Montant HT' }],
  purchase_order:   [{ value: 'totalTtc', label: 'Montant TTC' }, { value: 'totalHt', label: 'Montant HT' }],
  supplier_invoice: [{ value: 'totalTtc', label: 'Montant TTC' }, { value: 'totalHt', label: 'Montant HT' }],
  expense:          [{ value: 'amountTtc', label: 'Montant TTC' }],
}

const OPERATORS: { value: ApprovalTriggerOperator; label: string }[] = [
  { value: 'gte', label: '≥' }, { value: 'lte', label: '≤' },
  { value: 'eq',  label: '=' }, { value: 'gt',  label: '>' }, { value: 'lt',  label: '<' },
]


interface WorkflowDrawerProps {
  workflow?: ApprovalWorkflow
  onClose:   () => void
}

interface TriggerDraft {
  documentType: ApprovalDocumentType
  field:        string
  operator:     ApprovalTriggerOperator
  value:        string
}

interface StepDraft {
  order:          number
  name:           string
  description:    string
  approverType:   'role' | 'user'
  approverRole:   string
  approverUserId: string
  deadlineHours:  string
  requireComment: boolean
  allowDelegate:  boolean
}

const defaultTrigger = (): TriggerDraft => ({
  documentType: 'invoice', field: 'totalTtc', operator: 'gte', value: '',
})

const defaultStep = (order: number): StepDraft => ({
  order, name: '', description: '', approverType: 'role', approverRole: 'admin',
  approverUserId: '', deadlineHours: '', requireComment: false, allowDelegate: true,
})

export function WorkflowDrawer({ workflow, onClose }: WorkflowDrawerProps) {
  const titleId = useId()
  const formId  = useId()

  const createMut = useCreateApprovalWorkflow()
  const updateMut = useUpdateApprovalWorkflow(workflow?.id ?? '')
  const { data: roles = [] } = useRoles()

  const [isVisible, setIsVisible] = useState(false)
  const [name,        setName]        = useState(workflow?.name ?? '')
  const [description, setDescription] = useState(workflow?.description ?? '')
  const [priority,    setPriority]    = useState(workflow?.priority ?? 0)
  const [isActive,    setIsActive]    = useState(workflow?.isActive ?? true)
  const [triggers, setTriggers] = useState<TriggerDraft[]>(
    workflow?.triggers.map((t) => ({
      documentType: t.documentType,
      field:        t.field,
      operator:     t.operator,
      value:        t.value,
    })) ?? [defaultTrigger()],
  )
  const [steps, setSteps] = useState<StepDraft[]>(
    workflow?.steps.map((s) => ({
      order:          s.order,
      name:           s.name,
      description:    s.description ?? '',
      approverType:   s.approverUserId ? 'user' : 'role',
      approverRole:   s.approverRole ?? 'admin',
      approverUserId: s.approverUserId ?? '',
      deadlineHours:  s.deadlineHours ? String(s.deadlineHours) : '',
      requireComment: s.requireComment,
      allowDelegate:  s.allowDelegate,
    })) ?? [defaultStep(1)],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [handleClose])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim())                   errs.name = 'Le nom est requis'
    if (triggers.length === 0)          errs.triggers = 'Au moins un déclencheur est requis'
    if (triggers.some((t) => !t.value)) errs.triggers = 'Toutes les valeurs de déclencheur sont requises'
    if (steps.length === 0)             errs.steps = 'Au moins une étape est requise'
    steps.forEach((s, i) => {
      if (!s.name.trim())                                              errs[`step_${i}_name`] = 'Nom requis'
      if (s.approverType === 'user' && !s.approverUserId.trim())      errs[`step_${i}_approver`] = 'ID approbateur requis'
      if (s.approverType === 'role' && !s.approverRole)               errs[`step_${i}_approver`] = 'Rôle requis'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function buildPayload(): CreateWorkflowPayload {
    return {
      name: name.trim(), description: description.trim() || undefined,
      isActive, priority,
      triggers: triggers.map((t) => ({ ...t })),
      steps: steps.map((s) => ({
        order:          s.order,
        name:           s.name.trim(),
        description:    s.description.trim() || undefined,
        approverRole:   s.approverType === 'role' ? s.approverRole : undefined,
        approverUserId: s.approverType === 'user' ? s.approverUserId.trim() : undefined,
        deadlineHours:  s.deadlineHours ? parseInt(s.deadlineHours, 10) : undefined,
        requireComment: s.requireComment,
        allowDelegate:  s.allowDelegate,
      })),
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const payload = buildPayload()
    if (workflow) {
      updateMut.mutate(payload, { onSuccess: handleClose })
    } else {
      createMut.mutate(payload, { onSuccess: handleClose })
    }
  }

  const addTrigger = () => setTriggers((prev) => [...prev, defaultTrigger()])
  const removeTrigger = (i: number) => setTriggers((prev) => prev.filter((_, idx) => idx !== i))
  const updateTrigger = <K extends keyof TriggerDraft>(i: number, key: K, val: TriggerDraft[K]) =>
    setTriggers((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: val } : t))

  const addStep = () => setSteps((prev) => [...prev, defaultStep(prev.length + 1)])
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 })))
  const moveStep = (i: number, dir: -1 | 1) => {
    const newSteps = [...steps]
    const j = i + dir
    if (j < 0 || j >= newSteps.length) return
    ;[newSteps[i], newSteps[j]] = [newSteps[j], newSteps[i]]
    setSteps(newSteps.map((s, idx) => ({ ...s, order: idx + 1 })))
  }
  const updateStep = <K extends keyof StepDraft>(i: number, key: K, val: StepDraft[K]) =>
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))

  const isPending = createMut.isPending || updateMut.isPending

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', appearance: 'none',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)',
    display: 'block', marginBottom: 4,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 10,
  }
  const errStyle: React.CSSProperties = { fontSize: 11.5, color: '#ef4444', marginTop: 3 }

  return (
    <>
      <div onClick={handleClose} aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease' }} />

      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: Math.min(580, typeof window !== 'undefined' ? window.innerWidth : 580),
          background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}>

        <div style={{ height: 3, background: 'linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 60, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings2 size={15} style={{ color: 'var(--primary)' }} />
            </span>
            <h2 id={titleId} style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
              {workflow ? 'Modifier le workflow' : 'Nouveau workflow d\'approbation'}
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer"
            style={{ width: 32, height: 32, border: '1.5px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form id={formId} onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* Section 1 — Infos générales */}
          <p style={sectionTitle}>1 — Informations générales</p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nom du workflow *</label>
            <input id="wf-name" style={{ ...inputStyle, borderColor: errors.name ? '#ef4444' : 'var(--border)' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Validation factures > 500 000 XAF" />
            {errors.name && <p style={errStyle}>{errors.name}</p>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optionnel)</span></label>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description courte du workflow…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Priorité <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 11 }}>(plus élevé = évalué en premier)</span></label>
              <input type="number" min={0} max={100} style={{ ...inputStyle, width: 80 }} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--text-2)' }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Workflow actif
              </label>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 0 20px' }} />

          {/* Section 2 — Déclencheurs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ ...sectionTitle, marginBottom: 0 }}>2 — Déclencheurs *</p>
            <button type="button" onClick={addTrigger}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
              <Plus size={12} /> Ajouter
            </button>
          </div>
          {errors.triggers && <p style={{ ...errStyle, marginBottom: 8 }}>{errors.triggers}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {triggers.map((trig, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)', position: 'relative' }}>
                {triggers.length > 1 && (
                  <button type="button" onClick={() => removeTrigger(i)} aria-label="Supprimer"
                    style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                    <Trash2 size={11} />
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>Type de document</label>
                    <select style={selectStyle} value={trig.documentType}
                      onChange={(e) => {
                        const dt = e.target.value as ApprovalDocumentType
                        const fields = TRIGGER_FIELDS[dt]
                        updateTrigger(i, 'documentType', dt)
                        updateTrigger(i, 'field', fields[0].value)
                      }}>
                      {DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Champ</label>
                    <select style={selectStyle} value={trig.field} onChange={(e) => updateTrigger(i, 'field', e.target.value)}>
                      {(TRIGGER_FIELDS[trig.documentType] ?? []).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Opérateur</label>
                    <select style={selectStyle} value={trig.operator} onChange={(e) => updateTrigger(i, 'operator', e.target.value as ApprovalTriggerOperator)}>
                      {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Valeur</label>
                    <input style={{ ...inputStyle, borderColor: !trig.value ? 'rgba(239,68,68,0.5)' : 'var(--border)' }} value={trig.value} onChange={(e) => updateTrigger(i, 'value', e.target.value)} placeholder="Ex : 500000" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 0 20px' }} />

          {/* Section 3 — Étapes */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ ...sectionTitle, marginBottom: 0 }}>3 — Étapes séquentielles *</p>
            <button type="button" onClick={addStep}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
              <Plus size={12} /> Ajouter
            </button>
          </div>
          {errors.steps && <p style={{ ...errStyle, marginBottom: 8 }}>{errors.steps}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)', position: 'relative' }}>
                {/* Controls */}
                <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Monter"
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: i === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', opacity: i === 0 ? 0.4 : 1 }}>
                    <ChevronUp size={12} />
                  </button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Descendre"
                    style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: i === steps.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', opacity: i === steps.length - 1 ? 0.4 : 1 }}>
                    <ChevronDown size={12} />
                  </button>
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(i)} aria-label="Supprimer"
                      style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>

                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                  Étape {step.order}
                </p>

                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Nom de l&apos;étape *</label>
                  <input style={{ ...inputStyle, borderColor: errors[`step_${i}_name`] ? '#ef4444' : 'var(--border)' }}
                    value={step.name} onChange={(e) => updateStep(i, 'name', e.target.value)} placeholder="Ex : Validation DAF" />
                  {errors[`step_${i}_name`] && <p style={errStyle}>{errors[`step_${i}_name`]}</p>}
                </div>

                {/* Approbateur */}
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Approbateur *</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {(['role', 'user'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => updateStep(i, 'approverType', t)}
                        style={{ padding: '4px 12px', borderRadius: 100, border: '1.5px solid', borderColor: step.approverType === t ? 'var(--primary)' : 'var(--border)', background: step.approverType === t ? 'var(--primary)' : 'transparent', color: step.approverType === t ? '#fff' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
                        {t === 'role' ? 'Par rôle' : 'Utilisateur spécifique'}
                      </button>
                    ))}
                  </div>
                  {step.approverType === 'role' ? (
                    <select style={{ ...selectStyle, borderColor: errors[`step_${i}_approver`] ? '#ef4444' : 'var(--border)' }}
                      value={step.approverRole} onChange={(e) => updateStep(i, 'approverRole', e.target.value)}>
                      {roles.map((r) => <option key={r.name} value={r.name}>{r.displayName}</option>)}
                    </select>
                  ) : (
                    <input style={{ ...inputStyle, borderColor: errors[`step_${i}_approver`] ? '#ef4444' : 'var(--border)' }}
                      value={step.approverUserId} onChange={(e) => updateStep(i, 'approverUserId', e.target.value)} placeholder="ID de l'utilisateur (UUID)" />
                  )}
                  {errors[`step_${i}_approver`] && <p style={errStyle}>{errors[`step_${i}_approver`]}</p>}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Délai max <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(heures, vide = illimité)</span></label>
                  <input type="number" min={1} max={720} style={{ ...inputStyle, width: 100 }} value={step.deadlineHours} onChange={(e) => updateStep(i, 'deadlineHours', e.target.value)} placeholder="48" />
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-body)', color: 'var(--text-2)' }}>
                    <input type="checkbox" checked={step.requireComment} onChange={(e) => updateStep(i, 'requireComment', e.target.checked)} />
                    Commentaire obligatoire
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-body)', color: 'var(--text-2)' }}>
                    <input type="checkbox" checked={step.allowDelegate} onChange={(e) => updateStep(i, 'allowDelegate', e.target.checked)} />
                    Délégation autorisée
                  </label>
                </div>
              </div>
            ))}
          </div>
        </form>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={handleClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--text-2)' }}>
            Annuler
          </button>
          <button type="submit" form={formId} disabled={isPending}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', opacity: isPending ? 0.7 : 1 }}>
            {isPending ? 'Enregistrement…' : workflow ? 'Mettre à jour' : 'Créer le workflow'}
          </button>
        </div>
      </div>
    </>
  )
}
