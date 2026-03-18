'use client'

import { useState } from 'react'
import { Search, UserPlus, Loader2, Shield, Pencil, Trash2, KeyRound, X } from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/features/users/hooks'
import { useAuthStore } from '@/store/auth'
import { formatDate, getInitials } from '@/lib/utils'
import type { User, CreateUserPayload, UpdateUserPayload, UserStatus } from '@/features/users/types'
import type { Role } from '@/lib/constants'

// ─── Badges ───────────────────────────────────────────────────
const ROLE_CFG: Record<Role, { label: string; color: string; bg: string }> = {
  admin:      { label: 'Administrateur', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  commercial: { label: 'Commercial',     color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  employee:   { label: 'Employé',        color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}
const STATUS_CFG: Record<UserStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Actif',      color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  suspended: { label: 'Suspendu',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
  pending:   { label: 'En attente', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
}
function RoleBadge({ role }: { role: Role }) {
  const c = ROLE_CFG[role] ?? ROLE_CFG.employee
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color }}>{c.label}</span>
}
function UserStatusBadge({ status }: { status: UserStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.active
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-display)', fontWeight: 700, background: c.bg, color: c.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />{c.label}
    </span>
  )
}

// ─── Avatar ───────────────────────────────────────────────────
function UserAvatar({ user }: { user: User }) {
  const initials = getInitials(`${user.firstName} ${user.lastName}`)
  const colors   = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']
  const color    = colors[user.id.charCodeAt(0) % colors.length]
  if (user.avatarUrl) return <img src={user.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
}

// ─── Row actions menu ──────────────────────────────────────────
function UserRowActions({ user, onEdit, onDelete, isSelf }: { user: User; onEdit: () => void; onDelete: () => void; isSelf: boolean }) {
  const items = [
    { label: 'Modifier', icon: Pencil, onClick: onEdit },
    ...(!isSelf ? [{ label: 'Suspendre', icon: Trash2, onClick: () => { if (confirm(`Suspendre le compte de ${user.firstName} ${user.lastName} ?`)) onDelete() }, danger: true, separator: true }] : []),
  ]
  return <ActionMenu items={items} />
}

// ─── User Form Modal ──────────────────────────────────────────
function UserFormModal({ onClose, editUser }: { onClose: () => void; editUser?: User }) {
  const createMut = useCreateUser()
  const updateMut = useUpdateUser(editUser?.id ?? '')
  const isPending = createMut.isPending || updateMut.isPending
  const [form, setForm] = useState({
    firstName: editUser?.firstName ?? '',
    lastName:  editUser?.lastName  ?? '',
    email:     editUser?.email     ?? '',
    phone:     editUser?.phone     ?? '',
    role:      (editUser?.role     ?? 'employee') as Role,
    password:  '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Requis'
    if (!form.lastName.trim())  e.lastName  = 'Requis'
    if (!editUser && !form.email.trim()) e.email = 'Requis'
    if (!editUser && !form.password)     e.password = 'Requis'
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

  const inputCss: React.CSSProperties = { padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {editUser ? "Modifier l'utilisateur" : 'Créer un compte'}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Prénom *</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jean-Pierre" style={{ ...inputCss, borderColor: errors.firstName ? '#ef4444' : 'var(--border)' }} />
              {errors.firstName && <p style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.firstName}</p>}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Kamga" style={{ ...inputCss, borderColor: errors.lastName ? '#ef4444' : 'var(--border)' }} />
              {errors.lastName && <p style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.lastName}</p>}
            </div>
          </div>
          {!editUser && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jean@bts.cm" style={{ ...inputCss, borderColor: errors.email ? '#ef4444' : 'var(--border)' }} />
              {errors.email && <p style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.email}</p>}
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+237 6XX XXX XXX" style={inputCss} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Rôle *</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} style={{ ...inputCss, cursor: 'pointer' }}>
              <option value="employee">Employé</option>
              <option value="commercial">Commercial</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          {!editUser && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: 4 }}>Mot de passe temporaire *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 caractères" style={{ ...inputCss, borderColor: errors.password ? '#ef4444' : 'var(--border)' }} />
              {errors.password
                ? <p style={{ fontSize: 11, color: '#ef4444', margin: '3px 0 0' }}>{errors.password}</p>
                : <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>L&apos;utilisateur devra le changer à la première connexion.</p>
              }
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>Annuler</button>
            <button type="submit" disabled={isPending} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isPending ? 0.7 : 1, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {editUser ? 'Enregistrer' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[200, 120, 90, 110, 110, 40].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

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
  const deleteMut = useDeleteUser()
  const users      = data?.data       ?? []
  const total      = data?.total      ?? 0
  const totalPages = data?.totalPages ?? 1

  const inputCss: React.CSSProperties = { padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', fontFamily: 'var(--font-body)', outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Utilisateurs</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {total > 0 ? `${total} compte${total > 1 ? 's' : ''}` : 'Aucun utilisateur'}
          </p>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}>
            <UserPlus size={15} /> Créer un compte
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 200, maxWidth: 320 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Nom, email…"
              style={{ ...inputCss, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as Role | ''); setPage(1) }} style={{ ...inputCss, cursor: 'pointer' }}>
            <option value="">Tous les rôles</option>
            <option value="admin">Administrateur</option>
            <option value="commercial">Commercial</option>
            <option value="employee">Employé</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); setPage(1) }} style={{ ...inputCss, cursor: 'pointer' }}>
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
            <option value="pending">En attente</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {['Utilisateur', 'Rôle', 'Statut', 'Dernière connexion', 'Créé le', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : users.length === 0
                  ? <tr><td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}><p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucun utilisateur trouvé</p></td></tr>
                  : users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar user={u} />
                          <div>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                              {u.firstName} {u.lastName}
                              {u.id === me?.id && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Vous</span>}
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-mono)' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '12px 16px' }}><UserStatusBadge status={u.status} /></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>{formatDate(u.createdAt)}</td>
                      <td style={{ padding: '12px 10px', width: 40 }} onClick={(e) => e.stopPropagation()}>
                        {isAdmin && <UserRowActions user={u} onEdit={() => setEditUser(u)} onDelete={() => deleteMut.mutate(u.id)} isSelf={u.id === me?.id} />}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Page {page} sur {totalPages}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const p = i + 1
                return <button key={p} type="button" onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1.5px solid', borderColor: p === page ? 'var(--primary)' : 'var(--border)', background: p === page ? 'var(--primary)' : 'transparent', color: p === page ? '#fff' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{p}</button>
              })}
            </div>
          </div>
        )}
      </div>

      {showCreate && <UserFormModal onClose={() => setShowCreate(false)} />}
      {editUser   && <UserFormModal editUser={editUser} onClose={() => setEditUser(null)} />}
    </div>
  )
}
