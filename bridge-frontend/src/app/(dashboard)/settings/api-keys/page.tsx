'use client'

import { useState, useId } from 'react'
import { Key, Plus, Trash2, Copy, Check, AlertTriangle, Loader2, Shield, Eye, EyeOff, X } from 'lucide-react'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/features/settings-advanced/hooks'
import { API_KEY_PERMISSIONS, type ApiKey, type CreateApiKeyPayload } from '@/features/settings-advanced/types'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { useQueryClient } from '@tanstack/react-query'
import { copyToClipboard } from '@/lib/utils'

// ─── Copy button ───────────────────────────────────────────────
function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 'var(--radius-md)',
        border: '1.5px solid var(--border)', background: copied ? 'rgba(16,185,129,0.08)' : 'var(--surface-2)',
        color: copied ? '#10b981' : 'var(--text-2)',
        cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600,
        transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copié !' : label}
    </button>
  )
}

// ─── Raw key modal ─────────────────────────────────────────────
function RawKeyModal({ rawKey, keyName, onClose }: { rawKey: string; keyName: string; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [visible, setVisible] = useState(false)
  const qc = useQueryClient()

  function handleClose() {
    if (!confirmed) return
    qc.invalidateQueries({ queryKey: ['api-keys'] })
    onClose()
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
        width: '100%', maxWidth: 520, padding: 28,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Key size={18} style={{ color: '#10b981' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
              Clé API créée — {keyName}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Copiez la clé maintenant, elle ne sera plus affichée.</p>
          </div>
        </div>

        {/* Warning */}
        <div style={{
          display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          marginBottom: 16,
        }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Cette clé ne sera affichée <strong>qu&apos;une seule fois</strong>. Si vous la perdez, vous devrez en créer une nouvelle.
          </p>
        </div>

        {/* Key display */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--surface)', border: '1.5px solid var(--border)',
          marginBottom: 16,
        }}>
          <code style={{
            flex: 1, fontSize: 12.5, fontFamily: 'var(--font-mono)',
            color: 'var(--text-1)', wordBreak: 'break-all',
            filter: visible ? 'none' : 'blur(5px)',
            transition: 'filter 0.2s', userSelect: visible ? 'text' : 'none',
          }}>
            {rawKey}
          </code>
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            title={visible ? 'Masquer' : 'Afficher'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <CopyButton value={rawKey} label="Copier la clé" />
        </div>

        {/* Confirmation checkbox */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2, accentColor: 'var(--primary)', width: 15, height: 15, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            J&apos;ai copié et sauvegardé ma clé API en lieu sûr. Je comprends qu&apos;elle ne sera plus affichée après la fermeture de cette fenêtre.
          </span>
        </label>

        <button
          type="button"
          onClick={handleClose}
          disabled={!confirmed}
          style={{
            width: '100%', padding: '10px 20px',
            borderRadius: 'var(--radius-md)', border: 'none',
            background: confirmed ? 'var(--primary)' : 'var(--surface-2)',
            color: confirmed ? '#fff' : 'var(--text-3)',
            cursor: confirmed ? 'pointer' : 'not-allowed',
            fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700,
            transition: 'all 0.15s',
          }}
        >
          Fermer et continuer
        </button>
      </div>
    </div>
  )
}

// ─── Create key modal ──────────────────────────────────────────
function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const uid = useId()
  const id = (s: string) => `${uid}-${s}`
  const createMut = useCreateApiKey()

  const [form, setForm] = useState<CreateApiKeyPayload>({
    name: '',
    permissions: [],
    expiresAt: null,
  })
  const [rawKeyData, setRawKeyData] = useState<{ rawKey: string; keyName: string } | null>(null)

  function togglePermission(perm: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || form.permissions.length === 0) return
    const result = await createMut.mutateAsync(form)
    setRawKeyData({ rawKey: result.data.rawKey, keyName: form.name })
  }

  if (rawKeyData) {
    return <RawKeyModal rawKey={rawKeyData.rawKey} keyName={rawKeyData.keyName} onClose={onClose} />
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
        width: '100%', maxWidth: 500, padding: 28, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Nouvelle clé API
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor={id('name')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Nom de la clé <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id={id('name')}
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex : Intégration Sage, CI/CD pipeline..."
              required
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Expiry */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor={id('expires')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Expiration (optionnel)
            </label>
            <input
              id={id('expires')}
              type="date"
              value={form.expiresAt ?? ''}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
              min={new Date().toISOString().split('T')[0]}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Permissions */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>
              Permissions <span style={{ color: '#ef4444' }}>*</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {API_KEY_PERMISSIONS.map((perm) => {
                const checked = form.permissions.includes(perm.value)
                return (
                  <label
                    key={perm.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8,
                      border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                      background: checked ? 'rgba(45,125,210,0.06)' : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(perm.value)}
                      style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.3 }}>{perm.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'transparent',
                color: 'var(--text-2)', cursor: 'pointer',
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || !form.name.trim() || form.permissions.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)', color: '#fff',
                cursor: (createMut.isPending || !form.name.trim() || form.permissions.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (createMut.isPending || !form.name.trim() || form.permissions.length === 0) ? 0.65 : 1,
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              }}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Créer la clé
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Key row ───────────────────────────────────────────────────
function ApiKeyRow({ apiKey }: { apiKey: ApiKey }) {
  const revokeMut = useRevokeApiKey()
  const [confirming, setConfirming] = useState(false)

  const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 120px 160px 130px 100px',
      gap: 12, padding: '14px 16px', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Name + prefix */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-body)' }}>
            {apiKey.name}
          </span>
          {!apiKey.isActive && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            }}>Révoquée</span>
          )}
          {isExpired && apiKey.isActive && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
              background: 'rgba(245,158,11,0.1)', color: '#d97706',
            }}>Expirée</span>
          )}
        </div>
        <code style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {apiKey.keyPrefix}••••••••
        </code>
      </div>

      {/* Permissions count */}
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 4,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
        }}>
          <Shield size={10} /> {apiKey.permissions.length} droits
        </span>
      </div>

      {/* Expiry */}
      <span style={{ fontSize: 12.5, color: isExpired ? '#ef4444' : 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
        {apiKey.expiresAt
          ? new Date(apiKey.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
          : 'Jamais'}
      </span>

      {/* Last used */}
      <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
        {apiKey.lastUsedAt
          ? new Date(apiKey.lastUsedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
          : '—'}
      </span>

      {/* Actions */}
      <div>
        {apiKey.isActive && (
          confirming ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => revokeMut.mutate(apiKey.id)}
                disabled={revokeMut.isPending}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none',
                  background: '#ef4444', color: '#fff', cursor: 'pointer',
                  fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700,
                }}
              >
                {revokeMut.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Confirmer'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-2)', cursor: 'pointer',
                  fontSize: 11.5, fontFamily: 'var(--font-display)',
                }}
              >
                Non
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Révoquer la clé ${apiKey.name}`}
              onClick={() => setConfirming(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent',
                color: '#ef4444', cursor: 'pointer',
                fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600,
                minHeight: 44,
              }}
            >
              <Trash2 size={12} aria-hidden="true" />
              Révoquer
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const { can } = usePermission()
  const { data: apiKeys = [], isLoading } = useApiKeys()
  const [showCreate, setShowCreate] = useState(false)

  const activeKeys   = apiKeys.filter((k) => k.isActive)
  const revokedKeys  = apiKeys.filter((k) => !k.isActive)

  if (!can('settings', 'update')) return <AccessDenied message="La gestion des clés API est réservée aux administrateurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Clés API
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            Gérez les clés d&apos;accès programmatique à l&apos;API InvoiceHub.
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
          Nouvelle clé
        </button>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.06)', border: '1px solid rgba(45,125,210,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Shield size={14} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Les clés API permettent l&apos;accès programmatique à InvoiceHub. Elles sont affichées <strong>une seule fois</strong> à la création.
          Conservez-les dans un gestionnaire de secrets et révoquez immédiatement toute clé compromise.
        </p>
      </div>

      {/* Active keys table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={14} style={{ color: 'var(--primary)' }} />
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Clés actives ({activeKeys.length})
          </h2>
        </div>

        {/* Column headers */}
        <div aria-hidden="true" style={{
          display: 'grid', gridTemplateColumns: '1fr 120px 160px 130px 100px',
          gap: 12, padding: '8px 16px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          {['Clé', 'Permissions', 'Expiration', 'Dernière utilisation', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 160px 130px 100px',
              gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)',
            }}>
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
              ))}
            </div>
          ))
        ) : activeKeys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <Key size={32} style={{ color: 'var(--border)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Aucune clé API active. Créez votre première clé.
            </p>
          </div>
        ) : (
          activeKeys.map((key) => <ApiKeyRow key={key.id} apiKey={key} />)
        )}
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={14} style={{ color: 'var(--text-3)' }} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
              Clés révoquées ({revokedKeys.length})
            </h2>
          </div>
          <div aria-hidden="true" style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 160px 130px 100px',
            gap: 12, padding: '8px 16px',
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          }}>
            {['Clé', 'Permissions', 'Expiration', 'Dernière utilisation', ''].map((h, idx) => (
              <span key={idx} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {h}
              </span>
            ))}
          </div>
          {revokedKeys.map((key) => <ApiKeyRow key={key.id} apiKey={key} />)}
        </div>
      )}

      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
