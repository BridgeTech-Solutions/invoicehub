'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Shield, Plus, Users, Lock, Layers, AlertTriangle, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useRoles, useDeleteRole } from '@/features/roles/hooks'
import { RoleCard } from '@/features/roles/components/RoleCard'
import { RoleDrawer } from '@/features/roles/components/RoleDrawer'
import { useAuthStore } from '@/store/auth'
import type { RoleEntry } from '@/features/roles/types'

// ─── Confirm delete modal ─────────────────────────────────────
function ConfirmDeleteModal({ role, onConfirm, onCancel, isPending }: {
  role:      RoleEntry
  onConfirm: () => void
  onCancel:  () => void
  isPending: boolean
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-xl)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            aria-hidden="true"
            style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <AlertTriangle size={16} style={{ color: '#ef4444' }} />
          </div>
          <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Supprimer le rôle
          </h2>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Voulez-vous supprimer le rôle <strong>{role.displayName}</strong> ? Cette action est irréversible.
          {(role._count?.users ?? 0) > 0 && (
            <span style={{ display: 'block', marginTop: 8, color: '#d97706', fontSize: 12.5 }}>
              Attention : ce rôle est assigné à {role._count?.users} utilisateur(s).
            </span>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: '#ef4444', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isPending ? 0.65 : 1 }}
          >
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton grid ────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{ background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
          <div style={{ height: 11, width: '40%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 999 }} className="animate-pulse" />
      <div style={{ height: 11, width: '50%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent: string
}) {
  return (
    <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        aria-hidden="true"
        style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0', fontFamily: 'var(--font-display)' }}>
          {label}
        </p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function RolesPage() {
  const { user: me } = useAuthStore()
  const canManage    = me?.role === 'admin'

  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [editRole,    setEditRole]    = useState<RoleEntry | null>(null)
  const [deleteRole,  setDeleteRole]  = useState<RoleEntry | null>(null)

  const { data: roles = [], isLoading } = useRoles()
  const deleteMut = useDeleteRole()

  const totalPerms  = roles.reduce((acc, r) => acc + (r.permissions.includes('*') ? 57 : r.permissions.length), 0)
  const systemCount = roles.filter((r) => r.isSystem).length
  const customCount = roles.filter((r) => !r.isSystem).length

  function openCreate() { setEditRole(null); setDrawerOpen(true) }
  function openEdit(r: RoleEntry) { setEditRole(r); setDrawerOpen(true) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Rôles & Permissions"
        description="Gérez les accès de votre équipe"
        actions={canManage ? (
          <button
            type="button"
            onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', minHeight: 44,
              borderRadius: 'var(--radius-md)', border: 'none',
              background: 'var(--primary)', color: '#fff',
              cursor: 'pointer', fontSize: 13.5,
              fontFamily: 'var(--font-display)', fontWeight: 700,
              boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Créer un rôle
          </button>
        ) : undefined}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard icon={<Shield size={18} />}  label="Rôles au total"   value={isLoading ? '—' : roles.length}    accent="#2D7DD2" />
        <KpiCard icon={<Lock size={18} />}    label="Rôles système"    value={isLoading ? '—' : systemCount}     accent="#8b5cf6" />
        <KpiCard icon={<Layers size={18} />}  label="Rôles personnalisés" value={isLoading ? '—' : customCount}  accent="#10b981" />
        <KpiCard icon={<Users size={18} />}   label="Permissions totales" value={isLoading ? '—' : totalPerms}   accent="#f59e0b" />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : roles.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Shield size={32} style={{ color: 'var(--text-3)', display: 'block', margin: '0 auto 12px' }} aria-hidden="true" />
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>Aucun rôle configuré</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={(r) => setDeleteRole(r)}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <RoleDrawer
          editRole={editRole ?? undefined}
          onClose={() => { setDrawerOpen(false); setEditRole(null) }}
        />
      )}

      {/* Confirm delete */}
      {deleteRole && (
        <ConfirmDeleteModal
          role={deleteRole}
          isPending={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteRole.id, { onSuccess: () => setDeleteRole(null) })}
          onCancel={() => setDeleteRole(null)}
        />
      )}
    </div>
  )
}
