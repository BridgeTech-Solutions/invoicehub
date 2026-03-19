'use client'

import { useState, useEffect } from 'react'
import { Mail, Eye, Loader2, Check, X, ChevronDown, ChevronUp, Tag, Bell, Shield, Plus, Trash2 } from 'lucide-react'
import {
  useEmailTemplates, useEmailTemplate, useUpdateEmailTemplate,
} from '@/features/email-templates/hooks'
import {
  useNotificationSettings, useUpdateNotificationSettings,
} from '@/features/notifications/hooks'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { TEMPLATE_VARIABLES } from '@/features/email-templates/types'
import type { NotificationType } from '@/features/notifications/types'
import type { EmailTemplate } from '@/features/email-templates/types'
import type { UpdateSettingsPayload, ReminderEscalationLevel } from '@/features/settings/types'

// ─── Notification type labels ─────────────────────────────────
const NOTIF_LABELS: Record<NotificationType, string> = {
  proforma_sent:          'Proforma envoyée',
  proforma_accepted:      'Proforma acceptée',
  proforma_rejected:      'Proforma rejetée',
  proforma_expired:       'Proforma expirée',
  invoice_issued:         'Facture émise',
  invoice_paid:           'Facture soldée',
  invoice_partially_paid: 'Paiement partiel reçu',
  invoice_overdue:        'Facture en retard',
  payment_registered:     'Paiement enregistré',
  reminder_sent:          'Relance envoyée',
  user_created:           'Nouveau utilisateur créé',
  system:                 'Événement système',
}

const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>{subtitle}</p>}
    </div>
  )
}

