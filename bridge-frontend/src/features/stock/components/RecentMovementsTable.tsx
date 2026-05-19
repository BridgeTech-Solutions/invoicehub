'use client'

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useStockSummary } from '../hooks'
import { MovementTypeBadge } from './MovementTypeBadge'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { StockMovementType } from '../types'

const EXIT_TYPES = new Set(['sale', 'adjustment_out', 'write_off', 'return_supplier', 'transfer_out'])

export function RecentMovementsTable() {
  const { data, isLoading } = useStockSummary()

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
          Derniers mouvements
        </h2>
        <Link href={ROUTES.STOCK_MOVEMENTS} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          Voir tout →
        </Link>
      </div>

      {isLoading ? (
        <div aria-hidden="true">
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ height: 12, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              <div style={{ height: 12, width: 140, background: 'var(--border)', borderRadius: 4, flex: 1 }} className="animate-pulse" />
              <div style={{ height: 12, width: 50, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      ) : !data?.lastMovements?.length ? (
        <p style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
          Aucun mouvement enregistré
        </p>
      ) : (
        data.lastMovements.map((m) => {
          const isExit = EXIT_TYPES.has(m.type)
          return (
            <div
              key={m.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isExit ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                }}
              >
                {isExit
                  ? <ArrowDownRight size={13} style={{ color: '#dc2626' }} />
                  : <ArrowUpRight   size={13} style={{ color: '#16a34a' }} />
                }
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.product.name}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                  {formatDate(m.createdAt)}
                </p>
              </div>

              <MovementTypeBadge type={m.type as StockMovementType} />

              <span
                style={{
                  fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
                  color: isExit ? '#dc2626' : '#16a34a',
                  minWidth: 44, textAlign: 'right',
                }}
              >
                {isExit ? '-' : '+'}{Math.abs(m.quantity)}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
