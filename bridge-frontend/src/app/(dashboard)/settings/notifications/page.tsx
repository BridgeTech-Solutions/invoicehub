'use client'

import { useState, useEffect, useId } from 'react'
import { Mail, Loader2, Check, X, ChevronDown, ChevronUp, Tag, Bell, Shield, Plus, Trash2 } from 'lucide-react'
import {
  useEmailTemplates, useEmailTemplate, useUpdateEmailTemplate,
} from '@/features/email-templates/hooks'
import {
  useNotificationSettings, useUpdateNotificationSettings,
} from '@/features/notifications/hooks'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { TEMPLATE_VARIABLES } from '@/features/email-templates/types'
import type { NotificationType, NotificationChannel } from '@/features/notifications/types'
import type { EmailTemplate } from '@/features/email-templates/types'
import type { UpdateSettingsPayload, ReminderEscalationLevel, CheckLevel } from '@/features/settings/types'

// ─── Notification type labels ─────────────────────────────────
const NOTIF_LABELS: Record<NotificationType, string> = {
  proforma_sent:           'Proforma envoyée',
  proforma_accepted:       'Proforma acceptée',
  proforma_rejected:       'Proforma rejetée',
  proforma_expired:        'Proforma expirée',
  invoice_issued:          'Facture émise',
  invoice_paid:            'Facture soldée',
  invoice_partially_paid:  'Paiement partiel reçu',
  invoice_overdue:         'Facture en retard',
  payment_registered:      'Paiement enregistré',
  reminder_sent:           'Relance envoyée',
  user_created:            'Nouveau utilisateur créé',
  expense_submitted:       'Dépense soumise pour approbation',
  expense_approved:        'Dépense approuvée',
  expense_rejected:        'Dépense rejetée',
  purchase_order_received: 'Bon de commande reçu fournisseur',
  supplier_invoice_due:    'Facture fournisseur à échéance',
  system:                  'Événement système',
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
        <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>{subtitle}</p>}
    </div>
  )
}

// ─── Accessible toggle switch ─────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <div aria-hidden="true" style={{ width: 36, height: 20, borderRadius: 10, background: checked ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
      </div>
    </label>
  )
}