// ─── Notification settings section ───────────────────────────
function NotifSettingsSection() {
  const { data: settings = [], isLoading } = useNotificationSettings()
  const updateMut = useUpdateNotificationSettings()
  const [local, setLocal] = useState<Record<string, { inApp: boolean; email: boolean }>>({})
  const [dirty, setDirty] = useState(false)

  const effective = (type: NotificationType) => {
    const server = settings.find((s) => s.type === type)
    return local[type] ?? { inApp: server?.inApp ?? true, email: server?.email ?? false }
  }

  function toggle(type: NotificationType, key: 'inApp' | 'email') {
    const cur = effective(type)
    setLocal((prev) => ({ ...prev, [type]: { ...cur, [key]: !cur[key] } }))
    setDirty(true)
  }

  async function handleSave() {
    const merged = (Object.keys(NOTIF_LABELS) as NotificationType[]).map((type) => ({
      type,
      ...effective(type),
    }))
    await updateMut.mutateAsync(merged)
    setDirty(false)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--primary)' }}><Mail size={15} /></div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Préférences de notifications</h2>
        </div>
        {dirty && (
          <button type="button" onClick={handleSave} disabled={updateMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {updateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Sauvegarder
          </button>
        )}
      </div>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 12, padding: '0 8px', marginBottom: 8 }}>
        {['Événement', 'Dans l\'app', 'Email'].map((h) => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h === 'Événement' ? 'left' : 'center' }}>{h}</span>
        ))}
      </div>
      {isLoading
        ? Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6 }} className="animate-pulse" />)
        : (Object.keys(NOTIF_LABELS) as NotificationType[]).map((type) => {
          const s = effective(type)
          return (
            <div key={type} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 12, padding: '10px 8px', borderRadius: 'var(--radius-md)', transition: 'background 0.1s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{NOTIF_LABELS[type]}</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.inApp} onChange={() => toggle(type, 'inApp')} style={{ display: 'none' }} />
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: s.inApp ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 2, left: s.inApp ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                  </div>
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.email} onChange={() => toggle(type, 'email')} style={{ display: 'none' }} />
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: s.email ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 2, left: s.email ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                  </div>
                </label>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

// ─── Rappels & escalade section ───────────────────────────────
function RappelsSection() {
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()

  const [form, setForm] = useState<Pick<UpdateSettingsPayload, 'autoReminderDays' | 'reminderEscalation'>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      autoReminderDays:   settings.autoReminderDays ?? [],
      // La DB stocke {} par défaut — normaliser en { levels: [] }
      reminderEscalation: { levels: settings.reminderEscalation?.levels ?? [] },
    })
    setDirty(false)
  }, [settings])

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // Reminder days
  const reminderDays = (form.autoReminderDays ?? []) as number[]
  function addDay() { setField('autoReminderDays', [...reminderDays, 7]) }
  function setDay(i: number, v: number) { setField('autoReminderDays', reminderDays.map((d, idx) => idx === i ? v : d)) }
  function removeDay(i: number) { setField('autoReminderDays', reminderDays.filter((_, idx) => idx !== i)) }

  // Escalation levels
  const levels: ReminderEscalationLevel[] = form.reminderEscalation?.levels ?? []
  function addLevel() {
    setField('reminderEscalation', {
      levels: [...levels, { daysOverdue: 0, label: 'Niveau ' + (levels.length + 1), notifyCreator: true, notifyManagers: false, sendEmail: true }],
    })
  }
  function updateLevel(i: number, patch: Partial<ReminderEscalationLevel>) {
    setField('reminderEscalation', { levels: levels.map((l, idx) => idx === i ? { ...l, ...patch } : l) })
  }
  function removeLevel(i: number) {
    setField('reminderEscalation', { levels: levels.filter((_, idx) => idx !== i) })
  }

  async function handleSave() {
    const payload = {
      ...form,
      // Filtrer les valeurs NaN/0 qui viendraient d'un input vidé temporairement
      autoReminderDays: (form.autoReminderDays ?? []).filter(
        (d) => Number.isInteger(d) && d > 0,
      ),
    }
    await updateMut.mutateAsync(payload)
    setDirty(false)
  }

  if (isLoading) return (
    <div className="card">
      <div style={{ height: 200, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Jours de relance */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: 'var(--primary)' }}><Bell size={15} /></div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Jours de relance automatique</h2>
          </div>
          {dirty && (
            <button type="button" onClick={handleSave} disabled={updateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {updateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Sauvegarder
            </button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
          Relances envoyées aux équipes BTS aux jours X après émission d&apos;une facture impayée (ex : J+7, J+15, J+30).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {reminderDays.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>J+</span>
              <input
                type="number" min={1} max={365} value={d}
                onChange={(e) => setDay(i, parseInt(e.target.value, 10))}
                style={{ ...inputCss, width: 56, padding: '3px 6px', textAlign: 'center', fontSize: 13 }}
              />
              <button type="button" onClick={() => removeDay(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, lineHeight: 1, display: 'flex' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addDay}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.4)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <Plus size={11} /> Ajouter
          </button>
        </div>
      </div>

      {/* Niveaux d'escalade */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: 'var(--primary)' }}><Shield size={15} /></div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Niveaux d&apos;escalade des rappels</h2>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>
              Définissez qui est notifié selon le nombre de jours de retard
            </p>
          </div>
          {dirty && (
            <button type="button" onClick={handleSave} disabled={updateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {updateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Sauvegarder
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto auto 32px', gap: 10, padding: '0 4px' }}>
            {['Jours', 'Libellé', 'Créateur', 'Managers', 'Email', ''].map((h) => (
              <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>
          {levels.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
              Aucun niveau configuré — ajoutez un premier niveau ci-dessous.
            </p>
          )}
          {levels.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto auto 32px', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>J+</span>
                <input type="number" min={0} max={365} value={l.daysOverdue}
                  onChange={(e) => updateLevel(i, { daysOverdue: parseInt(e.target.value, 10) })}
                  style={{ ...inputCss, padding: '6px 8px', textAlign: 'center', fontSize: 13 }} />
              </div>
              <input value={l.label} onChange={(e) => updateLevel(i, { label: e.target.value })}
                placeholder="Libellé du niveau" style={{ ...inputCss, padding: '7px 10px' }} />
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={l.notifyCreator} onChange={(e) => updateLevel(i, { notifyCreator: e.target.checked })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={l.notifyManagers} onChange={(e) => updateLevel(i, { notifyManagers: e.target.checked })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={l.sendEmail} onChange={(e) => updateLevel(i, { sendEmail: e.target.checked })} />
              </label>
              <button type="button" onClick={() => removeLevel(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLevel}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.4)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, alignSelf: 'flex-start' }}>
            <Plus size={12} /> Ajouter un niveau d&apos;escalade
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single template editor ───────────────────────────────────
function TemplateEditor({ template }: { template: EmailTemplate }) {
  const [expanded, setExpanded] = useState(false)
  const { data: full, isLoading } = useEmailTemplate(expanded ? template.id : '')
  const updateMut = useUpdateEmailTemplate(template.id)

  const [subject, setSubject] = useState(template.subject)
  const [body, setBody]       = useState('')
  const [dirty, setDirty]     = useState(false)

  // Sync body once full template loads
  useEffect(() => {
    if (full && body === '') setBody(full.bodyHtml)
  }, [full])

  const vars = TEMPLATE_VARIABLES[template.type] ?? []

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--surface)', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={14} style={{ color: 'var(--primary)' }} />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{template.name}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '1px 0 0', fontFamily: 'var(--font-mono)' }}>{template.type}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: template.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: template.isActive ? '#10b981' : '#6b7280', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {template.isActive ? 'Actif' : 'Inactif'}
          </span>
          {expanded ? <ChevronUp size={15} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-3)' }} />}
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading
            ? <div style={{ height: 200, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
            : (
              <>
                {/* Variables */}
                {vars.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(45,125,210,0.15)' }}>
                    <Tag size={12} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>Variables disponibles :</span>
                    {vars.map((v) => (
                      <code key={v} style={{ fontSize: 11.5, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{v}</code>
                    ))}
                  </div>
                )}

                {/* Subject */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Objet de l&apos;email</label>
                  <input
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setDirty(true) }}
                    style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Body HTML */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Corps HTML</label>
                  <textarea
                    value={body || full?.bodyHtml || ''}
                    onChange={(e) => { setBody(e.target.value); setDirty(true) }}
                    rows={10}
                    style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setExpanded(false); setDirty(false) }}
                    style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                    Fermer
                  </button>
                  <button type="button"
                    disabled={!dirty || updateMut.isPending}
                    onClick={() => updateMut.mutate({ subject, bodyHtml: body || full?.bodyHtml }, { onSuccess: () => setDirty(false) })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: dirty ? 'var(--primary)' : 'var(--surface-2)', color: dirty ? '#fff' : 'var(--text-3)', cursor: dirty ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {updateMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Sauvegarder
                  </button>
                </div>
              </>
            )
          }
        </div>
      )}
    </div>
  )
}

// ─── Email templates section ───────────────────────────────────
function EmailTemplatesSection() {
  const { data: templates = [], isLoading } = useEmailTemplates()

  return (
    <div className="card">
      <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--primary)' }}><Mail size={15} /></div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Templates d&apos;emails</h2>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>Personnalisez les emails envoyés automatiquement. Utilisez les variables entre {'{{'} et {'}}'}.</p>
      </div>
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 48, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6 }} className="animate-pulse" />)
        : templates.length === 0
          ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '0 0 6px' }}>Aucun template en base.</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                Exécutez <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>pnpm prisma:seed</code> dans le répertoire backend pour insérer les templates par défaut.
              </p>
            </div>
          )
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map((t) => <TemplateEditor key={t.id} template={t} />)}
            </div>
          )
      }
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function NotificationsSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <NotifSettingsSection />
      <RappelsSection />
      <EmailTemplatesSection />
    </div>
  )
}
