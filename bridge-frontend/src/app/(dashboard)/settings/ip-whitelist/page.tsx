'use client'

import { useState, useId } from 'react'
import { Shield, Plus, Trash2, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useIpWhitelist, useAddIp, useRemoveIp } from '@/features/settings-advanced/hooks'
import type { IpWhitelistEntry } from '@/features/settings-advanced/types'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'

// ─── Add IP modal ──────────────────────────────────────────────
function AddIpModal({ onClose }: { onClose: () => void }) {
  const uid = useId()
  const id = (s: string) => `${uid}-${s}`
  const addMut = useAddIp()

  const [form, setForm] = useState({ ipAddress: '', label: '' })
  const [error, setError] = useState('')

  function validateIp(ip: string): boolean {
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    const ipv6 = /^[0-9a-fA-F:]+$/
    return ipv4.test(ip) || ipv6.test(ip)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.ipAddress.trim()) { setError('L\'adresse IP est requise.'); return }
    if (!validateIp(form.ipAddress.trim())) { setError('Format d\'adresse IP invalide (IPv4, IPv6 ou CIDR).'); return }

    await addMut.mutateAsync({
      ipAddress: form.ipAddress.trim(),
      label:     form.label.trim() || null,
    })
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
        width: '100%', maxWidth: 440, padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Ajouter une IP à la liste blanche
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={id('ip')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Adresse IP <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id={id('ip')}
              type="text"
              value={form.ipAddress}
              onChange={(e) => { setForm({ ...form, ipAddress: e.target.value }); setError('') }}
              placeholder="192.168.1.1 ou 10.0.0.0/24"
              style={{ ...inputCss, fontFamily: 'var(--font-mono)' }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Formats acceptés : IPv4, IPv6, CIDR (ex: 10.0.0.0/8)
            </p>
          </div>

          <div style={{ marginBottom: error ? 12 : 20 }}>
            <label htmlFor={id('desc')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Libellé (optionnel)
            </label>
            <input
              id={id('desc')}
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ex : Serveur de production, Bureau Douala..."
              style={inputCss}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14 }}>
              <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#ef4444' }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600,
            }}>Annuler</button>
            <button
              type="submit"
              disabled={addMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)', color: '#fff',
                cursor: addMut.isPending ? 'not-allowed' : 'pointer',
                opacity: addMut.isPending ? 0.65 : 1,
                fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              }}
            >
              {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── IP entry row ──────────────────────────────────────────────
function IpRow({ entry }: { entry: IpWhitelistEntry }) {
  const removeMut = useRemoveIp()
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '200px 1fr 120px 100px',
      gap: 12, padding: '12px 16px', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* IP */}
      <code style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', fontWeight: 600 }}>
        {entry.ipAddress}
      </code>

      {/* Label */}
      <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
        {entry.label}
      </span>

      {/* Status */}
      <span>
        {entry.isActive ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 100,
            background: 'rgba(16,185,129,0.1)', color: '#10b981',
            fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)',
          }}>
            <CheckCircle2 size={11} /> Active
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 100,
            background: 'rgba(107,114,128,0.1)', color: 'var(--text-3)',
            fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display)',
          }}>
            Inactive
          </span>
        )}
      </span>

      {/* Actions */}
      <div>
        {confirming ? (
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              type="button"
              onClick={() => removeMut.mutate(entry.id)}
              disabled={removeMut.isPending}
              style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: '#ef4444', color: '#fff', cursor: 'pointer',
                fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700,
              }}
            >
              {removeMut.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Suppr.'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={{
                padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-2)', cursor: 'pointer', fontSize: 11.5,
              }}
            >
              Non
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Supprimer ${entry.ipAddress}`}
            onClick={() => setConfirming(true)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 10px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent',
              color: '#ef4444', cursor: 'pointer', minHeight: 44,
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function IpWhitelistPage() {
  const { can } = usePermission()
  const { data: entries = [], isLoading } = useIpWhitelist()
  const [showAdd, setShowAdd] = useState(false)

  if (!can('settings', 'update')) return <AccessDenied message="La liste blanche IP est réservée aux administrateurs." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            IP Whitelist
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            Restreignez l&apos;accès à l&apos;API aux adresses IP autorisées.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700,
            whiteSpace: 'nowrap', minHeight: 44,
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Ajouter une IP
        </button>
      </div>

      {/* Warning banner */}
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={14} style={{ color: '#d97706', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          <strong>Attention :</strong> Si la liste est activée et ne contient aucune IP correspondant à votre adresse actuelle, vous serez bloqué.
          Vérifiez que votre IP figure dans la liste avant d&apos;activer cette fonctionnalité.
        </p>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} style={{ color: 'var(--primary)' }} />
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            IPs autorisées ({entries.length})
          </h2>
        </div>

        {/* Column headers */}
        <div aria-hidden="true" style={{
          display: 'grid', gridTemplateColumns: '200px 1fr 120px 100px',
          gap: 12, padding: '8px 16px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          {['Adresse IP', 'Description', 'Statut', 'Actions'].map((h) => (
            <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 120px 100px',
              gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)',
            }}>
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
              ))}
            </div>
          ))
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <Shield size={32} style={{ color: 'var(--border)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Aucune IP dans la liste blanche. L&apos;accès API n&apos;est pas restreint par IP.
            </p>
          </div>
        ) : (
          entries.map((entry) => <IpRow key={entry.id} entry={entry} />)
        )}
      </div>

      {showAdd && <AddIpModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
