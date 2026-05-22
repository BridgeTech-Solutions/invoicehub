'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield, Layers } from 'lucide-react'
import { PERMISSION_GROUPS, PERM_ACTION_LABELS } from '@/features/roles/types'
import { ROUTES } from '@/lib/constants'

function getAction(perm: string): string {
  return perm.split(':').slice(1).join(':')
}

export default function PermissionsListPage() {
  const router = useRouter()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>

      {/* Back */}
      <button
        type="button"
        onClick={() => router.push(ROUTES.ROLES)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0, alignSelf: 'flex-start' }}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Retour aux rôles
      </button>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
          Permissions disponibles
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
          Référentiel complet des permissions par module
        </p>
      </div>

      {/* Modules */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.module} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Module header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)' }}>
              <div aria-hidden="true" style={{ color: 'var(--primary)' }}>
                <Layers size={15} />
              </div>
              <h2 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                {group.label}
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                {group.module}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                {group.perms.length} permission{group.perms.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Permissions list */}
            <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {group.perms.map((perm) => {
                const action = getAction(perm)
                const label  = PERM_ACTION_LABELS[action] ?? action
                const isStar = action === '*'
                return (
                  <div
                    key={perm}
                    style={{
                      display:      'flex',
                      flexDirection: 'column',
                      gap:          2,
                      padding:      '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border:       `1.5px solid ${isStar ? 'rgba(45,125,210,0.25)' : 'var(--border)'}`,
                      background:   isStar ? 'rgba(45,125,210,0.04)' : 'var(--surface)',
                      minWidth:     100,
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: isStar ? 'var(--primary)' : 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                      <Shield size={11} aria-hidden="true" style={{ marginRight: 4, verticalAlign: 'middle', color: isStar ? 'var(--primary)' : 'var(--text-3)' }} />
                      {label}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {perm}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
