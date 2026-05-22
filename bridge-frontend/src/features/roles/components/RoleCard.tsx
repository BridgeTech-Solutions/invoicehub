'use client'

import { useRouter } from 'next/navigation'
import { Shield, Users, Lock, Pencil, Trash2 } from 'lucide-react'
import type { RoleEntry } from '../types'
import { ROUTES } from '@/lib/constants'

const ALL_PERMS_COUNT = 57

const ROLE_PALETTE: Array<{ accent: string; bg: string; border: string }> = [
  { accent: '#2D7DD2', bg: 'rgba(45,125,210,0.06)',  border: 'rgba(45,125,210,0.18)'  },
  { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.06)',  border: 'rgba(139,92,246,0.18)'  },
  { accent: '#10b981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.18)'  },
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.18)'  },
  { accent: '#ef4444', bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.18)'   },
  { accent: '#06b6d4', bg: 'rgba(6,182,212,0.06)',   border: 'rgba(6,182,212,0.18)'   },
]

function getPalette(name: string, isSystem: boolean) {
  if (isSystem) return ROLE_PALETTE[0]
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % (ROLE_PALETTE.length - 1)
  return ROLE_PALETTE[idx + 1]!
}

interface Props {
  role:     RoleEntry
  onEdit:   (r: RoleEntry) => void
  onDelete: (r: RoleEntry) => void
  canManage: boolean
}

export function RoleCard({ role, onEdit, onDelete, canManage }: Props) {
  const router  = useRouter()
  const palette = getPalette(role.name, role.isSystem)
  const hasAll  = role.permissions.includes('*')
  const count   = hasAll ? ALL_PERMS_COUNT : role.permissions.length
  const pct     = Math.min(100, Math.round((count / ALL_PERMS_COUNT) * 100))
  const users   = role._count?.users ?? 0

  return (
    <div
      style={{
        background:   'var(--bg)',
        border:       `1.5px solid ${palette.border}`,
        borderRadius: 'var(--radius-lg)',
        padding:      '20px',
        display:      'flex',
        flexDirection: 'column',
        gap:          14,
        cursor:       'pointer',
        transition:   'box-shadow 0.15s, border-color 0.15s',
        position:     'relative',
      }}
      onClick={() => router.push(`${ROUTES.ROLES}/${role.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'
        e.currentTarget.style.borderColor = palette.accent
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = palette.border
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40, height: 40, borderRadius: 'var(--radius-md)',
              background: palette.bg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Shield size={18} style={{ color: palette.accent }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.2 }}>
                {role.displayName}
              </p>
              {role.isSystem && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  padding: '2px 6px', borderRadius: 100,
                  background: 'rgba(45,125,210,0.1)', color: 'var(--primary)',
                  fontFamily: 'var(--font-display)', textTransform: 'uppercase',
                }}>
                  <Lock size={9} aria-hidden="true" /> Système
                </span>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
              {role.name}
            </p>
          </div>
        </div>

        {/* Actions — stop propagation to prevent card click */}
        {canManage && (
          <div
            style={{ display: 'flex', gap: 4, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onEdit(role)}
              aria-label={`Modifier le rôle ${role.displayName}`}
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-3)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
            {!role.isSystem && (
              <button
                type="button"
                onClick={() => onDelete(role)}
                aria-label={`Supprimer le rôle ${role.displayName}`}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid rgba(239,68,68,0.2)',
                  background: 'rgba(239,68,68,0.05)',
                  color: '#dc2626', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Coverage bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Couverture
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: palette.accent, fontFamily: 'var(--font-display)' }}>
            {hasAll ? 'Accès total' : `${pct}%`}
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
          <div
            aria-hidden="true"
            style={{
              height: '100%', width: `${pct}%`,
              background: palette.accent,
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Footer: permissions + users */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Shield size={12} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
            {hasAll ? 'Toutes' : count} permission{count !== 1 ? 's' : ''}
          </span>
        </div>
        <span aria-hidden="true" style={{ color: 'var(--border)', fontSize: 14 }}>·</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Users size={12} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
            {users} utilisateur{users !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
