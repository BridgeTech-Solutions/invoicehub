'use client'

import { useState, useCallback } from 'react'
import { BellOff, CheckCheck, Loader2, RefreshCw } from 'lucide-react'
import {
  useNotifications, useMarkRead, useMarkAllRead,
} from '@/features/notifications/hooks'
import { useSocket } from '@/hooks/useSocket'
import { useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/utils'
import type { NotificationType } from '@/features/notifications/types'

// ─── Type config ──────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { label: string; color: string; bg: string; icon: string }> = {
  proforma_sent:          { label: 'Proforma envoyée',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: '📤' },
  proforma_accepted:      { label: 'Proforma acceptée',     color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '✅' },
  proforma_rejected:      { label: 'Proforma rejetée',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: '🚫' },
  proforma_expired:       { label: 'Proforma expirée',      color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: '⌛' },
  invoice_issued:         { label: 'Facture émise',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: '📄' },
  invoice_paid:           { label: 'Facture soldée',        color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '💳' },
  invoice_partially_paid: { label: 'Paiement partiel',      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '💰' },
  invoice_overdue:        { label: 'Facture en retard',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '⏰' },
  payment_registered:     { label: 'Paiement enregistré',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '💳' },
  reminder_sent:          { label: 'Relance envoyée',       color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: '🔔' },
  user_created:           { label: 'Nouveau compte',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  icon: '👤' },
  system:                 { label: 'Système',               color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: 'ℹ️' },
}

// ─── Relative time ────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const now  = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return "À l'instant"
  if (min < 60) return `Il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h  < 24) return `Il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d  < 7)  return `Il y a ${d}j`
  return formatDate(dateStr)
}

// ─── Skeleton ─────────────────────────────────────────────────
function SkeletonNotif() {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 12, width: '60%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 10, width: '85%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Notification Item ────────────────────────────────────────
function NotifItem({
  id, type, title, message, isRead, createdAt, onMarkRead,
}: {
  id: string; type: NotificationType; title: string; message: string | null
  isRead: boolean; createdAt: string; onMarkRead: (id: string) => void
}) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: '🔔' }

  return (
    <div
      onClick={() => !isRead && onMarkRead(id)}
      style={{
        display: 'flex', gap: 14, padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: isRead ? 'transparent' : 'rgba(45,125,210,0.03)',
        cursor: isRead ? 'default' : 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!isRead) e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={(e) => { if (!isRead) e.currentTarget.style.background = 'rgba(45,125,210,0.03)' }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 18,
      }}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
            textTransform: 'uppercase', letterSpacing: '0.06em', color: cfg.color,
          }}>
            {cfg.label}
          </span>
          {!isRead && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
          )}
        </div>
        <p style={{
          fontSize: 13.5, fontWeight: isRead ? 400 : 600,
          color: isRead ? 'var(--text-2)' : 'var(--text-1)',
          margin: '0 0 3px', lineHeight: 1.4,
        }}>
          {title}
        </p>
        {message && (
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
            {message}
          </p>
        )}
      </div>

      {/* Time */}
      <span style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
        {relativeTime(createdAt)}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [page, setPage]             = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data, isLoading, refetch, isFetching } = useNotifications({ page, limit: 20, unreadOnly })
  const markReadMut = useMarkRead()
  const markAllMut  = useMarkAllRead()
  const qc          = useQueryClient()

  // Real-time via Socket.io
  const handleNewNotif = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])
  useSocket('notification:new', handleNewNotif)

  const notifs      = data?.data        ?? []
  const total       = data?.total       ?? 0
  const totalPages  = data?.totalPages  ?? 1
  const unreadCount = data?.unreadCount ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Notifications
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {unreadCount > 0
              ? <><strong style={{ color: 'var(--primary)' }}>{unreadCount}</strong> non lue{unreadCount > 1 ? 's' : ''}</>
              : 'Tout est lu'}
            {total > 0 && ` · ${total} au total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-display)', fontWeight: 500,
            }}
          >
            {isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Actualiser
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)',
                color: '#fff', cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
              }}
            >
              {markAllMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
              Tout marquer comme lu
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { label: 'Toutes', value: false },
          { label: 'Non lues', value: true },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => { setUnreadOnly(opt.value); setPage(1) }}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid',
              borderColor: unreadOnly === opt.value ? 'var(--primary)' : 'var(--border)',
              background:  unreadOnly === opt.value ? 'var(--primary)' : 'transparent',
              color:       unreadOnly === opt.value ? '#fff' : 'var(--text-2)',
              cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-display)', fontWeight: 600, transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonNotif key={i} />)
          : notifs.length === 0
            ? (
              <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                <BellOff size={32} style={{ color: 'var(--text-3)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
                  {unreadOnly ? 'Aucune notification non lue' : 'Aucune notification'}
                </p>
              </div>
            )
            : notifs.map((n) => (
              <NotifItem
                key={n.id}
                {...n}
                onMarkRead={(id) => markReadMut.mutate(id)}
              />
            ))
        }

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Page {page} sur {totalPages}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const p = i + 1
                return (
                  <button key={p} type="button" onClick={() => setPage(p)}
                    style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: '1.5px solid',
                      borderColor: p === page ? 'var(--primary)' : 'var(--border)',
                      background: p === page ? 'var(--primary)' : 'transparent',
                      color: p === page ? '#fff' : 'var(--text-2)',
                      fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600,
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
