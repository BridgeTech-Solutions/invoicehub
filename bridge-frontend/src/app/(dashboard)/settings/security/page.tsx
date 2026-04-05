'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { Shield, Clock, Lock, Monitor, LogOut, Loader2, Check, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/features/settings/hooks'
import { useSessions, useRevokeSession, useRevokeAllSessions } from '@/features/auth/hooks'
import { formatDate } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { UpdateSettingsPayload } from '@/features/settings/types'
import type { Session } from '@/features/auth/types'

// M4 — focus ring via controlled state, no outline:none hardcoded
const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', outline: 'none',
}
const inputFocusCss: React.CSSProperties = {
  ...inputCss,
  borderColor: 'var(--primary)',
  boxShadow: '0 0 0 3px rgba(45,125,210,0.15)',
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

// ─── Toggle switch accessible ─────────────────────────────────
function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <div aria-hidden="true" style={{
        width: 44, height: 24, borderRadius: 12,
        background: checked ? 'var(--primary)' : 'var(--border)',
        transition: 'background 0.2s', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 3,
          left: checked ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
    </label>
  )
}

// ─── C2: Confirm revoke-all modal ─────────────────────────────
function ConfirmRevokeAllModal({ count, onConfirm, onCancel }: {
  count: number; onConfirm: () => void; onCancel: () => void
}) {
  const modalRef  = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId   = useId()

  useEffect(() => {
    confirmRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>('button')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LogOut size={18} style={{ color: '#ef4444' }} aria-hidden="true" />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>
              Déconnecter les autres sessions
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
              Cette action va révoquer {count} autre{count > 1 ? 's' : ''} session{count > 1 ? 's' : ''} active{count > 1 ? 's' : ''}. Ces appareils devront se reconnecter.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '0 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{ padding: '0 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Déconnecter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Session card ─────────────────────────────────────────────
// C4: isRevoking is now specific to THIS session (not all)
function SessionCard({ session, onRevoke, isRevoking }: {
  session: Session; onRevoke: (id: string) => void; isRevoking: boolean
}) {
  const browser = (session.deviceInfo as Record<string, string> | undefined)?.browser ?? session.deviceName ?? 'Navigateur inconnu'
  const os      = (session.deviceInfo as Record<string, string> | undefined)?.os ?? ''

  return (
    // H3: <li> inside <ul> for list semantics
    <li style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${session.current ? 'var(--primary)' : 'var(--border)'}`, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: session.current ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Monitor size={16} style={{ color: session.current ? 'var(--primary)' : 'var(--text-3)' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{browser}</span>
            {session.current && (
              // M3: CheckCircle2 icon + text (non-color indicator)
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '1px 8px', borderRadius: 100, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                <CheckCircle2 size={10} aria-hidden="true" />
                Session actuelle
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            {os && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{os}</span>}
            {/* H5: IP address with sr-only label */}
            {session.ipAddress && (
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                <span className="sr-only">Adresse IP : </span>
                {session.ipAddress}
              </span>
            )}
            <time dateTime={session.createdAt} style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Créé le {formatDate(session.createdAt)}</time>
            <time dateTime={session.expiresAt} style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Expire le {formatDate(session.expiresAt)}</time>
          </div>
        </div>
      </div>
      {!session.current && (
        // H1: minHeight 44px for touch target
        <button
          type="button"
          aria-label={`Révoquer la session ${browser}${session.ipAddress ? ` (${session.ipAddress})` : ''}`}
          onClick={() => onRevoke(session.id)}
          disabled={isRevoking}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: isRevoking ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, flexShrink: 0, marginLeft: 12, opacity: isRevoking ? 0.65 : 1 }}
          onMouseEnter={(e) => { if (!isRevoking) { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' } }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          onFocus={(e)      => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
          onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          {isRevoking
            ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            : <LogOut size={12} aria-hidden="true" />
          }
          Révoquer
        </button>
      )}
    </li>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function SecuritySettingsPage() {
  const { data: settings, isLoading }           = useSettings()
  const updateMut                               = useUpdateSettings()
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions()
  const revokeMut                               = useRevokeSession()
  const revokeAllMut                            = useRevokeAllSessions()
  const isMobile                                = useIsMobile()

  const [form, setForm] = useState<Pick<UpdateSettingsPayload,
    'sessionTimeoutMinutes' | 'maxLoginAttempts' | 'require2FA'>>({})
  const [dirty, setDirty]               = useState(false)
  const [saveSuccess, setSaveSuccess]   = useState(false)           // H2
  const [validErrors, setValidErrors]   = useState<Partial<Record<'sessionTimeoutMinutes' | 'maxLoginAttempts', string>>>({}) // C5
  const [revokingId, setRevokingId]     = useState<string | null>(null)  // C4
  const [showConfirmAll, setShowConfirmAll] = useState(false)       // C2
  const [focusedField, setFocusedField] = useState<string | null>(null)  // M4

  const idTimeout      = useId()
  const idAttempts     = useId()
  const idTimeoutHint  = useId()
  const idAttemptsHint = useId()

  const otherSessions = sessions.filter((s) => !s.current)

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
    setSaveSuccess(false)
    if (key in validErrors) {
      setValidErrors((prev) => { const n = { ...prev }; delete n[key as keyof typeof validErrors]; return n })
    }
  }

  // C5: JS-side validation before mutateAsync
  function validate(): boolean {
    const errs: typeof validErrors = {}
    const timeout  = form.sessionTimeoutMinutes ?? 60
    const attempts = form.maxLoginAttempts ?? 5
    if (!Number.isFinite(timeout) || timeout < 5 || timeout > 1440)
      errs.sessionTimeoutMinutes = 'Doit être entre 5 et 1440 minutes.'
    if (!Number.isFinite(attempts) || attempts < 1 || attempts > 20)
      errs.maxLoginAttempts = 'Doit être entre 1 et 20 tentatives.'
    setValidErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    await updateMut.mutateAsync(form)
    setDirty(false)
    setSaveSuccess(true)   // H2
  }

  // C4: revoke tracks a specific session id
  async function handleRevoke(id: string) {
    setRevokingId(id)
    try {
      await revokeMut.mutateAsync(id)
    } finally {
      setRevokingId(null)
    }
  }

  // C2: revoke all after confirmation
  async function handleRevokeAll() {
    setShowConfirmAll(false)
    await revokeAllMut.mutateAsync()
  }

  // C3: AT feedback during settings load
  if (isLoading) return (
    <>
      <p className="sr-only" role="status">Chargement des paramètres de sécurité…</p>
      <div aria-hidden="true" style={{ height: 300, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
    </>
  )

  // C1: surface mutation errors
  const saveError    = updateMut.isError    ? ((updateMut.error as Error)?.message    ?? 'Erreur lors de la sauvegarde.') : null
  const revokeError  = revokeMut.isError    ? ((revokeMut.error as Error)?.message    ?? 'Erreur lors de la révocation.') : null
  const revokeAllErr = revokeAllMut.isError ? ((revokeAllMut.error as Error)?.message ?? 'Erreur lors de la déconnexion.') : null

  return (
    <>
      {/* C2: confirmation avant révocation globale */}
      {showConfirmAll && (
        <ConfirmRevokeAllModal
          count={otherSessions.length}
          onConfirm={handleRevokeAll}
          onCancel={() => setShowConfirmAll(false)}
        />
      )}

      <form onSubmit={handleSave} noValidate aria-busy={updateMut.isPending} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Session timeout + Login attempts */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <div className="card">
            <SectionTitle icon={<Clock size={15} />} title="Sessions" subtitle="Durée de vie des sessions utilisateurs" />
            <div>
              <label
                htmlFor={idTimeout}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
              >
                Timeout session (minutes)
              </label>
              {/* H4: aria-describedby; M1: inputMode; M4: focus ring */}
              <input
                id={idTimeout}
                type="number"
                min={5}
                max={1440}
                inputMode="numeric"
                value={form.sessionTimeoutMinutes ?? 60}
                onChange={(e) => set('sessionTimeoutMinutes', parseInt(e.target.value, 10))}
                aria-describedby={`${idTimeoutHint}${validErrors.sessionTimeoutMinutes ? ` ${idTimeout}-err` : ''}`}
                aria-invalid={!!validErrors.sessionTimeoutMinutes || undefined}
                onFocus={() => setFocusedField(idTimeout)}
                onBlur={() => setFocusedField(null)}
                style={focusedField === idTimeout ? inputFocusCss : inputCss}
              />
              <p id={idTimeoutHint} style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>
                Entre 5 et 1440 min (24h). Refresh tokens valides 7 jours.
              </p>
              {validErrors.sessionTimeoutMinutes && (
                <p id={`${idTimeout}-err`} role="alert" style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>
                  {validErrors.sessionTimeoutMinutes}
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <SectionTitle icon={<Lock size={15} />} title="Sécurité connexion" subtitle="Tentatives de connexion et verrouillage" />
            <div>
              <label
                htmlFor={idAttempts}
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}
              >
                Tentatives max avant blocage
              </label>
              <input
                id={idAttempts}
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={form.maxLoginAttempts ?? 5}
                onChange={(e) => set('maxLoginAttempts', parseInt(e.target.value, 10))}
                aria-describedby={`${idAttemptsHint}${validErrors.maxLoginAttempts ? ` ${idAttempts}-err` : ''}`}
                aria-invalid={!!validErrors.maxLoginAttempts || undefined}
                onFocus={() => setFocusedField(idAttempts)}
                onBlur={() => setFocusedField(null)}
                style={focusedField === idAttempts ? inputFocusCss : inputCss}
              />
              <p id={idAttemptsHint} style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>Entre 1 et 20 tentatives. Recommandé : 5.</p>
              {validErrors.maxLoginAttempts && (
                <p id={`${idAttempts}-err`} role="alert" style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>
                  {validErrors.maxLoginAttempts}
                </p>
              )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${form.require2FA ? 'rgba(45,125,210,0.3)' : 'var(--border)'}`, transition: 'border-color 0.2s', gap: 16 }}>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px' }}>
                Imposer la 2FA à tous les utilisateurs
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                Si activé, tout utilisateur sans 2FA sera forcé de la configurer à sa prochaine connexion.
              </p>
            </div>
            <Toggle
              checked={form.require2FA ?? false}
              onChange={(v) => set('require2FA', v)}
              label="Imposer la 2FA à tous les utilisateurs"
            />
          </div>
          {form.require2FA && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
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
                <div aria-hidden="true" style={{ color: 'var(--primary)' }}><Monitor size={15} /></div>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Sessions actives</h2>
              </div>
              <p aria-live="polite" style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0 23px' }}>
                Vos appareils connectés — {sessions.length} session{sessions.length > 1 ? 's' : ''}
              </p>
            </div>
            {/* H1: minHeight 44px; C2: ouvre la modale de confirmation */}
            {otherSessions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmAll(true)}
                disabled={revokeAllMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: revokeAllMut.isPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, flexShrink: 0, opacity: revokeAllMut.isPending ? 0.65 : 1 }}
              >
                {revokeAllMut.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <LogOut size={12} aria-hidden="true" />}
                Déconnecter les autres sessions
              </button>
            )}
          </div>

          {/* C1: erreurs révocation */}
          {revokeAllErr && (
            <p role="alert" aria-live="assertive" style={{ fontSize: 12.5, color: '#ef4444', margin: '0 0 10px', padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius-md)' }}>
              {revokeAllErr}
            </p>
          )}
          {revokeError && (
            <p role="alert" aria-live="assertive" style={{ fontSize: 12.5, color: '#ef4444', margin: '0 0 10px', padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius-md)' }}>
              {revokeError}
            </p>
          )}

          {sessionsLoading
            ? (
              <>
                {/* C6: AT feedback pendant le chargement des sessions */}
                <p className="sr-only" role="status">Chargement des sessions actives…</p>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} aria-hidden="true" style={{ height: 66, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8 }} className="animate-pulse" />
                ))}
              </>
            )
            : sessions.length === 0
              ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                  Aucune session active
                </p>
              )
              : (
                // H3: <ul> pour la sémantique de liste
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}>
                  {sessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onRevoke={handleRevoke}
                      isRevoking={revokingId === s.id}  // C4: par session
                    />
                  ))}
                </ul>
              )
          }
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          {/* H2: feedback succès */}
          {saveSuccess && !dirty && (
            <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#22c55e', fontFamily: 'var(--font-display)' }}>
              <Check size={14} aria-hidden="true" />
              Modifications enregistrées
            </span>
          )}
          {/* C1: erreur sauvegarde */}
          {saveError && (
            <p role="alert" aria-live="assertive" style={{ fontSize: 12.5, color: '#ef4444', margin: 0 }}>
              {saveError}
            </p>
          )}
          <button
            type="submit"
            disabled={!dirty || updateMut.isPending}
            aria-busy={updateMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 28px', borderRadius: 'var(--radius-md)', border: 'none', background: dirty ? 'var(--primary)' : 'var(--surface-2)', color: dirty ? '#fff' : 'var(--text-3)', cursor: dirty && !updateMut.isPending ? 'pointer' : 'not-allowed', fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700, boxShadow: dirty ? '0 4px 14px rgba(45,125,210,0.3)' : 'none', transition: 'all 0.2s', opacity: updateMut.isPending ? 0.65 : 1 }}
          >
            {updateMut.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            Enregistrer les modifications
          </button>
        </div>
      </form>
    </>
  )
}
