'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Pencil, KeyRound, UserCheck, UserX, Trash2,
  Shield, Phone, Mail, Clock, Calendar, Loader2,
  ShieldCheck, ShieldOff, AlertTriangle, Activity, X, Eye, EyeOff,
} from 'lucide-react'
import { useUser, useUpdateUser, useReactivateUser, useResetUserPassword, useDeleteUser, useUserActivity } from '@/features/users/hooks'
import { useAuthStore } from '@/store/auth'
import { formatDate, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { Role } from '@/lib/constants'
import type { User } from '@/features/users/types'

// ─── Constants ────────────────────────────────────────────────

const ROLE_CFG: Record<Role, { label: string; color: string; bg: string }> = {
  admin:      { label: 'Administrateur', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  commercial: { label: 'Commercial',     color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  employee:   { label: 'Employé',        color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}

const STATUS_CFG = {
  active:    { label: 'Actif',      color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  suspended: { label: 'Suspendu',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  pending:   { label: 'En attente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
}

const ACTION_LABELS: Record<string, string> = {
  CREATE:             'Création',
  UPDATE:             'Modification',
  SOFT_DELETE:        'Archivage',
  STATUS_CHANGE:      'Changement de statut',
  EMAIL_SENT:         'Email envoyé',
  PAYMENT_REGISTERED: 'Paiement enregistré',
  CONVERT_TO_INVOICE: 'Conversion en facture',
  LOGIN:              'Connexion',
}

// ─── Shared styles ────────────────────────────────────────────

const inputCss: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const labelCss: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
  fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4,
}

// ─── Section wrapper ──────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div aria-hidden="true" style={{ color: 'var(--primary)' }}>{icon}</div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

// ─── Info row ─────────────────────────────────────────────────

function InfoRow({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: highlight ? '#ef4444' : 'var(--text-1)', fontWeight: highlight ? 600 : 400, fontFamily: 'var(--font-body)' }}>{value}</span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} aria-hidden="true">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 18, width: 200, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            <div style={{ height: 13, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        </div>
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="card" style={{ padding: 20 }}>
          <div style={{ height: 13, width: '40%', background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} className="animate-pulse" />
          {[1, 2, 3].map(j => (
            <div key={j} style={{ height: 11, background: 'var(--border)', borderRadius: 4, marginBottom: 12, width: `${60 + j * 10}%` }} className="animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Edit modal ───────────────────────────────────────────────

function EditModal({ user, onClose }: { user: User; onClose: () => void }) {
  const titleId  = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const updateM  = useUpdateUser(user.id)

  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName:  user.lastName,
    phone:     user.phone ?? '',
    role:      user.role as Role,
  })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    modalRef.current?.querySelector<HTMLElement>('input')?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await updateM.mutateAsync({ firstName: form.firstName, lastName: form.lastName, phone: form.phone || undefined, role: form.role })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} aria-hidden="true" />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ position: 'relative', width: '100%', maxWidth: 460, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Modifier l&apos;utilisateur
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelCss}>Prénom</label>
              <input value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} required style={inputCss} />
            </div>
            <div>
              <label style={labelCss}>Nom</label>
              <input value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} required style={inputCss} />
            </div>
          </div>
          <div>
            <label style={labelCss}>Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+237 6XX XXX XXX" style={inputCss} />
          </div>
          <div>
            <label style={labelCss}>Rôle</label>
            <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value as Role }))} style={{ ...inputCss, cursor: 'pointer' }}>
              <option value="employee">Employé</option>
              <option value="commercial">Commercial</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Annuler
            </button>
            <button type="submit" disabled={updateM.isPending}
              style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: updateM.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, opacity: updateM.isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {updateM.isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reset password modal ─────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const titleId   = useId()
  const resetM    = useResetUserPassword()
  const [pwd, setPwd]       = useState('')
  const [show, setShow]     = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pwd.length < 8) { setError('Minimum 8 caractères'); return }
    setError('')
    await resetM.mutateAsync({ id: user.id, newPassword: pwd })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ position: 'relative', width: '100%', maxWidth: 420, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={15} style={{ color: '#d97706' }} />
            </div>
            <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Réinitialiser le mot de passe
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
            Définir un mot de passe temporaire pour <strong>{user.firstName} {user.lastName}</strong>.
            L&apos;utilisateur sera obligé de le changer à sa prochaine connexion.
          </p>
          <div>
            <label style={labelCss}>Nouveau mot de passe temporaire</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setError('') }}
                placeholder="Min. 8 caractères"
                autoComplete="new-password"
                style={{ ...inputCss, paddingRight: 44, borderColor: error ? '#ef4444' : 'var(--border)' }}
              />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Masquer' : 'Afficher'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
            </div>
            {error
              ? <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>
              : <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>L&apos;utilisateur devra changer ce mot de passe à la prochaine connexion.</p>
            }
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Annuler
            </button>
            <button type="submit" disabled={resetM.isPending}
              style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: '#d97706', color: '#fff', cursor: resetM.isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, opacity: resetM.isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {resetM.isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              Réinitialiser
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Confirm action modal ─────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel, isPending }: {
  title: string; message: React.ReactNode; confirmLabel: string
  danger?: boolean; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onCancel} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={16} style={{ color: danger ? '#ef4444' : '#059669' }} />
          </div>
          <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>{title}</h2>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: danger ? '#ef4444' : '#059669', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, opacity: isPending ? 0.65 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────

