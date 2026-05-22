'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Shield, Users, Lock, Pencil, Layers,
  AlertTriangle, Mail,
} from 'lucide-react'
import { useRole } from '@/features/roles/hooks'
import { RoleDrawer } from '@/features/roles/components/RoleDrawer'
import { PermissionsMatrix } from '@/features/roles/components/PermissionsMatrix'
import { useAuthStore } from '@/store/auth'
import { formatDate, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'

// ─── Skeleton ─────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }} aria-hidden="true">
      <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
          <div>
            <div style={{ height: 18, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 12, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} className="animate-pulse" />
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ height: 12, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              {[...Array(3)].map((_, j) => (
                <div key={j} style={{ height: 22, width: 70, background: 'var(--border)', borderRadius: 100 }} className="animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

const ROLE_PALETTE: Array<{ accent: string; bg: string }> = [
  { accent: '#2D7DD2', bg: 'rgba(45,125,210,0.08)'  },
  { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.08)'  },
  { accent: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
  { accent: '#06b6d4', bg: 'rgba(6,182,212,0.08)'   },
]

function getPalette(name: string, isSystem: boolean) {
  if (isSystem) return ROLE_PALETTE[0]!
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % (ROLE_PALETTE.length - 1)
  return ROLE_PALETTE[idx + 1]!
}

// ─── Page ─────────────────────────────────────────────────────
export default function RoleDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const { user: me } = useAuthStore()
  const canManage = me?.role === 'admin'

  const [showEdit, setShowEdit] = useState(false)

  const { data: role, isLoading, isError } = useRole(id)

  if (isLoading) return <Skeleton />
  if (isError || !role) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <AlertTriangle size={28} aria-hidden="true" style={{ color: '#ef4444', display: 'block', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Rôle introuvable ou accès refusé.</p>
        <button
          type="button"
          onClick={() => router.push(ROUTES.ROLES)}
          style={{ marginTop: 16, padding: '8px 18px', minHeight: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Retour aux rôles
        </button>
      </div>
    )
  }

  const palette     = getPalette(role.name, role.isSystem)
  const hasAll      = role.permissions.includes('*')
  const permCount   = hasAll ? 57 : role.permissions.length
  const users       = role.users ?? []

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 14px', minHeight: 40, borderRadius: 'var(--radius-md)',
    fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
  }

  return (
    <>
      {showEdit && (
        <RoleDrawer
          editRole={role}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>

        {/* Back button */}
        <button
          type="button"
          onClick={() => router.push(ROUTES.ROLES)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0, alignSelf: 'flex-start' }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Retour aux rôles
        </button>

        {/* Header card */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div
              aria-hidden="true"
              style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Shield size={24} style={{ color: palette.accent }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                  {role.displayName}
                </h1>
                {role.isSystem && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '3px 8px', borderRadius: 100,
                    background: 'rgba(45,125,210,0.1)', color: 'var(--primary)',
                    fontFamily: 'var(--font-display)', textTransform: 'uppercase',
                  }}>
                    <Lock size={9} aria-hidden="true" /> Système
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 14px', fontFamily: 'var(--font-mono)' }}>
                {role.name}
              </p>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: canManage && !role.isSystem ? 16 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Shield size={13} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                    {hasAll ? 'Accès total' : `${permCount} permission${permCount !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Users size={13} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
                    {role._count.users} utilisateur{role._count.users !== 1 ? 's' : ''}
                  </span>
                </div>
                {role.createdAt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                      Créé le {formatDate(role.createdAt)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    style={{ ...btnBase, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)' }}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Modifier
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Permissions matrix */}
        <Section icon={<Layers size={16} />} title="Permissions accordées">
          <PermissionsMatrix permissions={role.permissions} />
        </Section>

        {/* Users list */}
        {users.length > 0 && (
          <Section icon={<Users size={16} />} title={`Utilisateurs avec ce rôle (${role._count.users})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: -10 }}>
              {users.map((u) => {
                const initials = getInitials(`${u.firstName} ${u.lastName}`)
                const colors   = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
                const color    = colors[u.id.charCodeAt(0) % colors.length]!
                return (
                  <div
                    key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => router.push(`${ROUTES.USERS}/${u.id}`)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Voir le profil de ${u.firstName} ${u.lastName}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`${ROUTES.USERS}/${u.id}`) } }}
                  >
                    <div
                      aria-hidden="true"
                      style={{ width: 32, height: 32, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}
                    >
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                        {u.firstName} {u.lastName}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={11} aria-hidden="true" />
                        {u.email}
                      </p>
                    </div>
                    <ArrowLeft size={14} aria-hidden="true" style={{ color: 'var(--text-3)', transform: 'rotate(180deg)', flexShrink: 0 }} />
                  </div>
                )
              })}
              {role._count.users > users.length && (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '12px 0 0', textAlign: 'center' }}>
                  … et {role._count.users - users.length} autre{role._count.users - users.length > 1 ? 's' : ''} utilisateur{role._count.users - users.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </Section>
        )}

      </div>
    </>
  )
}
