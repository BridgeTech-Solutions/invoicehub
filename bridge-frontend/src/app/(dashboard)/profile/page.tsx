'use client'

import { useState, useRef } from 'react'
import {
  User, Lock, Shield, Monitor, Camera, Trash2, Loader2,
  Eye, EyeOff, Smartphone, LogOut, X, Copy, Check,
} from 'lucide-react'
import {
  useMe, useUpdateMe, useChangePassword, useUploadAvatar, useDeleteAvatar,
} from '@/features/users/hooks'
import {
  use2FAEnable, use2FAVerify, use2FADisable,
  useSessions, useRevokeSession, useRevokeAllSessions,
} from '@/features/auth/hooks'
import { useAuthStore } from '@/store/auth'
import { getInitials, formatDate } from '@/lib/utils'

// ─── Section card wrapper ──────────────────────────────────────
function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ─── Profile Info section ─────────────────────────────────────
function ProfileInfoSection() {
  const { data: me, isLoading } = useMe()
  const updateMut   = useUpdateMe()
  const uploadMut   = useUploadAvatar()
  const deleteMut   = useDeleteAvatar()
  const fileRef     = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({ firstName: '', lastName: '', phone: '' })

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
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 11, width: 200, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
      </div>
    )
  }

  const initials  = getInitials(`${me.firstName} ${me.lastName}`)
  const avatarColors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444']
  const avatarColor  = avatarColors[me.id.charCodeAt(0) % avatarColors.length]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative' }}>
          {me.avatarUrl
            ? <img src={me.avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }} />
            : <div style={{ width: 72, height: 72, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', border: '3px solid var(--border)' }}>{initials}</div>
          }
          {(uploadMut.isPending || deleteMut.isPending) && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#fff' }} />
            </div>
          )}
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>{me.firstName} {me.lastName}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 8px', fontFamily: 'var(--font-mono)' }}>{me.email}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              <Camera size={12} /> Changer
            </button>
            {me.avatarUrl && (
              <button type="button" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                <Trash2 size={12} /> Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fields */}
      {editing ? (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Prénom</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputCss} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Nom</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputCss} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+237 6XX XXX XXX" style={inputCss} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(false)} style={{ padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={updateMut.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
              {updateMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enregistrer
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <div style={{ gridColumn: '1/-1', paddingTop: 4 }}>
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
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [show, setShow] = useState({ cur: false, new: false, con: false })
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.newPassword.length < 8) { setError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return }
    if (form.newPassword !== form.confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    await changeMut.mutateAsync({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    setForm({ currentPassword: '', newPassword: '', confirm: '' })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
      {[
        { label: 'Mot de passe actuel', key: 'currentPassword' as const, showKey: 'cur' as const },
        { label: 'Nouveau mot de passe', key: 'newPassword' as const, showKey: 'new' as const },
        { label: 'Confirmer le nouveau mot de passe', key: 'confirm' as const, showKey: 'con' as const },
      ].map(({ label, key, showKey }) => (
        <div key={key}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>{label}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={show[showKey] ? 'text' : 'password'}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              style={{ ...inputCss, paddingRight: 40 }}
              required
            />
            <button type="button" onClick={() => setShow({ ...show, [showKey]: !show[showKey] })}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>
              {show[showKey] ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      ))}
      {error && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={changeMut.isPending}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
        {changeMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
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

  const [step, setStep]           = useState<'idle' | 'setup' | 'disable'>('idle')
  const [qrCode, setQrCode]       = useState('')
  const [secret, setSecret]       = useState('')
  const [token, setToken]         = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copied, setCopied]       = useState(false)

  async function handleEnable() {
    const res = await enableMut.mutateAsync()
    setQrCode(res.qrCode)
    setSecret(res.secret)
    setStep('setup')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const res = await verifyMut.mutateAsync({ token, secret })
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

  if (backupCodes.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.07)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#10b981', margin: '0 0 6px' }}>2FA activé avec succès</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>Conservez ces codes de secours en lieu sûr.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 14, background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          {backupCodes.map((code) => (
            <code key={code} style={{ fontSize: 12.5, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{code}</code>
          ))}
        </div>
        <button type="button" onClick={copyBackup}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {copied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier les codes</>}
        </button>
        <button type="button" onClick={() => setBackupCodes([])}
          style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          Fermer
        </button>
      </div>
    )
  }

  if (step === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Scannez ce QR code avec votre application d&apos;authentification (Google Authenticator, Authy…)</p>
        {qrCode && <img src={qrCode} alt="QR Code 2FA" style={{ width: 180, height: 180, borderRadius: 8, border: '2px solid var(--border)' }} />}
        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Code de vérification (6 chiffres)</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} maxLength={6} placeholder="123456" style={{ ...inputCss, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }} required />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setStep('idle')} style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={verifyMut.isPending || token.length !== 6}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, opacity: token.length !== 6 ? 0.6 : 1 }}>
              {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />} Activer
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (step === 'disable') {
    return (
      <form onSubmit={handleDisable} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Saisissez votre code TOTP actuel pour désactiver la 2FA.</p>
        <input value={token} onChange={(e) => setToken(e.target.value)} maxLength={6} placeholder="123456" style={{ ...inputCss, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', fontSize: 16 }} required />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setStep('idle')} style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
          <button type="submit" disabled={disableMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {disableMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Désactiver
          </button>
        </div>
      </form>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        background: enabled ? 'rgba(16,185,129,0.07)' : 'var(--surface)',
        border: `1.5px solid ${enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
      }}>
        <Shield size={20} style={{ color: enabled ? '#10b981' : 'var(--text-3)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
            Authentification à deux facteurs
          </p>
          <p style={{ fontSize: 12.5, color: enabled ? '#10b981' : 'var(--text-3)', margin: '2px 0 0', fontWeight: enabled ? 600 : 400 }}>
            {enabled ? 'Activée — votre compte est protégé' : 'Non activée — recommandé pour la sécurité'}
          </p>
        </div>
      </div>
      {enabled ? (
        <button type="button" onClick={() => setStep('disable')}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          <X size={13} /> Désactiver la 2FA
        </button>
      ) : (
        <button type="button" onClick={handleEnable} disabled={enableMut.isPending}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
          {enableMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
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
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          {sessions?.length ?? 0} session{(sessions?.length ?? 0) > 1 ? 's' : ''} active{(sessions?.length ?? 0) > 1 ? 's' : ''}
        </p>
        {(sessions?.length ?? 0) > 1 && (
          <button type="button" onClick={() => revokeAllMut.mutate()} disabled={revokeAllMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <LogOut size={12} /> Révoquer toutes les autres
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ height: 56, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          ))
          : sessions?.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              background: s.current ? 'rgba(45,125,210,0.05)' : 'var(--surface)',
              border: `1px solid ${s.current ? 'rgba(45,125,210,0.2)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
            }}>
              <Monitor size={16} style={{ color: s.current ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                  {s.deviceName || 'Navigateur web'}
                  {s.current && <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Session courante</span>}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                  {s.ipAddress ?? '—'} · Connexion le {formatDate(s.createdAt)}
                </p>
              </div>
              {!s.current && (
                <button type="button" onClick={() => revokeMut.mutate(s.id)} disabled={revokeMut.isPending}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))
        }
      </div>
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
    </div>
  )
}
