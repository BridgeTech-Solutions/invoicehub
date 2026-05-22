'use client'

import { Check, Minus } from 'lucide-react'
import { PERMISSION_GROUPS, PERM_ACTION_LABELS } from '../types'

interface Props {
  permissions: string[]
  compact?: boolean
}

function getAction(perm: string): string {
  const parts = perm.split(':')
  return parts.slice(1).join(':')
}

export function PermissionsMatrix({ permissions, compact = false }: Props) {
  const hasAll = permissions.includes('*')

  const activeGroups = PERMISSION_GROUPS.filter((g) =>
    hasAll || g.perms.some((p) => permissions.includes(p)),
  )
  const groups = compact ? activeGroups : PERMISSION_GROUPS

  if (groups.length === 0) {
    return (
      <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>
        Aucune permission accordée
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {groups.map((group) => {
        const activePerms = group.perms.filter(
          (p) => hasAll || permissions.includes(p),
        )
        const allActive = activePerms.length === group.perms.length

        return (
          <div
            key={group.module}
            style={{
              display:      'grid',
              gridTemplateColumns: '160px 1fr',
              alignItems:   'start',
              gap:          12,
              padding:      '10px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {/* Module label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {allActive ? (
                <div
                  aria-hidden="true"
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: 'rgba(16,185,129,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Check size={10} style={{ color: '#059669' }} />
                </div>
              ) : activePerms.length > 0 ? (
                <div
                  aria-hidden="true"
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: 'rgba(245,158,11,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Minus size={10} style={{ color: '#d97706' }} />
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: 'var(--surface)', flexShrink: 0,
                  }}
                />
              )}
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
                fontFamily: 'var(--font-display)',
              }}>
                {group.label}
              </span>
            </div>

            {/* Permission badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {group.perms.map((perm) => {
                const active  = hasAll || permissions.includes(perm)
                const action  = getAction(perm)
                const label   = PERM_ACTION_LABELS[action] ?? action

                return (
                  <span
                    key={perm}
                    style={{
                      display:     'inline-flex',
                      alignItems:  'center',
                      gap:         3,
                      padding:     '2px 8px',
                      borderRadius: 100,
                      fontSize:    11.5,
                      fontWeight:  active ? 600 : 400,
                      fontFamily:  'var(--font-display)',
                      background:  active
                        ? perm.endsWith(':*') || perm === '*'
                          ? 'rgba(45,125,210,0.12)'
                          : 'rgba(16,185,129,0.1)'
                        : 'var(--surface)',
                      color: active
                        ? perm.endsWith(':*') || perm === '*'
                          ? 'var(--primary)'
                          : '#059669'
                        : 'var(--text-3)',
                      border: '1px solid',
                      borderColor: active
                        ? perm.endsWith(':*') || perm === '*'
                          ? 'rgba(45,125,210,0.25)'
                          : 'rgba(16,185,129,0.25)'
                        : 'var(--border)',
                    }}
                  >
                    {active && <Check size={9} aria-hidden="true" />}
                    {label}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
