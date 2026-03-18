'use client'

import Link from 'next/link'
import { useDashboardKpis } from '../hooks'
import { formatXAF } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { getInitials } from '@/lib/utils'

// ─── Avatar colors ─────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: 'rgba(45,125,210,0.12)',  color: '#2D7DD2' },
  { bg: 'rgba(16,185,129,0.12)', color: '#10b981' },
  { bg: 'rgba(217,119,6,0.12)',  color: '#d97706' },
  { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
  { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
]

// ─── Skeleton ─────────────────────────────────────────────────
function ClientSkeleton() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ height: 16, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 14, width: 60, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4, marginBottom: 5 }} className="animate-pulse" />
            <div style={{ height: 10, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
          <div style={{ height: 13, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
export function TopClientsTable() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) return <ClientSkeleton />
  if (!data) return null

  const clients = data.topClients
  const maxRevenue = clients[0]?.totalRevenue ?? 0

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          Top clients par CA
        </h2>
        <Link
          href={ROUTES.CLIENTS}
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
        >
          Voir tout →
        </Link>
      </div>

      {clients.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune donnée disponible</p>
        </div>
      ) : (
        <div>
          {clients.map((client, idx) => {
            const { bg, color } = AVATAR_COLORS[idx % AVATAR_COLORS.length]
            const pct = maxRevenue > 0 ? Math.round((client.totalRevenue / maxRevenue) * 100) : 0

            return (
              <div
                key={client.clientId}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Rank + avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 40, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 16, textAlign: 'right' }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color, flexShrink: 0,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {getInitials(client.clientName)}
                    </span>
                  </div>

                  {/* Name + progress */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`${ROUTES.CLIENTS}/${client.clientId}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }} className="truncate">
                        {client.clientName}
                      </p>
                    </Link>
                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 2,
                          background: color,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Revenue */}
                  <span className="amount" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, marginLeft: 8 }}>
                    {formatXAF(client.totalRevenue)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
