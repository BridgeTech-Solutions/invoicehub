'use client'

import { useState, useRef, useId } from 'react'
import {
  User, Lock, Shield, Monitor, Camera, Trash2, Loader2,
  Eye, EyeOff, Smartphone, LogOut, X, Copy, Check, AlertCircle, Key, Bell,
} from 'lucide-react'
import {
  useMe, useUpdateMe, useChangePassword, useUploadAvatar, useDeleteAvatar,
} from '@/features/users/hooks'
import {
  use2FAEnable, use2FAVerify, use2FADisable, use2FARegenerateBackupCodes,
  useSessions, useRevokeSession, useRevokeAllSessions,
} from '@/features/auth/hooks'
import {
  useNotificationSettings, useUpdateNotificationSettings,
  useDisableAllNotifications, useEnableAllNotifications,
} from '@/features/notifications/hooks'
import type { NotificationType, NotificationChannel } from '@/features/notifications/types'
import { useAuthStore } from '@/store/auth'
import { getInitials, formatDate } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'

// ─── Section card wrapper ──────────────────────────────────────
function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const focusOn  = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
}
const focusOff = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
}

// ─── Error banner ─────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
      <AlertCircle size={14} aria-hidden />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Profile Info section ─────────────────────────────────────
function ProfileInfoSection() {
  const { data: me, isLoading } = useMe()
  const updateMut = useUpdateMe()
  const uploadMut = useUploadAvatar()
  const deleteMut = useDeleteAvatar()
  const fileRef   = useRef<HTMLInputElement>(null)
  const isMobile  = useIsMobile()

  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({ firstName: '', lastName: '', phone: '' })

  const idFirstName = useId()
  const idLastName  = useId()
  const idPhone     = useId()

  function startEdit() {
    if (!me) return
    setForm({ firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '' })
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync({ firstName: form.firstName, lastName: form.lastName, phone: form.phone || undefined })
    setEditing(false)
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadMut.mutate(file)
    e.target.value = ''
  }

  if (isLoading || !me) {
    return (
      <div aria-hidden="true" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 11, width: 200, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
      </div>
    )
  }

  const fullName     = `${me.firstName} ${me.lastName}`
  const initials     = getInitials(fullName)
  const avatarColors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444']
  const avatarColor  = avatarColors[me.id.charCodeAt(0) % avatarColors.length]
  const avatarPending = uploadMut.isPending || deleteMut.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {updateMut.isError && <ErrorBanner message="Erreur lors de la mise à jour du profil. Veuillez réessayer." />}

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {me.avatarUrl
            ? <img
                src={me.avatarUrl}
                alt={`Avatar de ${fullName}`}
                style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }}
              />
            : <div
                aria-hidden="true"
                style={{ width: 72, height: 72, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', border: '3px solid var(--border)' }}
              >
                {initials}
              </div>
          }
          {avatarPending && (
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#fff' }} />
            </div>
          )}
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>{fullName}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 8px', fontFamily: 'var(--font-mono)' }}>{me.email}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarChange}
              aria-label="Choisir une photo de profil"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarPending}
              aria-label="Changer la photo de profil"
              aria-busy={uploadMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: avatarPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500, opacity: avatarPending ? 0.65 : 1 }}
            >
              <Camera size={12} aria-hidden /> Changer
            </button>
            {me.avatarUrl && (
              <button
                type="button"
                onClick={() => deleteMut.mutate()}
                disabled={avatarPending}
                aria-label="Supprimer la photo de profil"
                aria-busy={deleteMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: avatarPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500, opacity: avatarPending ? 0.65 : 1 }}
              >
                <Trash2 size={12} aria-hidden /> Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fields */}
      {editing ? (
        <form onSubmit={handleSave} aria-busy={updateMut.isPending} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Field label="Prénom" htmlFor={idFirstName}>
              <input id={idFirstName} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputCss} onFocus={focusOn} onBlur={focusOff} />
            </Field>
            <Field label="Nom" htmlFor={idLastName}>
              <input id={idLastName} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputCss} onFocus={focusOn} onBlur={focusOff} />
            </Field>
          </div>
          <Field label="Téléphone" htmlFor={idPhone}>
            <input id={idPhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+237 6XX XXX XXX" style={inputCss} onFocus={focusOn} onBlur={focusOff} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(false)} style={{ padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={updateMut.isPending} aria-disabled={updateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: updateMut.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: updateMut.isPending ? 0.65 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.25)', transition: 'opacity 0.15s' }}>
              {updateMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
              Enregistrer
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Prénom',    value: me.firstName },
            { label: 'Nom',       value: me.lastName },
            { label: 'Email',     value: me.email },
            { label: 'Téléphone', value: me.phone ?? '—' },
          ].map((f) => (
            <div key={f.label}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 3px' }}>{f.label}</p>
              <p style={{ fontSize: 13.5, color: 'var(--text-1)', margin: 0 }}>{f.value}</p>
            </div>
          ))}
          <div style={{ gridColumn: isMobile ? '1' : '1/-1', paddingTop: 4 }}>
            <button type="button" onClick={startEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Modifier mes informations
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Password section ──────────────────────────────────────────
function PasswordSection() {
  const changeMut = useChangePassword()
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [show, setShow]   = useState({ cur: false, new: false, con: false })
  const [localError, setLocalError] = useState('')

  const idCurrent = useId()
  const idNew     = useId()
  const idConfirm = useId()

  const FIELDS = [
    { label: 'Mot de passe actuel',             key: 'currentPassword' as const, showKey: 'cur' as const, id: idCurrent },
    { label: 'Nouveau mot de passe',             key: 'newPassword'     as const, showKey: 'new' as const, id: idNew     },
    { label: 'Confirmer le nouveau mot de passe', key: 'confirm'        as const, showKey: 'con' as const, id: idConfirm },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError('')
    if (form.newPassword.length < 8) { setLocalError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return }
    if (form.newPassword !== form.confirm) { setLocalError('Les mots de passe ne correspondent pas.'); return }
    await changeMut.mutateAsync({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    setForm({ currentPassword: '', newPassword: '', confirm: '' })
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={changeMut.isPending} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
      {changeMut.isError && <ErrorBanner message="Mot de passe actuel incorrect ou erreur serveur. Veuillez réessayer." />}

      {FIELDS.map(({ label, key, showKey, id }) => (
        <Field key={key} label={label} htmlFor={id}>
          <div style={{ position: 'relative' }}>
            <input
              id={id}
              type={show[showKey] ? 'text' : 'password'}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              style={{ ...inputCss, paddingRight: 42 }}
              required
              aria-required
              onFocus={focusOn} onBlur={focusOff}
            />
            <button
              type="button"
              onClick={() => setShow({ ...show, [showKey]: !show[showKey] })}
              aria-label={show[showKey] ? `Masquer ${label.toLowerCase()}` : `Afficher ${label.toLowerCase()}`}
              aria-pressed={show[showKey]}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}
            >
              {show[showKey] ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
          </div>
        </Field>
      ))}

      {localError && (
        <p role="alert" style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{localError}</p>
      )}

      <button
        type="submit"
        disabled={changeMut.isPending}
        aria-disabled={changeMut.isPending}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: changeMut.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: changeMut.isPending ? 0.65 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.25)', transition: 'opacity 0.15s' }}
      >
        {changeMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Lock size={13} aria-hidden />}
        Changer le mot de passe
      </button>
    </form>
  )
}

// ─── 2FA section ──────────────────────────────────────────────
function TwoFASection() {
  const { user }   = useAuthStore()
  const enabled    = user?.twoFactorEnabled ?? false
  const enableMut  = use2FAEnable()
  const verifyMut  = use2FAVerify()
  const disableMut = use2FADisable()
  const regenMut   = use2FARegenerateBackupCodes()

  const [step, setStep]               = useState<'idle' | 'setup' | 'disable' | 'regen'>('idle')
  const [qrCode, setQrCode]           = useState('')
  const [secret, setSecret]           = useState('')
  const [token, setToken]             = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copied, setCopied]           = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)

  const idTokenSetup   = useId()
  const idTokenDisable = useId()
  const idTokenRegen   = useId()

  async function handleEnable() {
    const res = await enableMut.mutateAsync()
    setQrCode(res.qrCode)
    setSecret(res.secret)
    setStep('setup')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const res = await verifyMut.mutateAsync({ token })
    setBackupCodes(res.backupCodes)
    setStep('idle')
    setToken('')
  }

  async function handleRegen(e: React.FormEvent) {
    e.preventDefault()
    const res = await regenMut.mutateAsync(token)
    setBackupCodes(res.backupCodes)
    setStep('idle')
    setToken('')
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    await disableMut.mutateAsync(token)
    setStep('idle')
    setToken('')
  }

  function copyBackup() {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copySecret() {
    navigator.clipboard.writeText(secret)
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2000)
  }

  // ── Backup codes display ─────────────────────────────────────
  if (backupCodes.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        <div role="status" aria-live="polite" style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.07)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#10b981', margin: '0 0 6px' }}>2FA activé avec succès</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>Conservez ces codes de secours en lieu sûr. Chaque code ne peut être utilisé qu'une fois.</p>
        </div>
        <div
          aria-label="Codes de secours 2FA"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 14, background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
        >
          {backupCodes.map((code) => (
            <code key={code} style={{ fontSize: 12.5, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{code}</code>
          ))}
        </div>
        <button type="button" onClick={copyBackup}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {copied ? <><Check size={12} aria-hidden /> Copié !</> : <><Copy size={12} aria-hidden /> Copier les codes</>}
        </button>
        <button type="button" onClick={() => setBackupCodes([])}
          style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          Fermer
        </button>
      </div>
    )
  }

  // ── Setup step ───────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
          Scannez ce QR code avec votre application d&apos;authentification (Google Authenticator, Authy…)
        </p>
        {qrCode && (
          <img
            src={qrCode}
            alt="QR Code pour configurer l'authentification à deux facteurs"
            style={{ width: 180, height: 180, borderRadius: 8, border: '2px solid var(--border)' }}
          />
        )}
        {/* Secret textuel — alternative si scan impossible */}
        {secret && (
          <div style={{ padding: '10px 14px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
              Ou saisissez ce code manuellement
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '0.1em', wordBreak: 'break-all' }}>
                {secret}
              </code>
              <button type="button" onClick={copySecret} aria-label="Copier le secret 2FA"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}>
                {secretCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleVerify} aria-busy={verifyMut.isPending} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Code de vérification (6 chiffres)" htmlFor={idTokenSetup}>
            <input
              id={idTokenSetup}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              maxLength={6}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ ...inputCss, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }}
              required
              aria-required
              onFocus={focusOn} onBlur={focusOff}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setStep('idle')} style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={verifyMut.isPending || token.length !== 6} aria-disabled={verifyMut.isPending || token.length !== 6}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: (verifyMut.isPending || token.length !== 6) ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: token.length !== 6 ? 0.6 : 1, transition: 'opacity 0.15s' }}>
              {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Shield size={13} aria-hidden />}
              Activer
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ── Regen step ───────────────────────────────────────────────
  if (step === 'regen') {
    return (
      <form onSubmit={handleRegen} aria-busy={regenMut.isPending} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Saisissez votre code TOTP actuel pour régénérer vos codes de secours. Les anciens codes seront invalidés.</p>
        <Field label="Code TOTP (6 chiffres)" htmlFor={idTokenRegen}>
          <input
            id={idTokenRegen}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={6}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ ...inputCss, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }}
            required
            aria-required
            onFocus={focusOn} onBlur={focusOff}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setStep('idle'); setToken('') }} style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
          <button type="submit" disabled={regenMut.isPending || token.length !== 6} aria-disabled={regenMut.isPending || token.length !== 6}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: (regenMut.isPending || token.length !== 6) ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: token.length !== 6 ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            {regenMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Key size={13} aria-hidden />}
            Régénérer
          </button>
        </div>
      </form>
    )
  }

  // ── Disable step ─────────────────────────────────────────────
  if (step === 'disable') {
    return (
      <form onSubmit={handleDisable} aria-busy={disableMut.isPending} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Saisissez votre code TOTP actuel pour désactiver la 2FA.</p>
        <Field label="Code TOTP (6 chiffres)" htmlFor={idTokenDisable}>
          <input
            id={idTokenDisable}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={6}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ ...inputCss, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }}
            required
            aria-required
            onFocus={focusOn} onBlur={focusOff}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setStep('idle')} style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
          <button type="submit" disabled={disableMut.isPending} aria-disabled={disableMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: disableMut.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: disableMut.isPending ? 0.65 : 1, transition: 'opacity 0.15s' }}>
            {disableMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <X size={13} aria-hidden />}
            Désactiver
          </button>
        </div>
      </form>
    )
  }

  // ── Idle state ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: enabled ? 'rgba(16,185,129,0.07)' : 'var(--surface)', border: `1.5px solid ${enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)' }}>
        <Shield size={20} aria-hidden style={{ color: enabled ? '#10b981' : 'var(--text-3)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Authentification à deux facteurs</p>
          <p style={{ fontSize: 12.5, color: enabled ? '#10b981' : 'var(--text-3)', margin: '2px 0 0', fontWeight: enabled ? 600 : 400 }}>
            {enabled ? 'Activée — votre compte est protégé' : 'Non activée — recommandé pour la sécurité'}
          </p>
        </div>
      </div>
      {enabled ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setStep('regen'); setToken('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <Key size={13} aria-hidden /> Régénérer les codes de secours
          </button>
          <button type="button" onClick={() => setStep('disable')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <X size={13} aria-hidden /> Désactiver la 2FA
          </button>
        </div>
      ) : (
        <button type="button" onClick={handleEnable} disabled={enableMut.isPending} aria-disabled={enableMut.isPending}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: enableMut.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: enableMut.isPending ? 0.65 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.25)', transition: 'opacity 0.15s' }}>
          {enableMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Smartphone size={13} aria-hidden />}
          Activer la 2FA
        </button>
      )}
    </div>
  )
}