// ─── Notification settings section ───────────────────────────
function NotifSettingsSection() {
  const { can } = usePermission()
  const { data: settings = [], isLoading } = useNotificationSettings()
  const updateMut = useUpdateNotificationSettings()
  const [local, setLocal] = useState<Record<string, { channel: NotificationChannel; enabled: boolean }>>({})
  const [dirty, setDirty] = useState(false)

  const effective = (type: NotificationType) => {
    const server = settings.find((s) => s.type === type)
    return local[type] ?? { channel: server?.channel ?? 'both' as NotificationChannel, enabled: server?.enabled ?? true }
  }

  function toggleEnabled(type: NotificationType) {
    const cur = effective(type)
    setLocal((prev) => ({ ...prev, [type]: { ...cur, enabled: !cur.enabled } }))
    setDirty(true)
  }

  function setChannel(type: NotificationType, channel: NotificationChannel) {
    const cur = effective(type)
    setLocal((prev) => ({ ...prev, [type]: { ...cur, channel } }))
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

  const CHANNELS: { value: NotificationChannel; label: string }[] = [
    { value: 'in_app', label: 'App' },
    { value: 'email',  label: 'Email' },
    { value: 'both',   label: 'Les deux' },
  ]

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Mail size={15} /></div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Préférences de notifications</h2>
        </div>
        {dirty && can('settings', 'update') && (
          <button type="button" onClick={handleSave} disabled={updateMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMut.isPending ? 0.65 : 1 }}>
            {updateMut.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />} Sauvegarder
          </button>
        )}
      </div>
      {/* Header */}
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '1fr 70px 196px', gap: 12, padding: '0 8px', marginBottom: 8 }}>
        {[{ label: 'Événement', align: 'left' }, { label: 'Actif', align: 'center' }, { label: 'Canal', align: 'left' }].map((h) => (
          <span key={h.label} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h.align as React.CSSProperties['textAlign'] }}>{h.label}</span>
        ))}
      </div>
      {isLoading
        ? Array.from({ length: 6 }).map((_, i) => <div key={i} aria-hidden="true" style={{ height: 40, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6 }} className="animate-pulse" />)
        : (Object.keys(NOTIF_LABELS) as NotificationType[]).map((type) => {
          const s = effective(type)
          return (
            <div key={type} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 196px', gap: 12, padding: '10px 8px', borderRadius: 'var(--radius-md)', transition: 'background 0.1s', alignItems: 'center' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 13.5, color: s.enabled ? 'var(--text-1)' : 'var(--text-3)' }}>{NOTIF_LABELS[type]}</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Toggle checked={s.enabled} onChange={() => toggleEnabled(type)} label={`Activer ${NOTIF_LABELS[type]}`} />
              </div>
              <div style={{ display: 'flex', gap: 4, opacity: s.enabled ? 1 : 0.35, pointerEvents: s.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                {CHANNELS.map((ch) => (
                  <button key={ch.value} type="button" onClick={() => setChannel(type, ch.value)}
                    style={{ padding: '3px 8px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${s.channel === ch.value ? 'var(--primary)' : 'var(--border)'}`, background: s.channel === ch.value ? 'var(--primary-light)' : 'transparent', color: s.channel === ch.value ? 'var(--primary)' : 'var(--text-3)', fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

// ─── Composant réutilisable pour les niveaux check / draft ────
function CheckLevelCard({
  title, subtitle, levels, onAdd, onUpdate, onRemove, dirty, saving, onSave,
}: {
  title:    string
  subtitle: string
  levels:   CheckLevel[]
  onAdd:    () => void
  onUpdate: (i: number, patch: Partial<CheckLevel>) => void
  onRemove: (i: number) => void
  dirty:    boolean
  saving:   boolean
  onSave:   () => void
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Bell size={15} /></div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>{subtitle}</p>
        </div>
        {dirty && (
          <button type="button" onClick={onSave} disabled={saving}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: saving ? 0.65 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />} Sauvegarder
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '100px auto auto 32px', gap: 10, padding: '0 4px' }}>
          {['Délai (jours)', 'Managers', 'Email', ''].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>
        {levels.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
            Aucun niveau configuré.
          </p>
        )}
        {levels.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px auto auto 32px', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} aria-hidden="true">J+</span>
              <input
                type="number" min={1} max={365} value={l.daysSince}
                aria-label={`Délai niveau ${i + 1} : J+`}
                onChange={(e) => onUpdate(i, { daysSince: parseInt(e.target.value, 10) })}
                style={{ padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' as const, textAlign: 'center' as const }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={l.notifyManagers}
                aria-label={`Notifier les managers — niveau ${i + 1}`}
                onChange={(e) => onUpdate(i, { notifyManagers: e.target.checked })}
              />
              <span className="sr-only">Managers</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 6, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={l.sendEmail}
                aria-label={`Envoyer un email — niveau ${i + 1}`}
                onChange={(e) => onUpdate(i, { sendEmail: e.target.checked })}
              />
              <span className="sr-only">Email</span>
            </label>
            <button type="button"
              aria-label={`Supprimer le niveau ${i + 1} — J+${l.daysSince}`}
              onClick={() => onRemove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
              onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
              onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={onAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.4)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, alignSelf: 'flex-start', minHeight: 44 }}>
          <Plus size={12} aria-hidden="true" /> Ajouter un niveau
        </button>
      </div>
    </div>
  )
}

// Valeurs par défaut côté frontend (miroir des DEFAULT_*_LEVELS backend)
const DEFAULT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 3,  notifyManagers: false, sendEmail: false },
  { daysSince: 7,  notifyManagers: false, sendEmail: true  },
  { daysSince: 15, notifyManagers: true,  sendEmail: true  },
]

const DEFAULT_DRAFT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 1, notifyManagers: false, sendEmail: false },
  { daysSince: 3, notifyManagers: false, sendEmail: false },
  { daysSince: 7, notifyManagers: true,  sendEmail: true  },
]

// ─── Rappels & escalade section ───────────────────────────────
function RappelsSection() {
  const { data: settings, isLoading } = useSettings()
  const updateMut = useUpdateSettings()

  const [form, setForm] = useState<Pick<UpdateSettingsPayload, 'autoReminderDays' | 'reminderEscalation'>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      autoReminderDays: settings.autoReminderDays ?? [],
      reminderEscalation: {
        levels:           settings.reminderEscalation?.levels           ?? [],
        checkLevels:      settings.reminderEscalation?.checkLevels      ?? DEFAULT_CHECK_LEVELS,
        draftCheckLevels: settings.reminderEscalation?.draftCheckLevels ?? DEFAULT_DRAFT_CHECK_LEVELS,
      },
    })
    setDirty(false)
  }, [settings])

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const reminderDays = (form.autoReminderDays ?? []) as number[]
  function addDay() { setField('autoReminderDays', [...reminderDays, 7]) }
  function setDay(i: number, v: number) { setField('autoReminderDays', reminderDays.map((d, idx) => idx === i ? v : d)) }
  function removeDay(i: number) { setField('autoReminderDays', reminderDays.filter((_, idx) => idx !== i)) }

  const levels: ReminderEscalationLevel[] = form.reminderEscalation?.levels ?? []
  function addLevel() {
    setField('reminderEscalation', {
      ...form.reminderEscalation,
      levels: [...levels, { daysOverdue: 0, label: 'Niveau ' + (levels.length + 1), notifyCreator: true, notifyManagers: false, sendEmail: true }],
    })
  }
  function updateLevel(i: number, patch: Partial<ReminderEscalationLevel>) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels: levels.map((l, idx) => idx === i ? { ...l, ...patch } : l) })
  }
  function removeLevel(i: number) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels: levels.filter((_, idx) => idx !== i) })
  }

  // ── Check levels (factures issued + proformas sent) ────────────────────────
  const checkLevels: CheckLevel[] = form.reminderEscalation?.checkLevels ?? DEFAULT_CHECK_LEVELS
  function addCheckLevel() {
    setField('reminderEscalation', {
      ...form.reminderEscalation,
      levels,
      checkLevels: [...checkLevels, { daysSince: 30, notifyManagers: false, sendEmail: false }],
    })
  }
  function updateCheckLevel(i: number, patch: Partial<CheckLevel>) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels, checkLevels: checkLevels.map((l, idx) => idx === i ? { ...l, ...patch } : l) })
  }
  function removeCheckLevel(i: number) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels, checkLevels: checkLevels.filter((_, idx) => idx !== i) })
  }

  // ── Draft check levels (brouillons non envoyés) ────────────────────────────
  const draftCheckLevels: CheckLevel[] = form.reminderEscalation?.draftCheckLevels ?? DEFAULT_DRAFT_CHECK_LEVELS
  function addDraftCheckLevel() {
    setField('reminderEscalation', {
      ...form.reminderEscalation,
      levels,
      draftCheckLevels: [...draftCheckLevels, { daysSince: 14, notifyManagers: false, sendEmail: false }],
    })
  }
  function updateDraftCheckLevel(i: number, patch: Partial<CheckLevel>) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels, draftCheckLevels: draftCheckLevels.map((l, idx) => idx === i ? { ...l, ...patch } : l) })
  }
  function removeDraftCheckLevel(i: number) {
    setField('reminderEscalation', { ...form.reminderEscalation, levels, draftCheckLevels: draftCheckLevels.filter((_, idx) => idx !== i) })
  }

  async function handleSave() {
    const payload = {
      ...form,
      autoReminderDays: (form.autoReminderDays ?? []).filter(
        (d) => Number.isInteger(d) && d > 0,
      ),
    }
    await updateMut.mutateAsync(payload)
    setDirty(false)
  }

  if (isLoading) return (
    <div className="card" aria-hidden="true">
      <div style={{ height: 200, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Jours de relance */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Bell size={15} /></div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Jours de relance automatique</h2>
          </div>
          {dirty && (
            <button type="button" onClick={handleSave} disabled={updateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMut.isPending ? 0.65 : 1 }}>
              {updateMut.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />} Sauvegarder
            </button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
          Relances envoyées aux équipes BTS aux jours X après émission d&apos;une facture impayée (ex : J+7, J+15, J+30).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {reminderDays.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} aria-hidden="true">J+</span>
              <input
                type="number" min={1} max={365} value={d}
                aria-label={`Jour de relance ${i + 1} : J+`}
                onChange={(e) => setDay(i, parseInt(e.target.value, 10))}
                style={{ ...inputCss, width: 56, padding: '3px 6px', textAlign: 'center', fontSize: 13 }}
              />
              <button type="button"
                aria-label={`Supprimer le jour de relance J+${d}`}
                onClick={() => removeDay(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, lineHeight: 1, display: 'flex', minHeight: 44, alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
                onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addDay}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.4)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, minHeight: 44 }}>
            <Plus size={11} aria-hidden="true" /> Ajouter
          </button>
        </div>
      </div>

      {/* Niveaux d'escalade */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Shield size={15} /></div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Niveaux d&apos;escalade des rappels</h2>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>
              Définissez qui est notifié selon le nombre de jours de retard
            </p>
          </div>
          {dirty && (
            <button type="button" onClick={handleSave} disabled={updateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMut.isPending ? 0.65 : 1 }}>
              {updateMut.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />} Sauvegarder
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Column headers */}
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto auto 32px', gap: 10, padding: '0 4px' }}>
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
                <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} aria-hidden="true">J+</span>
                <input
                  type="number" min={0} max={365} value={l.daysOverdue}
                  aria-label={`Jours de retard pour le niveau ${i + 1}`}
                  onChange={(e) => updateLevel(i, { daysOverdue: parseInt(e.target.value, 10) })}
                  style={{ ...inputCss, padding: '6px 8px', textAlign: 'center', fontSize: 13 }}
                />
              </div>
              <input
                value={l.label}
                aria-label={`Libellé du niveau ${i + 1}`}
                onChange={(e) => updateLevel(i, { label: e.target.value })}
                placeholder="Libellé du niveau"
                style={{ ...inputCss, padding: '7px 10px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={l.notifyCreator}
                  aria-label={`Notifier le créateur — niveau ${i + 1}`}
                  onChange={(e) => updateLevel(i, { notifyCreator: e.target.checked })}
                />
                <span className="sr-only">Créateur</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={l.notifyManagers}
                  aria-label={`Notifier les managers — niveau ${i + 1}`}
                  onChange={(e) => updateLevel(i, { notifyManagers: e.target.checked })}
                />
                <span className="sr-only">Managers</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={l.sendEmail}
                  aria-label={`Envoyer un email — niveau ${i + 1}`}
                  onChange={(e) => updateLevel(i, { sendEmail: e.target.checked })}
                />
                <span className="sr-only">Email</span>
              </label>
              <button type="button"
                aria-label={`Supprimer le niveau ${i + 1} : ${l.label}`}
                onClick={() => removeLevel(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, minHeight: 44, display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
                onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}>
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLevel}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px dashed rgba(45,125,210,0.4)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, alignSelf: 'flex-start', minHeight: 44 }}>
            <Plus size={12} aria-hidden="true" /> Ajouter un niveau d&apos;escalade
          </button>
        </div>
      </div>

      {/* Vérification factures émises / proformas envoyées */}
      <CheckLevelCard
        title="Vérification paiements & réponses clients"
        subtitle="Relances internes pour les factures émises sans paiement et les proformas sans réponse (J+3 / J+7 / J+15 par défaut)"
        levels={checkLevels}
        onAdd={addCheckLevel}
        onUpdate={updateCheckLevel}
        onRemove={removeCheckLevel}
        dirty={dirty}
        saving={updateMut.isPending}
        onSave={handleSave}
      />

      {/* Brouillons non envoyés */}
      <CheckLevelCard
        title="Relance brouillons non envoyés"
        subtitle="Escalade pour les factures et proformas restées en brouillon sans être envoyées au client (J+1 / J+3 / J+7 par défaut)"
        levels={draftCheckLevels}
        onAdd={addDraftCheckLevel}
        onUpdate={updateDraftCheckLevel}
        onRemove={removeDraftCheckLevel}
        dirty={dirty}
        saving={updateMut.isPending}
        onSave={handleSave}
      />
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

  const contentId  = useId()
  const subjectId  = useId()
  const bodyId     = useId()

  useEffect(() => {
    if (full && body === '') setBody(full.bodyHtml)
  }, [full])

  const vars = TEMPLATE_VARIABLES[template.type] ?? []

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* Collapsed header */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--surface)', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
        onFocus={(e)      => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onBlur={(e)       => { e.currentTarget.style.background = 'var(--surface)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={14} style={{ color: 'var(--primary)' }} aria-hidden="true" />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{template.name}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '1px 0 0', fontFamily: 'var(--font-mono)' }}>{template.type}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: template.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: template.isActive ? '#10b981' : '#6b7280', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {template.isActive ? 'Actif' : 'Inactif'}
          </span>
          {expanded
            ? <ChevronUp size={15} style={{ color: 'var(--text-3)' }} aria-hidden="true" />
            : <ChevronDown size={15} style={{ color: 'var(--text-3)' }} aria-hidden="true" />
          }
        </div>
      </button>

      {/* Expanded editor */}
      <div id={contentId} hidden={!expanded}>
        {expanded && (
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isLoading
              ? <div aria-hidden="true" style={{ height: 200, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
              : (
                <>
                  {/* Variables */}
                  {vars.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', background: 'rgba(45,125,210,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(45,125,210,0.15)' }}>
                      <Tag size={12} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>Variables disponibles :</span>
                      {vars.map((v) => (
                        <code key={v} style={{ fontSize: 11.5, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{v}</code>
                      ))}
                    </div>
                  )}

                  {/* Subject */}
                  <div>
                    <label
                      htmlFor={subjectId}
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
                    >
                      Objet de l&apos;email
                    </label>
                    <input
                      id={subjectId}
                      value={subject}
                      onChange={(e) => { setSubject(e.target.value); setDirty(true) }}
                      style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Body HTML */}
                  <div>
                    <label
                      htmlFor={bodyId}
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
                    >
                      Corps HTML
                    </label>
                    <textarea
                      id={bodyId}
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
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: dirty ? 'var(--primary)' : 'var(--surface-2)', color: dirty ? '#fff' : 'var(--text-3)', cursor: dirty ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMut.isPending ? 0.65 : 1 }}>
                      {updateMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                      Sauvegarder
                    </button>
                  </div>
                </>
              )
            }
          </div>
        )}
      </div>
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
          <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Mail size={15} /></div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Templates d&apos;emails</h2>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>Personnalisez les emails envoyés automatiquement. Utilisez les variables entre {'{{'} et {'}}'}.</p>
      </div>
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} aria-hidden="true" style={{ height: 48, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6 }} className="animate-pulse" />)
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
  const { can } = usePermission()
  if (!can('settings', 'read')) return <AccessDenied />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <NotifSettingsSection />
      <RappelsSection />
      <EmailTemplatesSection />
    </div>
  )
}
