'use client'

import { CheckCircle2, Circle, Clock, XCircle, Send, FileCheck } from 'lucide-react'
import type { ProformaStatusHistory } from '../types'
import { formatDate } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: 'Brouillon créé',  color: '#94a3b8', icon: Circle       },
  sent:     { label: 'Envoyée',         color: '#3b82f6', icon: Send         },
  accepted: { label: 'Acceptée',        color: '#10b981', icon: FileCheck    },
  rejected: { label: 'Rejetée',         color: '#f43f5e', icon: XCircle      },
  expired:  { label: 'Expirée',         color: '#f97316', icon: Clock        },
}

export function StatusTimeline({ history }: { history: ProformaStatusHistory[] }) {
  if (!history || history.length === 0) return null

  const sorted = [...history].sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {sorted.map((entry, i) => {
        const cfg = STATUS_CONFIG[entry.newStatus] ?? { label: entry.newStatus, color: '#94a3b8', icon: Circle }
        const Icon = cfg.icon
        const isLast = i === sorted.length - 1
        return (
          <div key={entry.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {/* Line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: `${cfg.color}20`, border: `2px solid ${cfg.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, zIndex: 1,
              }}>
                <Icon size={11} style={{ color: cfg.color }} />
              </div>
              {!isLast && (
                <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 16 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 16, paddingTop: 2, flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>
                {cfg.label}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {entry.changedBy.firstName} {entry.changedBy.lastName}
                {' · '}
                {formatDate(entry.changedAt)}
              </p>
              {entry.reason && (
                <p style={{ fontSize: 12, color: '#d97706', margin: '4px 0 0', fontStyle: 'italic' }}>
                  Motif : {entry.reason}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