// ─── Sessions section ──────────────────────────────────────────
function SessionsSection() {
  const { data: sessions, isLoading } = useSessions()
  const revokeMut    = useRevokeSession()
  const revokeAllMut = useRevokeAllSessions()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }} aria-live="polite">
          {sessions?.length ?? 0} session{(sessions?.length ?? 0) > 1 ? 's' : ''} active{(sessions?.length ?? 0) > 1 ? 's' : ''}
        </p>
        {(sessions?.length ?? 0) > 1 && (
          <button
            type="button"
            onClick={() => revokeAllMut.mutate()}
            disabled={revokeAllMut.isPending}
            aria-disabled={revokeAllMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: revokeAllMut.isPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: revokeAllMut.isPending ? 0.65 : 1 }}
          >
            <LogOut size={12} aria-hidden /> Révoquer toutes les autres
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
            <div key={i} aria-hidden="true" style={{ height: 56, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          ))
          : sessions?.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: s.current ? 'rgba(45,125,210,0.05)' : 'var(--surface)', border: `1px solid ${s.current ? 'rgba(45,125,210,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)' }}>
              <Monitor size={16} aria-hidden style={{ color: s.current ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                  {s.deviceName || 'Navigateur web'}
                  {s.current && (
                    <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      Session courante
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                  {s.ipAddress ?? '—'} · Connexion le <time dateTime={s.createdAt}>{formatDate(s.createdAt)}</time>
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => revokeMut.mutate(s.id)}
                  disabled={revokeMut.isPending}
                  aria-label={`Révoquer la session ${s.deviceName || 'Navigateur web'} (${s.ipAddress ?? ''})`}
                  style={{ background: 'none', border: 'none', cursor: revokeMut.isPending ? 'not-allowed' : 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, transition: 'color 0.15s' }}
                  onFocus={(e)      => { e.currentTarget.style.color = '#ef4444' }}
                  onBlur={(e)       => { e.currentTarget.style.color = 'var(--text-3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Notifications section ────────────────────────────────────
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
  user_created:            'Nouveau utilisateur',
  expense_submitted:       'Dépense soumise',
  expense_approved:        'Dépense approuvée',
  expense_rejected:        'Dépense rejetée',
  purchase_order_received: 'Bon de commande reçu',
  supplier_invoice_due:    'Facture fournisseur échue',
  system:                  'Événement système',
}

const NOTIF_GROUPS: { label: string; types: NotificationType[] }[] = [
  { label: 'Proformas',  types: ['proforma_sent', 'proforma_accepted', 'proforma_rejected', 'proforma_expired'] },
  { label: 'Factures',   types: ['invoice_issued', 'invoice_paid', 'invoice_partially_paid', 'invoice_overdue'] },
  { label: 'Paiements',  types: ['payment_registered'] },
  { label: 'Alertes',    types: ['reminder_sent', 'user_created', 'system'] },
]

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'in_app', label: 'App' },
  { value: 'email',  label: 'Email' },
  { value: 'both',   label: 'Les deux' },
]

function NotificationsSection() {
  const { data: settings = [], isLoading } = useNotificationSettings()
  const updateMut    = useUpdateNotificationSettings()
  const disableAllMut = useDisableAllNotifications()
  const enableAllMut  = useEnableAllNotifications()

  const [local, setLocal] = useState<Record<string, { channel: NotificationChannel; enabled: boolean }>>({})
  const [dirty, setDirty] = useState(false)

  const effective = (type: NotificationType) => {
    const server = settings.find((s) => s.type === type)
    return local[type] ?? { channel: (server?.channel ?? 'both') as NotificationChannel, enabled: server?.enabled ?? true }
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
    const allTypes = NOTIF_GROUPS.flatMap((g) => g.types)
    await updateMut.mutateAsync(allTypes.map((type) => ({ type, ...effective(type) })))
    setLocal({})
    setDirty(false)
  }

  async function handleDisableAll() {
    await disableAllMut.mutateAsync()
    setLocal({})
    setDirty(false)
  }

  async function handleEnableAll() {
    await enableAllMut.mutateAsync()
    setLocal({})
    setDirty(false)
  }

  const isBusy = updateMut.isPending || disableAllMut.isPending || enableAllMut.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
          Choisissez pour quels événements et sur quel canal vous souhaitez être notifié.
        </p>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={handleDisableAll} disabled={isBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isBusy ? 0.5 : 1 }}>
            {disableAllMut.isPending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <X size={11} aria-hidden />}
            Tout désactiver
          </button>
          <button type="button" onClick={handleEnableAll} disabled={isBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isBusy ? 0.5 : 1 }}>
            {enableAllMut.isPending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Check size={11} aria-hidden />}
            Tout activer
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '1fr 56px 188px', gap: 8, padding: '0 4px', marginBottom: 6 }}>
        {[
          { label: 'Événement', align: 'left'   as const },
          { label: 'Actif',     align: 'center' as const },
          { label: 'Canal',     align: 'left'   as const },
        ].map((h) => (
          <span key={h.label} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h.align }}>
            {h.label}
          </span>
        ))}
      </div>

      {/* Groups */}
      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} aria-hidden="true" style={{ height: 38, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 4 }} className="animate-pulse" />
          ))
        : NOTIF_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{ padding: '8px 4px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {group.label}
              </div>
              {group.types.map((type) => {
                const s = effective(type)
                return (
                  <div key={type}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 56px 188px', gap: 8, padding: '8px 4px', borderRadius: 'var(--radius-md)', transition: 'background 0.1s', alignItems: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Event label */}
                    <span style={{ fontSize: 13, color: s.enabled ? 'var(--text-1)' : 'var(--text-3)', transition: 'color 0.15s' }}>
                      {NOTIF_LABELS[type]}
                    </span>

                    {/* Enabled toggle */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={s.enabled}
                          onChange={() => toggleEnabled(type)}
                          aria-label={`Activer ${NOTIF_LABELS[type]}`}
                        />
                        <div aria-hidden="true" style={{ width: 32, height: 18, borderRadius: 9, background: s.enabled ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: s.enabled ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>

                    {/* Channel chips */}
                    <div style={{ display: 'flex', gap: 4, opacity: s.enabled ? 1 : 0.3, pointerEvents: s.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      {CHANNELS.map((ch) => {
                        const active = s.channel === ch.value
                        return (
                          <button key={ch.value} type="button" onClick={() => setChannel(type, ch.value)}
                            style={{ padding: '3px 9px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary-light)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-3)', fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                            {ch.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
      }

      {/* Save bar */}
      {dirty && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleSave} disabled={isBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: isBusy ? 0.65 : 1 }}>
            {updateMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            Sauvegarder les préférences
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function ProfilePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Mon profil</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>Gérez vos informations personnelles et la sécurité de votre compte.</p>
      </div>

      <Section icon={<User size={16} />} title="Informations personnelles">
        <ProfileInfoSection />
      </Section>

      <Section icon={<Lock size={16} />} title="Changer le mot de passe">
        <PasswordSection />
      </Section>

      <Section icon={<Shield size={16} />} title="Authentification à deux facteurs (2FA)">
        <TwoFASection />
      </Section>

      <Section icon={<Monitor size={16} />} title="Sessions actives">
        <SessionsSection />
      </Section>

      <Section icon={<Bell size={16} />} title="Préférences de notifications">
        <NotificationsSection />
      </Section>
    </div>
  )
}