function UserAvatar({ user, size = 56 }: { user: User; size?: number }) {
  const initials = getInitials(`${user.firstName} ${user.lastName}`)
  const colors   = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
  const color    = colors[user.id.charCodeAt(0) % colors.length]!
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.27, fontWeight: 700, color: '#fff', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
      {initials}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function UserDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const { user: me } = useAuthStore()
  const isAdmin  = me?.role === 'admin'
  const isSelf   = me?.id === id

  const [showEdit,         setShowEdit]         = useState(false)
  const [showResetPwd,     setShowResetPwd]      = useState(false)
  const [showSuspend,      setShowSuspend]       = useState(false)
  const [showReactivate,   setShowReactivate]    = useState(false)

  const { data: user, isLoading, isError } = useUser(id)
  const { data: activity = [], isLoading: activityLoading } = useUserActivity(id)

  const suspendM    = useDeleteUser()
  const reactivateM = useReactivateUser()

  if (isLoading) return <Skeleton />
  if (isError || !user) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <AlertTriangle size={28} style={{ color: '#ef4444', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} aria-hidden="true" />
        <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Utilisateur introuvable ou accès refusé.</p>
      </div>
    )
  }

  const roleCfg   = ROLE_CFG[user.role] ?? ROLE_CFG.employee
  const statusCfg = STATUS_CFG[user.status] ?? STATUS_CFG.active
  const isSuspended = user.status === 'suspended'

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 14px', minHeight: 40, borderRadius: 'var(--radius-md)',
    fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  }

  return (
    <>
      {/* ── Modales ── */}
      {showEdit        && <EditModal         user={user} onClose={() => setShowEdit(false)} />}
      {showResetPwd    && <ResetPasswordModal user={user} onClose={() => setShowResetPwd(false)} />}
      {showSuspend     && (
        <ConfirmModal
          title="Suspendre ce compte"
          message={<>Voulez-vous suspendre <strong>{user.firstName} {user.lastName}</strong> ? L&apos;utilisateur ne pourra plus se connecter et toutes ses sessions seront révoquées.</>}
          confirmLabel="Suspendre"
          danger
          isPending={suspendM.isPending}
          onConfirm={() => suspendM.mutate(user.id, { onSuccess: () => { setShowSuspend(false); router.push(ROUTES.USERS) } })}
          onCancel={() => setShowSuspend(false)}
        />
      )}
      {showReactivate  && (
        <ConfirmModal
          title="Réactiver ce compte"
          message={<>Voulez-vous réactiver le compte de <strong>{user.firstName} {user.lastName}</strong> ? L&apos;utilisateur pourra se reconnecter.</>}
          confirmLabel="Réactiver"
          isPending={reactivateM.isPending}
          onConfirm={() => reactivateM.mutate(user.id, { onSuccess: () => setShowReactivate(false) })}
          onCancel={() => setShowReactivate(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760, margin: '0 auto', width: '100%' }}>

        {/* ── Bouton retour ── */}
        <button type="button" onClick={() => router.push(ROUTES.USERS)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0, alignSelf: 'flex-start' }}>
          <ArrowLeft size={15} aria-hidden="true" />
          Retour aux utilisateurs
        </button>

        {/* ── Header card ── */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>

            {/* Avatar + infos principales */}
            <UserAvatar user={user} size={64} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                  {user.firstName} {user.lastName}
                </h1>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: roleCfg.bg, color: roleCfg.color, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {roleCfg.label}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: statusCfg.color }} />
                  {statusCfg.label}
                </span>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                {user.email}
              </p>

              {/* Boutons actions — admin seulement */}
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setShowEdit(true)}
                    style={{ ...btnBase, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)' }}>
                    <Pencil size={13} aria-hidden="true" />
                    Modifier
                  </button>
                  <button type="button" onClick={() => setShowResetPwd(true)}
                    style={{ ...btnBase, border: '1.5px solid rgba(217,119,6,0.4)', background: 'rgba(245,158,11,0.06)', color: '#d97706' }}>
                    <KeyRound size={13} aria-hidden="true" />
                    Réinitialiser MDP
                  </button>
                  {!isSelf && !isSuspended && (
                    <button type="button" onClick={() => setShowSuspend(true)}
                      style={{ ...btnBase, border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#dc2626' }}>
                      <UserX size={13} aria-hidden="true" />
                      Suspendre
                    </button>
                  )}
                  {isSuspended && (
                    <button type="button" onClick={() => setShowReactivate(true)}
                      style={{ ...btnBase, border: '1.5px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)', color: '#059669' }}>
                      <UserCheck size={13} aria-hidden="true" />
                      Réactiver
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Informations ── */}
        <Section icon={<Mail size={16} />} title="Informations">
          <div style={{ marginTop: -10 }}>
            <InfoRow icon={<Mail size={14} />}     label="Email"              value={user.email} />
            <InfoRow icon={<Phone size={14} />}    label="Téléphone"          value={user.phone ?? <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Non renseigné</span>} />
            <InfoRow icon={<Shield size={14} />}   label="Rôle"               value={<span style={{ background: roleCfg.bg, color: roleCfg.color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{roleCfg.label}</span>} />
            <InfoRow icon={<Clock size={14} />}    label="Dernière connexion" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Jamais connecté</span>} />
            <InfoRow icon={<Calendar size={14} />} label="Membre depuis"      value={formatDate(user.createdAt)} />
          </div>
        </Section>

        {/* ── Sécurité ── */}
        <Section icon={<Shield size={16} />} title="Sécurité & Accès">
          <div style={{ marginTop: -10 }}>
            <InfoRow
              icon={user.twoFactorEnabled ? <ShieldCheck size={14} style={{ color: '#059669' }} /> : <ShieldOff size={14} style={{ color: 'var(--text-3)' }} />}
              label="Double authentification"
              value={user.twoFactorEnabled
                ? <span style={{ color: '#059669', fontWeight: 600 }}>Activée</span>
                : <span style={{ color: 'var(--text-3)' }}>Non activée</span>
              }
            />
            <InfoRow
              icon={<KeyRound size={14} style={{ color: user.mustChangePassword ? '#d97706' : 'var(--text-3)' }} />}
              label="Changement de MDP"
              value={user.mustChangePassword
                ? <span style={{ color: '#d97706', fontWeight: 600 }}>Requis à la prochaine connexion</span>
                : <span style={{ color: 'var(--text-3)' }}>Non requis</span>
              }
              highlight={false}
            />
          </div>
        </Section>

        {/* ── Activité récente ── */}
        <Section icon={<Activity size={16} />} title="Activité récente">
          {activityLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ height: 12, background: 'var(--border)', borderRadius: 4, width: `${50 + i * 8}%` }} className="animate-pulse" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, textAlign: 'center', padding: '12px 0' }}>
              Aucune activité enregistrée.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: -10 }}>
              {activity.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, fontWeight: 500 }}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {entry.entityType && (
                        <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400 }}>
                          · {entry.entityType}
                          {entry.entityId && <span style={{ fontFamily: 'var(--font-mono)' }}> #{entry.entityId.slice(0, 8)}</span>}
                        </span>
                      )}
                    </p>
                  </div>
                  <time dateTime={entry.createdAt} style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatDate(entry.createdAt)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </>
  )
}
