'use client'

import { useState, useRef, useId } from 'react'
import {
  User, Lock, Shield, Monitor, Camera, Trash2, Loader2,
  Eye, EyeOff, Smartphone, LogOut, X, Copy, Check, AlertCircle,
  Key, Bell, Globe, Clock, Palette,
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
import type { Session } from '@/features/auth/types'
import { useAuthStore } from '@/store/auth'
import { getInitials, formatDate } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'

// ─── Tab config ───────────────────────────────────────────────
type ActiveTab = 'profile' | 'security' | 'sessions' | 'notifications'

const TABS: { id: ActiveTab; label: string; Icon: React.FC<{ size?: number; 'aria-hidden'?: boolean }> }[] = [
  { id: 'profile',       label: 'Profil',       Icon: User    },
  { id: 'security',      label: 'Sécurité',      Icon: Shield  },
  { id: 'sessions',      label: 'Sessions',      Icon: Monitor },
  { id: 'notifications', label: 'Notifications', Icon: Bell    },
]

// ─── Password strength ────────────────────────────────────────
function getStrength(pwd: string) {
  if (!pwd) return { level: 0, label: '', color: '' }
  let s = 0
  if (pwd.length >= 8)          s++
  if (pwd.length >= 12)         s++
  if (/[A-Z]/.test(pwd))        s++
  if (/[a-z]/.test(pwd))        s++
  if (/\d/.test(pwd))           s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  if (s <= 2) return { level: 1, label: 'Faible',  color: '#ef4444' }
  if (s === 3) return { level: 2, label: 'Moyen',   color: '#f59e0b' }
  if (s === 4) return { level: 3, label: 'Bon',     color: '#3b82f6' }
  return          { level: 4, label: 'Fort',    color: '#10b981' }
}

// ─── Device parser ────────────────────────────────────────────
function parseDevice(s: Session) {
  if (s.deviceInfo && typeof s.deviceInfo === 'object') {
    return {
      browser: String(s.deviceInfo.browser ?? s.deviceInfo.name ?? 'Navigateur'),
      os:      String(s.deviceInfo.os ?? s.deviceInfo.platform ?? ''),
    }
  }
  const name = s.deviceName ?? ''
  return {
    browser: name.match(/Chrome|Firefox|Safari|Edge|Opera/i)?.[0] ?? 'Navigateur',
    os:      name.match(/Windows|Mac|Linux|Android|iOS|iPhone|iPad/i)?.[0] ?? '',
  }
}

// ─── Shared style helpers ─────────────────────────────────────
const inputBase: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const iFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'
}
const iBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '20px 24px', ...style }}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 18px' }}>
      {children}
    </h2>
  )
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
      <AlertCircle size={14} aria-hidden /><span style={{ fontSize: 13 }}>{msg}</span>
    </div>
  )
}

function PrimaryBtn({ children, onClick, type = 'submit', disabled, pending }: {
  children: React.ReactNode; onClick?: () => void; type?: 'submit' | 'button'; disabled?: boolean; pending?: boolean
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || pending} aria-disabled={disabled || pending}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: (disabled || pending) ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: (disabled || pending) ? 0.65 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.2)', transition: 'opacity 0.15s' }}>
      {children}
    </button>
  )
}

function GhostBtn({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${danger ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, background: danger ? 'rgba(239,68,68,0.05)' : 'transparent', color: danger ? '#ef4444' : 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, transition: 'opacity 0.15s' }}>
      {children}
    </button>
  )
}

