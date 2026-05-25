'use client'

import { useState, useId } from 'react'
import { Webhook, Plus, Trash2, Pencil, CheckCircle2, XCircle, Loader2, X, Clock, AlertCircle } from 'lucide-react'
import {
  useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook,
} from '@/features/settings-advanced/hooks'
import {
  WEBHOOK_EVENTS,
  type Webhook as WebhookType,
  type CreateWebhookPayload,
} from '@/features/settings-advanced/types'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'

// ─── Status badge ──────────────────────────────────────────────
function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 100,
      background: active ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
      color: active ? '#10b981' : 'var(--text-3)',
      fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)',
    }}>
      {active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {active ? 'Actif' : 'Inactif'}
    </span>
  )
}

// ─── Webhook form (create & edit) ─────────────────────────────
interface WebhookFormProps {
  initial?: Partial<WebhookType>
  onClose: () => void
  mode: 'create' | 'edit'
  webhookId?: string
}

function WebhookForm({ initial, onClose, mode, webhookId }: WebhookFormProps) {
  const uid = useId()
  const id = (s: string) => `${uid}-${s}`
  const createMut = useCreateWebhook()
  const updateMut = useUpdateWebhook()

  const isPending = createMut.isPending || updateMut.isPending

  const [form, setForm] = useState<CreateWebhookPayload>({
    name:       initial?.name       ?? '',
    url:        initial?.url        ?? '',
    events:     initial?.events     ?? [],
    secret:     initial?.secret     ?? '',
    isActive:   initial?.isActive   ?? true,
    retryCount: initial?.retryCount ?? 3,
  })

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim() || form.events.length === 0) return

    const payload = { ...form, secret: form.secret || null }

    if (mode === 'create') {
      await createMut.mutateAsync(payload)
    } else if (webhookId) {
      await updateMut.mutateAsync({ id: webhookId, ...payload })
    }
    onClose()
  }

  const inputCss: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)', background: 'var(--bg)',
    fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%', maxWidth: 560, padding: 28, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            {mode === 'create' ? 'Nouveau webhook' : `Modifier — ${initial?.name}`}
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('name')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Nom <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input id={id('name')} type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mon webhook Slack" required style={inputCss} />
          </div>

          {/* URL */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('url')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              URL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input id={id('url')} type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.example.com/..." required style={inputCss} />
          </div>

          {/* Secret */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('secret')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Secret de signature (optionnel)
            </label>
            <input id={id('secret')} type="password" value={form.secret ?? ''} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Laissez vide pour désactiver la signature" style={inputCss} />
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>Utilisé pour signer les payloads via HMAC-SHA256 (header X-BTS-Signature).</p>
          </div>

          {/* Retry count + Active toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label htmlFor={id('retry')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
                Tentatives en cas d&apos;échec
              </label>
              <select id={id('retry')} value={form.retryCount} onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })} style={{ ...inputCss, cursor: 'pointer' }}>
                {[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Aucune' : `${n} fois`}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input
                type="checkbox"
                id={id('active')}
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
              />
              <label htmlFor={id('active')} style={{ fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }}>Activer ce webhook</label>
            </div>
          </div>

          {/* Events */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
              Événements <span style={{ color: '#ef4444' }}>*</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {WEBHOOK_EVENTS.map((group) => (
                <div key={group.group}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
                    {group.group}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {group.events.map((evt) => {
                      const checked = form.events.includes(evt.value)
                      return (
                        <label key={evt.value} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px', borderRadius: 7,
                          border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                          background: checked ? 'rgba(45,125,210,0.06)' : 'transparent',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleEvent(evt.value)} style={{ accentColor: 'var(--primary)', width: 13, height: 13 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{evt.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
            }}>Annuler</button>
            <button
              type="submit"
              disabled={isPending || !form.name.trim() || !form.url.trim() || form.events.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)', color: '#fff',
                cursor: (isPending || !form.name.trim() || !form.url.trim() || form.events.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (isPending || !form.name.trim() || !form.url.trim() || form.events.length === 0) ? 0.65 : 1,
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              }}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {mode === 'create' ? 'Créer le webhook' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Webhook card ──────────────────────────────────────────────
function WebhookCard({ webhook }: { webhook: WebhookType }) {
  const deleteMut = useDeleteWebhook()
  const [editing, setEditing]     = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                {webhook.name}
              </span>
              <ActiveBadge active={webhook.isActive} />
            </div>
            <code style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
              {webhook.url}
            </code>

            {/* Events */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
              {webhook.events.slice(0, 6).map((evt) => (
                <span key={evt} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
                }}>
                  {evt}
                </span>
              ))}
              {webhook.events.length > 6 && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 4px' }}>
                  +{webhook.events.length - 6} autres
                </span>
              )}
            </div>

            {/* Meta */}
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {webhook.retryCount} tentative{webhook.retryCount !== 1 ? 's' : ''}
              </span>
              {webhook._count && (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {webhook._count.deliveries} envoi{webhook._count.deliveries !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Modifier"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'transparent',
                color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
                fontFamily: 'var(--font-display)', fontWeight: 600, minHeight: 44,
              }}
            >
              <Pencil size={12} /> Modifier
            </button>

            {confirming ? (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(webhook.id)}
                  disabled={deleteMut.isPending}
                  style={{
                    padding: '7px 12px', borderRadius: 'var(--radius-md)', border: 'none',
                    background: '#ef4444', color: '#fff', cursor: 'pointer',
                    fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, minHeight: 44,
                  }}
                >
                  {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Supprimer'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  style={{
                    padding: '7px 12px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border)', background: 'transparent',
                    color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
                    fontFamily: 'var(--font-display)', minHeight: 44,
                  }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Supprimer"
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '7px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent',
                  color: '#ef4444', cursor: 'pointer', minHeight: 44,
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <WebhookForm
          mode="edit"
          webhookId={webhook.id}
          initial={webhook}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function WebhooksPage() {
  const { can } = usePermission()
  const { data: webhooks = [], isLoading } = useWebhooks()
  const [showCreate, setShowCreate] = useState(false)

  if (!can('settings', 'update')) return <AccessDenied message="La gestion des webhooks est réservée aux administrateurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Webhooks
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            Recevez des notifications HTTP lorsque des événements surviennent dans InvoiceHub.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
            whiteSpace: 'nowrap', minHeight: 44,
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Nouveau webhook
        </button>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={14} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Les payloads sont envoyés en POST avec le header <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>X-BTS-Event</code>.
          Si un secret est configuré, chaque requête inclut <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>X-BTS-Signature</code> (HMAC-SHA256).
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card animate-pulse" style={{ height: 110 }} />
        ))
      ) : webhooks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Webhook size={36} style={{ color: 'var(--border)', margin: '0 auto 12px' }} aria-hidden="true" />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
            Aucun webhook configuré
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Créez votre premier webhook pour recevoir des notifications en temps réel.
          </p>
        </div>
      ) : (
        webhooks.map((wh) => <WebhookCard key={wh.id} webhook={wh} />)
      )}

      {showCreate && <WebhookForm mode="create" onClose={() => setShowCreate(false)} />}
    </div>
  )
}
