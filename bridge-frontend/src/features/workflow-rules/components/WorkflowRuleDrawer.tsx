'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, Zap, Plus, Trash2, Save } from 'lucide-react'
import { useCreateWorkflowRule } from '../hooks'
import { WORKFLOW_MODULES, TRIGGER_EVENTS, ACTION_TYPES } from '../types'
import type { WorkflowAction } from '../types'

interface WorkflowRuleDrawerProps {
  onClose: () => void
}

const EMPTY_ACTION: WorkflowAction = { type: '', config: {} }

// ── Champs de config par type d'action ───────────────────────
function ActionConfigFields({
  actionType,
  config,
  onChange,
}: {
  actionType: string
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
    boxSizing: 'border-box',
  }

  if (actionType === 'send_notification') {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Message de la notification
        </label>
        <input
          style={inputStyle}
          placeholder="Ex : La facture {number} est en retard"
          value={(config.message as string) ?? ''}
          onChange={(e) => onChange({ ...config, message: e.target.value })}
        />
      </div>
    )
  }

  if (actionType === 'send_email') {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Destinataire (email ou rôle)
        </label>
        <input
          style={inputStyle}
          placeholder="Ex : admin ou contact@client.com"
          value={(config.to as string) ?? ''}
          onChange={(e) => onChange({ ...config, to: e.target.value })}
        />
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Sujet
        </label>
        <input
          style={inputStyle}
          placeholder="Ex : Facture {number} en retard de paiement"
          value={(config.subject as string) ?? ''}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
        />
      </div>
    )
  }

  if (actionType === 'send_webhook') {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          URL du webhook
        </label>
        <input
          type="url"
          style={inputStyle}
          placeholder="https://..."
          value={(config.url as string) ?? ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
        />
      </div>
    )
  }

  if (actionType === 'change_status') {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Nouveau statut
        </label>
        <input
          style={inputStyle}
          placeholder="Ex : cancelled, overdue…"
          value={(config.status as string) ?? ''}
          onChange={(e) => onChange({ ...config, status: e.target.value })}
        />
      </div>
    )
  }

  return null
}

export function WorkflowRuleDrawer({ onClose }: WorkflowRuleDrawerProps) {
  const titleId  = useId()
  const formId   = useId()
  const createMut = useCreateWorkflowRule()

  const [isVisible, setIsVisible] = useState(false)
  const [name,      setName]      = useState('')
  const [module,    setModule]    = useState('')
  const [event,     setEvent]     = useState('')
  const [actions,   setActions]   = useState<WorkflowAction[]>([{ ...EMPTY_ACTION }])
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  // Slide-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Reset event when module changes
  useEffect(() => { setEvent('') }, [module])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  function addAction() {
    setActions((prev) => [...prev, { ...EMPTY_ACTION }])
  }

  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateActionType(i: number, type: string) {
    setActions((prev) => prev.map((a, idx) => idx === i ? { type, config: {} } : a))
  }

  function updateActionConfig(i: number, config: Record<string, unknown>) {
    setActions((prev) => prev.map((a, idx) => idx === i ? { ...a, config } : a))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim())  errs.name   = 'Le nom est requis'
    if (!module)       errs.module = 'Le module est requis'
    if (!event)        errs.event  = "L'événement déclencheur est requis"
    if (actions.length === 0)             errs.actions = 'Au moins une action est requise'
    if (actions.some((a) => !a.type))     errs.actions = 'Choisir un type pour chaque action'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    createMut.mutate(
      { name: name.trim(), entityType: module, triggerEvent: event, actions, isActive: true },
      { onSuccess: () => handleClose() },
    )
  }

  const availableEvents = TRIGGER_EVENTS[module] ?? []

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
    appearance: 'none', boxSizing: 'border-box',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
    fontFamily: 'var(--font-display)', display: 'block', marginBottom: 5,
  }
  const errorStyle: React.CSSProperties = {
    fontSize: 11.5, color: '#ef4444', marginTop: 3,
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)',
          opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: Math.min(520, typeof window !== 'undefined' ? window.innerWidth : 520),
          background: 'var(--surface)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Navy → primary gradient stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 'var(--topbar-h)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(45,125,210,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            </span>
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}
            >
              Nouvelle règle workflow
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            style={{
              width: 32, height: 32, border: '1.5px solid var(--border)', borderRadius: 8,
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)',
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Form body */}
        <form id={formId} onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* Nom */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="rule-name" style={labelStyle}>Nom de la règle *</label>
            <input
              id="rule-name"
              style={{ ...inputStyle, borderColor: errors.name ? '#ef4444' : 'var(--border)' }}
              placeholder="Ex : Notification facture en retard"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p style={errorStyle}>{errors.name}</p>}
          </div>

          {/* Module + Événement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label htmlFor="rule-module" style={labelStyle}>Module *</label>
              <select
                id="rule-module"
                style={{ ...selectStyle, borderColor: errors.module ? '#ef4444' : 'var(--border)' }}
                value={module}
                onChange={(e) => setModule(e.target.value)}
              >
                <option value="">Choisir…</option>
                {WORKFLOW_MODULES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {errors.module && <p style={errorStyle}>{errors.module}</p>}
            </div>

            <div>
              <label htmlFor="rule-event" style={labelStyle}>Événement déclencheur *</label>
              <select
                id="rule-event"
                style={{ ...selectStyle, borderColor: errors.event ? '#ef4444' : 'var(--border)' }}
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                disabled={!module}
              >
                <option value="">Choisir…</option>
                {availableEvents.map((ev) => (
                  <option key={ev.value} value={ev.value}>{ev.label}</option>
                ))}
              </select>
              {errors.event && <p style={errorStyle}>{errors.event}</p>}
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border)', margin: '0 0 20px' }} />

          {/* Actions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
                Actions à déclencher *
              </p>
              <button
                type="button"
                onClick={addAction}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 8,
                  border: '1.5px solid var(--border)', background: 'transparent',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  fontFamily: 'var(--font-display)', color: 'var(--primary)',
                }}
              >
                <Plus size={12} aria-hidden="true" />
                Ajouter
              </button>
            </div>

            {errors.actions && (
              <p style={{ ...errorStyle, marginBottom: 10 }}>{errors.actions}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {actions.map((action, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14, borderRadius: 10,
                    border: '1.5px solid var(--border)',
                    background: 'var(--surface-2)',
                    position: 'relative',
                  }}
                >
                  {/* Remove action */}
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAction(i)}
                      aria-label="Supprimer cette action"
                      style={{
                        position: 'absolute', top: 10, right: 10,
                        width: 26, height: 26, borderRadius: 6,
                        border: '1px solid var(--border)', background: 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-3)',
                      }}
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  )}

                  <label style={{ ...labelStyle, marginBottom: 6 }}>
                    Type d'action {i + 1}
                  </label>
                  <select
                    style={{ ...selectStyle, background: 'var(--surface)' }}
                    value={action.type}
                    onChange={(e) => updateActionType(i, e.target.value)}
                  >
                    <option value="">Choisir un type…</option>
                    {ACTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>

                  {action.type && (
                    <ActionConfigFields
                      actionType={action.type}
                      config={action.config}
                      onChange={(cfg) => updateActionConfig(i, cfg)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-display)', color: 'var(--text-2)',
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            form={formId}
            disabled={createMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#fff',
              cursor: createMut.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
              opacity: createMut.isPending ? 0.7 : 1,
            }}
          >
            <Save size={14} aria-hidden="true" />
            {createMut.isPending ? 'Enregistrement…' : 'Créer la règle'}
          </button>
        </div>
      </div>
    </>
  )
}