// ─── PROFILE TAB ──────────────────────────────────────────────
function ProfileTab() {
  const { data: me, isLoading } = useMe()
  const updateMut = useUpdateMe()
  const uploadMut = useUploadAvatar()
  const deleteMut = useDeleteAvatar()
  const fileRef   = useRef<HTMLInputElement>(null)
  const isMobile  = useIsMobile()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '',
    language: 'fr', timezone: 'Africa/Douala', theme: 'system' as 'light' | 'dark' | 'system',
  })

  const idFN = useId(); const idLN = useId(); const idPh = useId()
  const idLg = useId(); const idTz = useId(); const idTh = useId()

  function startEdit() {
    if (!me) return
    setForm({
      firstName: me.firstName,
      lastName:  me.lastName,
      phone:     me.phone ?? '',
      language:  me.language  ?? 'fr',
      timezone:  me.timezone  ?? 'Africa/Douala',
      theme:     me.theme     ?? 'system',
    })
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await updateMut.mutateAsync({
      firstName: form.firstName,
      lastName:  form.lastName,
      phone:     form.phone || undefined,
      language:  form.language,
      timezone:  form.timezone,
      theme:     form.theme,
    })
    setEditing(false)
  }

  if (isLoading || !me) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[1, 2].map(i => (
          <Card key={i}>
            <div style={{ height: 80, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          </Card>
        ))}
      </div>
    )
  }

  const fullName    = `${me.firstName} ${me.lastName}`
  const avatarColor = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'][me.id.charCodeAt(0) % 5]
  const avatarBusy  = uploadMut.isPending || deleteMut.isPending

  const selectCss: React.CSSProperties = {
    ...inputBase,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235a7a96' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {updateMut.isError && <ErrBanner msg="Erreur lors de la mise à jour. Veuillez réessayer." />}

      {/* Avatar */}
      <Card>
        <CardTitle>Photo de profil</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {me.avatarUrl
              ? <img src={me.avatarUrl} alt={`Avatar de ${fullName}`}
                  style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }} />
              : <div aria-hidden style={{ width: 72, height: 72, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', border: '3px solid var(--border)' }}>
                  {getInitials(fullName)}
                </div>
            }
            {avatarBusy && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: '#fff' }} />
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>{fullName}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', fontFamily: 'var(--font-mono)' }}>{me.email}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = '' }}
                aria-label="Choisir une photo" style={{ display: 'none' }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarBusy}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: avatarBusy ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500, opacity: avatarBusy ? 0.65 : 1 }}>
                <Camera size={12} aria-hidden /> Changer
              </button>
              {me.avatarUrl && (
                <button type="button" onClick={() => deleteMut.mutate()} disabled={avatarBusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: avatarBusy ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500, opacity: avatarBusy ? 0.65 : 1 }}>
                  <Trash2 size={12} aria-hidden /> Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal info + preferences */}
      <Card>
        <CardTitle>Informations personnelles</CardTitle>
        {editing ? (
          <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <Field label="Prénom" htmlFor={idFN}>
                <input id={idFN} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })}
                  style={inputBase} onFocus={iFocus} onBlur={iBlur} required />
              </Field>
              <Field label="Nom" htmlFor={idLN}>
                <input id={idLN} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })}
                  style={inputBase} onFocus={iFocus} onBlur={iBlur} required />
              </Field>
            </div>
            <Field label="Téléphone" htmlFor={idPh}>
              <input id={idPh} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+237 6XX XXX XXX" style={inputBase} onFocus={iFocus} onBlur={iBlur} />
            </Field>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Langue" htmlFor={idLg}>
                <select id={idLg} value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
                  style={selectCss} onFocus={iFocus} onBlur={iBlur}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="Fuseau horaire" htmlFor={idTz}>
                <select id={idTz} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}
                  style={selectCss} onFocus={iFocus} onBlur={iBlur}>
                  <option value="Africa/Douala">Africa/Douala (UTC+1)</option>
                  <option value="Africa/Lagos">Africa/Lagos (UTC+1)</option>
                  <option value="Africa/Abidjan">Africa/Abidjan (UTC)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/Paris">Europe/Paris (UTC+1/2)</option>
                </select>
              </Field>
              <Field label="Thème" htmlFor={idTh}>
                <select id={idTh} value={form.theme} onChange={e => setForm({ ...form, theme: e.target.value as 'light' | 'dark' | 'system' })}
                  style={selectCss} onFocus={iFocus} onBlur={iBlur}>
                  <option value="system">Système</option>
                  <option value="light">Clair</option>
                  <option value="dark">Sombre</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <GhostBtn onClick={() => setEditing(false)}>Annuler</GhostBtn>
              <PrimaryBtn pending={updateMut.isPending}>
                {updateMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
                Enregistrer
              </PrimaryBtn>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              {[
                { label: 'Prénom',    value: me.firstName },
                { label: 'Nom',       value: me.lastName  },
                { label: 'Email',     value: me.email     },
                { label: 'Téléphone', value: me.phone ?? '—' },
              ].map(f => (
                <div key={f.label}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 3px' }}>{f.label}</p>
                  <p style={{ fontSize: 13.5, color: 'var(--text-1)', margin: 0 }}>{f.value}</p>
                </div>
              ))}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
              {[
                { label: 'Langue',    value: me.language === 'en' ? 'English' : 'Français',                                       Icon: Globe   },
                { label: 'Fuseau',    value: me.timezone ?? 'Africa/Douala',                                                       Icon: Clock   },
                { label: 'Thème',     value: me.theme === 'dark' ? 'Sombre' : me.theme === 'light' ? 'Clair' : 'Système',         Icon: Palette },
              ].map(f => (
                <div key={f.label}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 3px' }}>{f.label}</p>
                  <p style={{ fontSize: 13.5, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <f.Icon size={13} aria-hidden style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    {f.value}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <button type="button" onClick={startEdit}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                Modifier mes informations
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── SECURITY TAB ─────────────────────────────────────────────
function PasswordCard() {
  const changeMut = useChangePassword()
  const [form, setForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [show, setShow]     = useState({ cur: false, nw: false, con: false })
  const [localErr, setLocalErr] = useState('')
  const idCur = useId(); const idNew = useId(); const idCon = useId()
  const strength = getStrength(form.newPassword)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalErr('')
    if (form.newPassword.length < 8) { setLocalErr('Au moins 8 caractères requis.'); return }
    if (form.newPassword !== form.confirm) { setLocalErr('Les mots de passe ne correspondent pas.'); return }
    await changeMut.mutateAsync({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    setForm({ currentPassword: '', newPassword: '', confirm: '' })
  }

  const FIELDS: { label: string; key: keyof typeof form; showKey: keyof typeof show; id: string }[] = [
    { label: 'Mot de passe actuel',              key: 'currentPassword', showKey: 'cur', id: idCur },
    { label: 'Nouveau mot de passe',             key: 'newPassword',     showKey: 'nw',  id: idNew },
    { label: 'Confirmer le nouveau mot de passe', key: 'confirm',        showKey: 'con', id: idCon },
  ]

  return (
    <Card>
      <CardTitle>Changer le mot de passe</CardTitle>
      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
        {changeMut.isError && <ErrBanner msg="Mot de passe actuel incorrect. Veuillez réessayer." />}
        {FIELDS.map(({ label, key, showKey, id }) => (
          <Field key={key} label={label} htmlFor={id}>
            <div style={{ position: 'relative' }}>
              <input
                id={id}
                type={show[showKey] ? 'text' : 'password'}
                value={form[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                style={{ ...inputBase, paddingRight: 42 }}
                required
                onFocus={iFocus} onBlur={iBlur}
              />
              <button type="button"
                onClick={() => setShow({ ...show, [showKey]: !show[showKey] })}
                aria-label={show[showKey] ? 'Masquer' : 'Afficher'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center' }}>
                {show[showKey] ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
              </button>
            </div>
            {key === 'newPassword' && form.newPassword && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength.level ? strength.color : 'var(--border)', transition: 'background 0.25s' }} />
                  ))}
                </div>
                {strength.label && (
                  <p style={{ fontSize: 11.5, color: strength.color, margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {strength.label}
                  </p>
                )}
              </div>
            )}
          </Field>
        ))}
        {localErr && <p role="alert" style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{localErr}</p>}
        <div style={{ paddingTop: 2 }}>
          <PrimaryBtn pending={changeMut.isPending}>
            {changeMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Lock size={13} aria-hidden />}
            Changer le mot de passe
          </PrimaryBtn>
        </div>
      </form>
    </Card>
  )
}

function TwoFACard() {
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
  const idSetup = useId(); const idDisable = useId(); const idRegen = useId()

  async function handleEnable() {
    const res = await enableMut.mutateAsync()
    setQrCode(res.qrCode); setSecret(res.secret); setStep('setup')
  }
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const res = await verifyMut.mutateAsync({ token })
    setBackupCodes(res.backupCodes); setStep('idle'); setToken('')
  }
  async function handleRegen(e: React.FormEvent) {
    e.preventDefault()
    const res = await regenMut.mutateAsync(token)
    setBackupCodes(res.backupCodes); setStep('idle'); setToken('')
  }
  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    await disableMut.mutateAsync(token); setStep('idle'); setToken('')
  }

  const TotpInput = ({ id }: { id: string }) => (
    <Field label="Code TOTP (6 chiffres)" htmlFor={id}>
      <input id={id} value={token} onChange={e => setToken(e.target.value)} maxLength={6}
        placeholder="123456" inputMode="numeric" autoComplete="one-time-code"
        style={{ ...inputBase, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }}
        required onFocus={iFocus} onBlur={iBlur} />
    </Field>
  )

  return (
    <Card>
      <CardTitle>Authentification à deux facteurs (2FA)</CardTitle>

      {backupCodes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
          <div role="status" style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.07)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#10b981', margin: '0 0 4px' }}>2FA activé avec succès</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>Conservez ces codes de secours en lieu sûr. Chaque code ne peut être utilisé qu'une fois.</p>
          </div>
          <div aria-label="Codes de secours 2FA" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            {backupCodes.map(code => <code key={code} style={{ fontSize: 12.5, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{code}</code>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              {copied ? <><Check size={12} aria-hidden /> Copié !</> : <><Copy size={12} aria-hidden /> Copier les codes</>}
            </GhostBtn>
            <GhostBtn onClick={() => setBackupCodes([])}>Fermer</GhostBtn>
          </div>
        </div>
      ) : step === 'setup' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Scannez ce QR code avec Google Authenticator, Authy ou une app compatible.</p>
          {qrCode && <img src={qrCode} alt="QR Code pour configurer la 2FA" style={{ width: 180, height: 180, borderRadius: 8, border: '2px solid var(--border)' }} />}
          {secret && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Ou saisir manuellement</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', wordBreak: 'break-all', flex: 1 }}>{secret}</code>
                <button type="button" onClick={() => { navigator.clipboard.writeText(secret); setSecretCopied(true); setTimeout(() => setSecretCopied(false), 2000) }}
                  aria-label="Copier le secret" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}>
                  {secretCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                </button>
              </div>
            </div>
          )}
          <form onSubmit={handleVerify} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <TotpInput id={idSetup} />
            <div style={{ display: 'flex', gap: 8 }}>
              <GhostBtn onClick={() => setStep('idle')}>Annuler</GhostBtn>
              <PrimaryBtn pending={verifyMut.isPending} disabled={token.length !== 6}>
                {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Shield size={13} aria-hidden />}
                Activer
              </PrimaryBtn>
            </div>
          </form>
        </div>
      ) : step === 'regen' ? (
        <form onSubmit={handleRegen} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Saisissez votre code TOTP pour régénérer vos codes de secours. Les anciens codes seront invalidés.</p>
          <TotpInput id={idRegen} />
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn onClick={() => { setStep('idle'); setToken('') }}>Annuler</GhostBtn>
            <PrimaryBtn pending={regenMut.isPending} disabled={token.length !== 6}>
              {regenMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Key size={13} aria-hidden />}
              Régénérer
            </PrimaryBtn>
          </div>
        </form>
      ) : step === 'disable' ? (
        <form onSubmit={handleDisable} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Saisissez votre code TOTP pour désactiver la 2FA.</p>
          <TotpInput id={idDisable} />
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn onClick={() => setStep('idle')}>Annuler</GhostBtn>
            <button type="submit" disabled={disableMut.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: disableMut.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: disableMut.isPending ? 0.65 : 1 }}>
              {disableMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <X size={13} aria-hidden />}
              Désactiver
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: enabled ? 'rgba(16,185,129,0.07)' : 'var(--surface-2)', border: `1.5px solid ${enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)' }}>
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
              <GhostBtn onClick={() => { setStep('regen'); setToken('') }}>
                <Key size={13} aria-hidden /> Régénérer les codes de secours
              </GhostBtn>
              <GhostBtn danger onClick={() => setStep('disable')}>
                <X size={13} aria-hidden /> Désactiver la 2FA
              </GhostBtn>
            </div>
          ) : (
            <PrimaryBtn type="button" onClick={handleEnable} pending={enableMut.isPending}>
              {enableMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Smartphone size={13} aria-hidden />}
              Activer la 2FA
            </PrimaryBtn>
          )}
        </div>
      )}
    </Card>
  )
}

function SecurityTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PasswordCard />
      <TwoFACard />
    </div>
  )
}

// ─── SESSIONS TAB ─────────────────────────────────────────────
function SessionsTab() {
  const { data: sessions, isLoading } = useSessions()
  const revokeMut    = useRevokeSession()
  const revokeAllMut = useRevokeAllSessions()

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 3px' }}>Sessions actives</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }} aria-live="polite">
            {sessions?.length ?? 0} session{(sessions?.length ?? 0) > 1 ? 's' : ''} active{(sessions?.length ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        {(sessions?.length ?? 0) > 1 && (
          <button type="button" onClick={() => revokeAllMut.mutate()} disabled={revokeAllMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: revokeAllMut.isPending ? 'not-allowed' : 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: revokeAllMut.isPending ? 0.65 : 1 }}>
            {revokeAllMut.isPending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <LogOut size={12} aria-hidden />}
            Révoquer toutes les autres
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading
          ? [1, 2].map(i => <div key={i} aria-hidden style={{ height: 68, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />)
          : sessions?.map(s => {
              const dev     = parseDevice(s)
              const expires = s.expiresAt ? new Date(s.expiresAt) : null
              const expired = expires ? expires < new Date() : false
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: s.current ? 'rgba(45,125,210,0.05)' : 'var(--surface-2)', border: `1px solid ${s.current ? 'rgba(45,125,210,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)' }}>
                  <Monitor size={16} aria-hidden style={{ color: s.current ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                        {dev.browser}{dev.os ? ` — ${dev.os}` : ''}
                      </p>
                      {s.current && (
                        <span style={{ fontSize: 10.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700, background: 'var(--primary-light)', padding: '1px 7px', borderRadius: 4 }}>
                          Session courante
                        </span>
                      )}
                      {expired && !s.current && (
                        <span style={{ fontSize: 10.5, color: '#f59e0b', fontFamily: 'var(--font-display)', fontWeight: 700, background: 'rgba(245,158,11,0.1)', padding: '1px 7px', borderRadius: 4 }}>
                          Expirée
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                      {s.ipAddress ?? '—'}
                      {' · '}
                      <time dateTime={s.createdAt}>Connecté le {formatDate(s.createdAt)}</time>
                      {expires && ` · Expire le ${formatDate(s.expiresAt)}`}
                    </p>
                  </div>
                  {!s.current && (
                    <button type="button" onClick={() => revokeMut.mutate(s.id)} disabled={revokeMut.isPending}
                      aria-label={`Révoquer la session (${s.ipAddress ?? ''})`}
                      style={{ background: 'none', border: 'none', cursor: revokeMut.isPending ? 'not-allowed' : 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', borderRadius: 4, flexShrink: 0, transition: 'color 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}>
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>
              )
            })
        }
      </div>
    </Card>
  )
}

// ─── NOTIFICATIONS TAB ────────────────────────────────────────
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
  { label: 'Proformas',         types: ['proforma_sent', 'proforma_accepted', 'proforma_rejected', 'proforma_expired'] },
  { label: 'Factures',          types: ['invoice_issued', 'invoice_paid', 'invoice_partially_paid', 'invoice_overdue'] },
  { label: 'Paiements',         types: ['payment_registered'] },
  { label: 'Achats & Dépenses', types: ['expense_submitted', 'expense_approved', 'expense_rejected', 'purchase_order_received', 'supplier_invoice_due'] },
  { label: 'Alertes',           types: ['reminder_sent', 'user_created', 'system'] },
]

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'in_app', label: 'App'     },
  { value: 'email',  label: 'Email'   },
  { value: 'both',   label: 'Les deux' },
]

function NotificationsTab() {
  const { data: settings = [], isLoading } = useNotificationSettings()
  const updateMut     = useUpdateNotificationSettings()
  const disableAllMut = useDisableAllNotifications()
  const enableAllMut  = useEnableAllNotifications()

  const [local, setLocal] = useState<Record<string, { channel: NotificationChannel; enabled: boolean }>>({})
  const [dirty, setDirty] = useState(false)

  const effective = (type: NotificationType) => {
    const srv = settings.find(s => s.type === type)
    return local[type] ?? { channel: (srv?.channel ?? 'both') as NotificationChannel, enabled: srv?.enabled ?? true }
  }

  function toggleEnabled(type: NotificationType) {
    const cur = effective(type)
    setLocal(p => ({ ...p, [type]: { ...cur, enabled: !cur.enabled } })); setDirty(true)
  }
  function setChannel(type: NotificationType, channel: NotificationChannel) {
    const cur = effective(type)
    setLocal(p => ({ ...p, [type]: { ...cur, channel } })); setDirty(true)
  }
  async function handleSave() {
    const all = NOTIF_GROUPS.flatMap(g => g.types)
    await updateMut.mutateAsync(all.map(type => ({ type, ...effective(type) })))
    setLocal({}); setDirty(false)
  }
  async function handleDisableAll() { await disableAllMut.mutateAsync(); setLocal({}); setDirty(false) }
  async function handleEnableAll()  { await enableAllMut.mutateAsync();  setLocal({}); setDirty(false) }

  const isBusy = updateMut.isPending || disableAllMut.isPending || enableAllMut.isPending

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>Préférences de notifications</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Configurez les événements et le canal de réception.</p>
        </div>
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
      <div aria-hidden style={{ display: 'grid', gridTemplateColumns: '1fr 56px 188px', gap: 8, padding: '0 4px', marginBottom: 6 }}>
        {[['Événement', 'left'], ['Actif', 'center'], ['Canal', 'left']] .map(([h, a]) => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: a as React.CSSProperties['textAlign'] }}>
            {h}
          </span>
        ))}
      </div>

      {isLoading
        ? Array.from({ length: 10 }).map((_, i) => (
            <div key={i} aria-hidden style={{ height: 38, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 4 }} className="animate-pulse" />
          ))
        : NOTIF_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ padding: '8px 4px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {group.label}
              </div>
              {group.types.map(type => {
                const s = effective(type)
                return (
                  <div key={type}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 56px 188px', gap: 8, padding: '8px 4px', borderRadius: 'var(--radius-md)', transition: 'background 0.1s', alignItems: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: 13, color: s.enabled ? 'var(--text-1)' : 'var(--text-3)', transition: 'color 0.15s' }}>
                      {NOTIF_LABELS[type]}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" className="sr-only" checked={s.enabled} onChange={() => toggleEnabled(type)} aria-label={`Activer ${NOTIF_LABELS[type]}`} />
                        <div aria-hidden style={{ width: 32, height: 18, borderRadius: 9, background: s.enabled ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: s.enabled ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                        </div>
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 4, opacity: s.enabled ? 1 : 0.3, pointerEvents: s.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      {CHANNELS.map(ch => {
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

      {dirty && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryBtn type="button" onClick={handleSave} pending={isBusy}>
            {updateMut.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            Sauvegarder les préférences
          </PrimaryBtn>
        </div>
      )}
    </Card>
  )
}

// ─── HERO + TABS NAV ──────────────────────────────────────────
function ProfileHero({ active, setActive }: { active: ActiveTab; setActive: (t: ActiveTab) => void }) {
  const { data: me } = useMe()
  const { user }     = useAuthStore()
  const isMobile     = useIsMobile()

  const name       = me ? `${me.firstName} ${me.lastName}` : user ? `${user.firstName} ${user.lastName}` : ''
  const initials   = name ? getInitials(name) : '?'
  const avatarColor = user ? ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'][user.id.charCodeAt(0) % 5] : '#2D7DD2'
  const roleLabel  = ({ admin: 'Administrateur', commercial: 'Commercial', employee: 'Employé' } as Record<string, string>)[user?.role ?? ''] ?? user?.role

  return (
    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      {/* Banner */}
      <div style={{ height: isMobile ? 90 : 110, background: 'linear-gradient(135deg, #0c2340 0%, #0f2d4a 55%, #1a4168 100%)', position: 'relative' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 18% 55%, rgba(45,125,210,0.18) 0%, transparent 55%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%)' }} />
      </div>

      {/* Avatar + info strip */}
      <div style={{ background: 'var(--surface)', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, transform: 'translateY(-28px)', marginBottom: '-12px' }}>
          {/* Avatar (overlaps banner) */}
          {me?.avatarUrl
            ? <img src={me.avatarUrl} alt={`Avatar de ${name}`}
                style={{ width: isMobile ? 60 : 72, height: isMobile ? 60 : 72, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--surface)', boxShadow: '0 2px 8px rgba(0,0,0,0.14)', flexShrink: 0 }} />
            : <div aria-hidden style={{ width: isMobile ? 60 : 72, height: isMobile ? 60 : 72, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', border: '4px solid var(--surface)', boxShadow: '0 2px 8px rgba(0,0,0,0.14)', flexShrink: 0 }}>
                {initials}
              </div>
          }
          {/* Name + role */}
          <div style={{ paddingBottom: 12, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name || '—'}
              </h1>
              {roleLabel && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
                  {roleLabel}
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email ?? ''}
            </p>
            {me?.lastLoginAt && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                Dernière connexion : <time dateTime={me.lastLoginAt}>{formatDate(me.lastLoginAt)}</time>
              </p>
            )}
          </div>
        </div>

        {/* Tab strip */}
        <div role="tablist" style={{ display: 'flex', overflowX: 'auto', borderTop: '1px solid var(--border)', marginTop: 4, scrollbarWidth: 'none' }}>
          {TABS.map(({ id, label, Icon }) => {
            const isActive = active === id
            return (
              <button key={id} type="button" role="tab" aria-selected={isActive} onClick={() => setActive(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`, color: isActive ? 'var(--primary)' : 'var(--text-3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s', marginBottom: -1 }}>
                <Icon size={14} aria-hidden />
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────
export default function ProfilePage() {
  const [active, setActive] = useState<ActiveTab>('profile')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780 }}>
      <ProfileHero active={active} setActive={setActive} />
      <div role="tabpanel">
        {active === 'profile'       && <ProfileTab />}
        {active === 'security'      && <SecurityTab />}
        {active === 'sessions'      && <SessionsTab />}
        {active === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  )
}
