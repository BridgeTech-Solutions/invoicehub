'use client'

import { useState, useEffect } from 'react'
import { Shield, Clock, Lock, Monitor, LogOut, Loader2, Check, AlertTriangle } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { useSessions, useRevokeSession, useRevokeAllSessions } from '@/features/auth/hooks'
import { formatDate } from '@/lib/utils'
import type { UpdateSettingsPayload } from '@/features/settings/types'
import type { Session } from '@/features/auth/types'

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

// ─── Session card ─────────────────────────────────────────────
function SessionCard({ session, onRevoke, isPending }: {
  session: Session; onRevoke: (id: string) => void; isPending: boolean
}) {
  const browser = (session.deviceInfo as Record<string, string> | undefined)?.browser ?? session.deviceName ?? 'Navigateur inconnu'
  const os      = (session.deviceInfo as Record<string, string> | undefined)?.os ?? ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${session.current ? 'var(--primary)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: session.current ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Monitor size={16} style={{ color: session.current ? 'var(--primary)' : 'var(--text-3)' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{browser}</span>
            {session.current && (
              <span style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 100, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                Session actuelle
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            {os && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{os}</span>}
            {session.ipAddress && <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{session.ipAddress}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Créé le {formatDate(session.createdAt)}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Expire le {formatDate(session.expiresAt)}</span>
          </div>
        </div>
      </div>
      {!session.current && (
        <button
          type="button"
          onClick={() => onRevoke(session.id)}
          disabled={isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, flexShrink: 0, marginLeft: 12 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <LogOut size={12} /> Révoquer
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function SecuritySettingsPage() {
  const { data: settings, isLoading }           = useSettings()
  const updateMut                               = useUpdateSettings()
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions()
  const revokeMut                               = useRevokeSession()
  const revokeAllMut                            = useRevokeAllSessions()

  const [form, setForm] = useState<Pick<UpdateSettingsPayload,
    'sessionTimeoutMinutes' | 'maxLoginAttempts' | 'require2FA'>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      maxLoginAttempts:      settings.maxLoginAttempts,
      require2FA:            settings.require2FA ?? false,
    })
    setDirty(false)
  }, [settings])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync(form)
    setDirty(false)
  }

  const otherSessions = sessions.filter((s) => !s.current)

  if (isLoading) return <div style={{ height: 300, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Session timeout + Login attempts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <SectionTitle icon={<Clock size={15} />} title="Sessions" subtitle="Durée de vie des sessions utilisateurs" />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Timeout session (minutes)
            </label>
            <input
              type="number" min={5} max={1440}
              value={form.sessionTimeoutMinutes ?? 60}
              onChange={(e) => set('sessionTimeoutMinutes', parseInt(e.target.value, 10))}
              style={inputCss}
            />
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>
              Entre 5 et 1440 min (24h). Refresh tokens valides 7 jours.
            </p>
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={<Lock size={15} />} title="Sécurité connexion" subtitle="Tentatives de connexion et verrouillage" />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>
              Tentatives max avant blocage
            </label>
            <input
              type="number" min={1} max={20}
              value={form.maxLoginAttempts ?? 5}
              onChange={(e) => set('maxLoginAttempts', parseInt(e.target.value, 10))}
              style={inputCss}
            />
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>Entre 1 et 20 tentatives. Recommandé : 5.</p>
          </div>
        </div>
      </div>

      {/* 2FA entreprise */}
      <div className="card">
        <SectionTitle
          icon={<Shield size={15} />}
          title="Authentification à deux facteurs (2FA)"
          subtitle="Imposer la 2FA à tous les utilisateurs de la plateforme"
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${form.require2FA ? 'rgba(45,125,210,0.3)' : 'var(--border)'}`, transition: 'border-color 0.2s' }}>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px' }}>
              Imposer la 2FA à tous les utilisateurs
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              Si activé, tout utilisateur sans 2FA sera forcé de la configurer à sa prochaine connexion.
            </p>
          </div>
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, marginLeft: 20 }}>
            <input
              type="checkbox"
              checked={form.require2FA ?? false}
              onChange={(e) => set('require2FA', e.target.checked)}
              style={{ display: 'none' }}
            />
            <div style={{
              width: 44, height: 24, borderRadius: 12,
              background: form.require2FA ? 'var(--primary)' : 'var(--border)',
              transition: 'background 0.2s', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: form.require2FA ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </div>
          </label>
        </div>
        {form.require2FA && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
              Les utilisateurs sans 2FA active seront redirigés vers la page de configuration à leur prochaine connexion.
            </p>
          </div>
        )}
      </div>

      {/* Sessions actives */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: 'var(--primary)' }}><Monitor size={15} /></div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Sessions actives</h2>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>
              Vos appareils connectés — {sessions.length} session{sessions.length > 1 ? 's' : ''}
            </p>
          </div>
          {otherSessions.length > 0 && (
            <button
              type="button"
              onClick={() => revokeAllMut.mutate()}
              disabled={revokeAllMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, flexShrink: 0 }}
            >
              {revokeAllMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Déconnecter les autres sessions
            </button>
          )}
        </div>

        {sessionsLoading
          ? Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ height: 66, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8 }} className="animate-pulse" />
          ))
          : sessions.length === 0
            ? (
              <p style={{ fontSize: 13.5, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                Aucune session active
              </p>
            )
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onRevoke={(id) => revokeMut.mutate(id)}
                    isPending={revokeMut.isPending}
                  />
                ))}
              </div>
            )
        }
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={!dirty || updateMut.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 28px', borderRadius: 'var(--radius-md)', border: 'none', background: dirty ? 'var(--primary)' : 'var(--surface-2)', color: dirty ? '#fff' : 'var(--text-3)', cursor: dirty && !updateMut.isPending ? 'pointer' : 'not-allowed', fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700, boxShadow: dirty ? '0 4px 14px rgba(45,125,210,0.3)' : 'none', transition: 'all 0.2s' }}
        >
          {updateMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Enregistrer les modifications
        </button>
      </div>
    </form>
  )
}
