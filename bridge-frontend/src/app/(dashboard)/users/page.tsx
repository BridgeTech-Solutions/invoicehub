'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Search, UserPlus, Loader2, Shield, Pencil, Trash2, KeyRound, X, AlertTriangle } from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/features/users/hooks'
import { useAuthStore } from '@/store/auth'
import { formatDate, getInitials } from '@/lib/utils'
import type { User, CreateUserPayload, UpdateUserPayload, UserStatus } from '@/features/users/types'
import type { Role } from '@/lib/constants'
import type { AxiosError } from 'axios'

// ─── Badges ───────────────────────────────────────────────────
const ROLE_CFG: Record<Role, { label: string; color: string; bg: string }> = {
  admin:      { label: 'Administrateur', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  commercial: { label: 'Commercial',     color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  employee:   { label: 'Employé',        color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}
const STATUS_CFG: Record<UserStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Actif',      color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  suspended: { label: 'Suspendu',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  pending:   { label: 'En attente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
}

function RoleBadge({ role }: { role: Role }) {
  const c = ROLE_CFG[role] ?? ROLE_CFG.employee
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.active
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color }}>
      {/* M2: point décoratif → aria-hidden */}
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

// ─── Avatar (M1: aria-hidden — le nom est visible à côté) ─────
function UserAvatar({ user }: { user: User }) {
  const initials = getInitials(`${user.firstName} ${user.lastName}`)
  const colors   = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
  const color    = colors[user.id.charCodeAt(0) % colors.length]
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

// ─── ConfirmSuspendModal (C5 — remplace confirm()) ────────────
function ConfirmSuspendModal({ userName, onConfirm, onCancel }: {
  userName: string
  onConfirm: () => void
  onCancel:  () => void
}) {
  const modalRef  = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId   = 'confirm-suspend-title'

  // Auto-focus le bouton de confirmation
  useEffect(() => { confirmRef.current?.focus() }, [])

  // Escape ferme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  // Focus trap
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return
    const items = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button'))
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onCancel} aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '28px 24px', boxShadow: 'var(--shadow-xl)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} aria-hidden="true" style={{ color: '#ef4444', flexShrink: 0 }} />
          <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Suspendre le compte
          </h2>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Voulez-vous suspendre le compte de <strong>{userName}</strong> ? L&apos;utilisateur ne pourra plus se connecter.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{ flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700 }}
          >
            Suspendre
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row actions (C5: ConfirmSuspendModal au lieu de confirm()) ─
function UserRowActions({ user, onEdit, onDelete, isSelf }: {
  user: User; onEdit: () => void; onDelete: () => void; isSelf: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const items = [
    { label: 'Modifier', icon: Pencil, onClick: onEdit },
    ...(!isSelf ? [{
      label: 'Suspendre', icon: Trash2,
      onClick: () => setConfirmOpen(true),
      danger: true, separator: true,
    }] : []),
  ]

  return (
    <>
      <ActionMenu items={items} />
      {confirmOpen && (
        <ConfirmSuspendModal
          userName={`${user.firstName} ${user.lastName}`}
          onConfirm={() => { onDelete(); setConfirmOpen(false) }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  )
}

// ─── User Form Modal ──────────────────────────────────────────
function UserFormModal({ onClose, editUser }: { onClose: () => void; editUser?: User }) {
  const createMut = useCreateUser()
  const updateMut = useUpdateUser(editUser?.id ?? '')
  const isPending = createMut.isPending || updateMut.isPending

  // C1 + M3: useId() pour IDs uniques
  const uid    = useId()
  const fid    = (s: string) => `${uid}-${s}`
  const titleId = `${uid}-title`

  const modalRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    firstName: editUser?.firstName ?? '',
    lastName:  editUser?.lastName  ?? '',
    email:     editUser?.email     ?? '',
    phone:     editUser?.phone     ?? '',
    role:      (editUser?.role     ?? 'employee') as Role,
    password:  '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // H6: focus premier champ à l'ouverture
  useEffect(() => {
    const first = modalRef.current?.querySelector<HTMLElement>('input, select, textarea')
    first?.focus()
  }, [])

  // C2: Escape ferme la modale
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // C2: focus trap Tab / Shift+Tab
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return
    const focusables = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    ))
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Requis'
    if (!form.lastName.trim())  e.lastName  = 'Requis'
    if (!editUser && !form.email.trim())   e.email    = 'Requis'
    if (!editUser && !form.password)       e.password = 'Requis'
    if (!editUser && form.password.length > 0 && form.password.length < 8) e.password = 'Minimum 8 caractères'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    if (editUser) {
      const p: UpdateUserPayload = { firstName: form.firstName, lastName: form.lastName, phone: form.phone || undefined, role: form.role }
      await updateMut.mutateAsync(p)
    } else {
      const p: CreateUserPayload = { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone || undefined, role: form.role, password: form.password }
      await createMut.mutateAsync(p)
    }
    onClose()
  }

  // H8: erreur mutation serveur
  const mutError = (createMut.isError || updateMut.isError)
    ? ((createMut.error ?? updateMut.error) as AxiosError<{ message?: string }>)?.response?.data?.message
      ?? 'Une erreur est survenue. Veuillez réessayer.'
    : null

  const inputCss: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const labelCss: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
    fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} aria-hidden="true" />

      {/* C2: role="dialog" + aria-modal + aria-labelledby */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        style={{ position: 'relative', width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}
      >
        {/* En-tête */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* C6: Shield décoratif */}
            <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {editUser ? "Modifier l'utilisateur" : 'Créer un compte'}
            </h2>
          </div>
          {/* C3: aria-label + C6: X aria-hidden */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Prénom + Nom (C1: htmlFor+id, H10: autocomplete) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor={fid('firstName')} style={labelCss}>
                Prénom <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={fid('firstName')}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jean-Pierre"
                autoComplete="given-name"
                style={{ ...inputCss, borderColor: errors.firstName ? '#ef4444' : 'var(--border)' }}
              />
              {/* C4: role="alert" */}
              {errors.firstName && <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.firstName}</p>}
            </div>
            <div>
              <label htmlFor={fid('lastName')} style={labelCss}>
                Nom <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={fid('lastName')}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Kamga"
                autoComplete="family-name"
                style={{ ...inputCss, borderColor: errors.lastName ? '#ef4444' : 'var(--border)' }}
              />
              {errors.lastName && <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          {!editUser && (
            <div>
              <label htmlFor={fid('email')} style={labelCss}>
                Email <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={fid('email')}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jean@bts.cm"
                autoComplete="email"
                style={{ ...inputCss, borderColor: errors.email ? '#ef4444' : 'var(--border)' }}
              />
              {errors.email && <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.email}</p>}
            </div>
          )}

          {/* Téléphone */}
          <div>
            <label htmlFor={fid('phone')} style={labelCss}>Téléphone</label>
            <input
              id={fid('phone')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+237 6XX XXX XXX"
              autoComplete="tel"
              style={inputCss}
            />
          </div>

          {/* Rôle */}
          <div>
            <label htmlFor={fid('role')} style={labelCss}>
              Rôle <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
              <span className="sr-only">(obligatoire)</span>
            </label>
            <select
              id={fid('role')}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              style={{ ...inputCss, cursor: 'pointer' }}
            >
              <option value="employee">Employé</option>
              <option value="commercial">Commercial</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          {/* Mot de passe */}
          {!editUser && (
            <div>
              <label htmlFor={fid('password')} style={labelCss}>
                Mot de passe temporaire <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={fid('password')}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min. 8 caractères"
                autoComplete="new-password"
                style={{ ...inputCss, borderColor: errors.password ? '#ef4444' : 'var(--border)' }}
              />
              {errors.password
                ? <p role="alert" style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.password}</p>
                : <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>L&apos;utilisateur devra le changer à la première connexion.</p>
              }
            </div>
          )}

          {/* H8: erreur mutation serveur */}
          {mutError && (
            <p role="alert" aria-live="assertive" style={{ fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', margin: 0 }}>
              {mutError}
            </p>
          )}

          {/* Boutons (H7: minHeight 44) */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              style={{ flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isPending ? 0.65 : 1, boxShadow: isPending ? 'none' : '0 4px 12px rgba(45,125,210,0.3)' }}
            >
              {/* C6: aria-hidden icônes */}
              {isPending
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <KeyRound size={14} aria-hidden="true" />
              }
              {editUser ? 'Enregistrer' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Skeleton (C10: aria-hidden) ──────────────────────────────
function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {[200, 120, 90, 110, 110, 40].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── En-têtes du tableau (C9) ─────────────────────────────────
const TABLE_HEADERS: { label: string; srOnly?: boolean }[] = [
  { label: 'Utilisateur' },
  { label: 'Rôle' },
  { label: 'Statut' },
  { label: 'Dernière connexion' },
  { label: 'Créé le' },
  { label: 'Actions', srOnly: true },
]

// ─── Page ─────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.role === 'admin'
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState<Role | ''>('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('')
  const [page,         setPage]         = useState(1)
  const [showCreate,   setShowCreate]   = useState(false)
  const [editUser,     setEditUser]     = useState<User | null>(null)

  const { data, isLoading } = useUsers({ page, limit: 20, search: search || undefined, role: roleFilter || undefined, status: statusFilter || undefined })
  const deleteMut  = useDeleteUser()
  const users      = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1

  const inputCss: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
    background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)',
    fontFamily: 'var(--font-body)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Utilisateurs</h1>
          {/* H9: aria-live sur le compteur dynamique */}
          <p aria-live="polite" style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {total > 0 ? `${total} compte${total > 1 ? 's' : ''}` : 'Aucun utilisateur'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            {/* H2: aria-hidden */}
            <UserPlus size={15} aria-hidden="true" />
            Créer un compte
          </button>
        )}
      </div>

      {/* Filtres (C7: label sr-only + aria-hidden Search, C8: aria-label selects) */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 200, maxWidth: 320 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <label htmlFor="user-search" className="sr-only">Rechercher un utilisateur</label>
            <input
              id="user-search"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Nom, email…"
              style={{ ...inputCss, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          {/* C8: aria-label sur les selects */}
          <select
            aria-label="Filtrer par rôle"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value as Role | ''); setPage(1) }}
            style={{ ...inputCss, cursor: 'pointer' }}
          >
            <option value="">Tous les rôles</option>
            <option value="admin">Administrateur</option>
            <option value="commercial">Commercial</option>
            <option value="employee">Employé</option>
          </select>
          <select
            aria-label="Filtrer par statut"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); setPage(1) }}
            style={{ ...inputCss, cursor: 'pointer' }}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
            <option value="pending">En attente</option>
          </select>
        </div>
      </div>

      {/* Tableau (H1: aria-label + aria-busy, C9: scope="col") */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label="Liste des utilisateurs"
            aria-busy={isLoading}
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}
          >
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h.label}
                    scope="col"
                    style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}
                  >
                    {h.srOnly ? <span className="sr-only">{h.label}</span> : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : users.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucun utilisateur trouvé</p>
                      </td>
                    </tr>
                  )
                  : users.map((u) => (
                    <tr
                      key={u.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar user={u} />
                          <div>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                              {u.firstName} {u.lastName}
                              {/* M4: contexte AT sur "Vous" */}
                              {u.id === me?.id && (
                                <span aria-label="(vous-même)" style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                                  Vous
                                </span>
                              )}
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-mono)' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '12px 16px' }}><UserStatusBadge status={u.status} /></td>
                      {/* H5: <time dateTime> sur les dates */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
                        {u.lastLoginAt
                          ? <time dateTime={u.lastLoginAt}>{formatDate(u.lastLoginAt)}</time>
                          : '—'
                        }
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
                        <time dateTime={u.createdAt}>{formatDate(u.createdAt)}</time>
                      </td>
                      <td style={{ padding: '12px 10px', width: 40 }} onClick={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <UserRowActions
                            user={u}
                            onEdit={() => setEditUser(u)}
                            onDelete={() => deleteMut.mutate(u.id)}
                            isSelf={u.id === me?.id}
                          />
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination (H3: minHeight 44, H4: nav + aria-current) */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Page {page} sur {totalPages}
            </p>
            <nav aria-label="Pagination des utilisateurs">
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                  const p = i + 1
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                      style={{
                        minWidth: 44, minHeight: 44, borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)',
                        background: p === page ? 'var(--primary)' : 'transparent',
                        color: p === page ? '#fff' : 'var(--text-2)',
                        fontSize: 13, cursor: 'pointer',
                        fontFamily: 'var(--font-display)', fontWeight: 600,
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
            </nav>
          </div>
        )}
      </div>

      {showCreate && <UserFormModal onClose={() => setShowCreate(false)} />}
      {editUser   && <UserFormModal editUser={editUser} onClose={() => setEditUser(null)} />}
    </div>
  )
}
