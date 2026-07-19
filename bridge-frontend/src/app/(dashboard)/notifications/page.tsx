'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BellOff, CheckCheck, Loader2, RefreshCw,
  Send, ThumbsUp, ThumbsDown, Clock, FileText,
  CreditCard, Coins, AlertCircle, Bell, UserPlus, Info,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  Receipt, ShoppingCart, PackageCheck, Package, FileCheck,
  TrendingDown, Landmark, CalendarClock, UserCog, ClipboardCheck, ClipboardX, Timer,
} from 'lucide-react'
import {
  useNotifications, useMarkRead, useMarkAllRead,
} from '@/features/notifications/hooks'
import { notificationsApi } from '@/features/notifications/api'
import { useSocket } from '@/hooks/useSocket'
import { useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/utils'
import type { NotificationType } from '@/features/notifications/types'
import { ListLoadError } from '@/components/feedback/ListLoadError'
import { getApiErrorMessage } from '@/lib/api-error'

// ─── Type config (Lucide icons — no emojis) ───────────────────
const TYPE_CONFIG: Record<NotificationType, {
  label: string; color: string; bg: string
  Icon: React.ElementType; href?: (entityId?: string) => string
}> = {
  proforma_sent:          { label: 'Proforma envoyée',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  Icon: Send,         href: (id) => id ? `/proformas/${id}` : '/proformas' },
  proforma_accepted:      { label: 'Proforma acceptée',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: ThumbsUp,     href: (id) => id ? `/proformas/${id}` : '/proformas' },
  proforma_rejected:      { label: 'Proforma rejetée',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: ThumbsDown,   href: (id) => id ? `/proformas/${id}` : '/proformas' },
  proforma_expired:       { label: 'Proforma expirée',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Clock,        href: (id) => id ? `/proformas/${id}` : '/proformas' },
  invoice_issued:         { label: 'Facture émise',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  Icon: FileText,     href: (id) => id ? `/invoices/${id}` : '/invoices' },
  invoice_paid:           { label: 'Facture soldée',      color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: CreditCard,   href: (id) => id ? `/invoices/${id}` : '/invoices' },
  invoice_partially_paid: { label: 'Paiement partiel',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  Icon: Coins,        href: (id) => id ? `/invoices/${id}` : '/invoices' },
  invoice_overdue:        { label: 'Facture en retard',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: AlertCircle,  href: (id) => id ? `/invoices/${id}` : '/invoices' },
  payment_registered:     { label: 'Paiement enregistré', color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: CreditCard,   href: (id) => id ? `/invoices/${id}` : '/invoices' },
  reminder_sent:          { label: 'Relance envoyée',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Bell },
  user_created:           { label: 'Nouveau compte',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  Icon: UserPlus,     href: () => '/users' },
  expense_submitted:      { label: 'Dépense soumise',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  Icon: Receipt,      href: (id) => id ? `/expenses/${id}` : '/expenses' },
  expense_approved:       { label: 'Dépense approuvée',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: CheckCircle2, href: (id) => id ? `/expenses/${id}` : '/expenses' },
  expense_rejected:       { label: 'Dépense rejetée',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: XCircle,      href: (id) => id ? `/expenses/${id}` : '/expenses' },
  purchase_order_created:  { label: 'BC créé',             color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  Icon: ShoppingCart, href: (id) => id ? `/purchase-orders/${id}` : '/purchase-orders' },
  purchase_order_approved: { label: 'BC approuvé',         color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: ClipboardCheck, href: (id) => id ? `/purchase-orders/${id}` : '/purchase-orders' },
  purchase_order_rejected: { label: 'BC rejeté',           color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: ClipboardX, href: (id) => id ? `/purchase-orders/${id}` : '/purchase-orders' },
  purchase_order_received: { label: 'BC réceptionné',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  Icon: Package, href: (id) => id ? `/purchase-orders/${id}` : '/purchase-orders' },
  supplier_invoice_received:{ label: 'Facture fournisseur reçue', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', Icon: FileCheck, href: (id) => id ? `/supplier-invoices/${id}` : '/supplier-invoices' },
  supplier_invoice_due:    { label: 'Facture fournisseur échue', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', Icon: PackageCheck, href: (id) => id ? `/supplier-invoices/${id}` : '/supplier-invoices' },
  approval_requested:      { label: 'Approbation demandée', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', Icon: ClipboardCheck },
  approval_approved:       { label: 'Approbation validée', color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: CheckCircle2 },
  approval_rejected:       { label: 'Approbation rejetée', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: ClipboardX },
  approval_expired:        { label: 'Approbation expirée', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Timer },
  approval_delegated:      { label: 'Approbation déléguée', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', Icon: UserCog },
  budget_exceeded:         { label: 'Budget dépassé',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   Icon: TrendingDown },
  low_stock_alert:         { label: 'Stock bas',           color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  Icon: AlertCircle },
  bank_reconciliation_pending: { label: 'Rapprochement bancaire', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', Icon: Landmark },
  fiscal_period_closing:   { label: 'Clôture fiscale',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  Icon: CalendarClock },
  role_changed:            { label: 'Rôle modifié',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  Icon: UserCog, href: () => '/users' },
  accounting_entry_failed: { label: 'Écriture comptable échouée', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', Icon: AlertCircle, href: () => '/accounting/entries' },
  system:                  { label: 'Système',             color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Info },
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

// ─── Pagination avec ellipsis ─────────────────────────────────
function buildPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p)
  }
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

// ─── Skeleton ─────────────────────────────────────────────────
function SkeletonNotif() {
  return (
    <div
      style={{ display: 'flex', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}
      aria-hidden="true"
    >
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 12, width: '60%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 10, width: '85%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Quick-action buttons ─────────────────────────────────────
type ActionState = 'idle' | 'loading' | 'done' | 'error'

function QuickActions({
  notifId, data, onMarkRead, onDone,
}: {
  notifId:    string
  data:       Record<string, unknown>
  onMarkRead: (id: string) => void
  onDone:     () => void
}) {
  const [state, setState] = useState<ActionState>('idle')
  const action = data.action as string | undefined

  const run = async (fn: () => Promise<void>) => {
    setState('loading')
    try {
      await fn()
      onMarkRead(notifId)
      setState('done')
      onDone()
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <CheckCircle2 size={14} style={{ color: '#10b981' }} />
        <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Mis à jour</span>
      </div>
    )
  }

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', borderRadius: 6, border: 'none',
    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)',
    cursor: state === 'loading' ? 'not-allowed' : 'pointer',
    opacity: state === 'loading' ? 0.7 : 1, transition: 'opacity 0.15s',
  }

  const btnPrimary: React.CSSProperties = {
    ...btnBase, background: 'var(--primary)', color: '#fff',
  }
  const btnGhost: React.CSSProperties = {
    ...btnBase, background: 'transparent',
    border: '1.5px solid var(--border)', color: 'var(--text-2)',
  }

  // ── confirm_payment : facture issued → payée ───────────────
  if (action === 'confirm_payment' && data.invoiceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} disabled={state === 'loading'}
          onClick={() => run(() => notificationsApi.quickConfirmPayment(data.invoiceId as string))}>
          {state === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
          Oui, marquer payée
        </button>
        <Link href={`/invoices/${data.invoiceId}`} style={{ ...btnGhost, textDecoration: 'none' }}>
          Voir la facture →
        </Link>
        {state === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur — réessayez</span>}
      </div>
    )
  }

  // ── confirm_invoice_draft_sent : brouillon facture → émise ─
  if (action === 'confirm_invoice_draft_sent' && data.invoiceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} disabled={state === 'loading'}
          onClick={() => run(() => notificationsApi.quickConfirmIssued(data.invoiceId as string))}>
          {state === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Oui, marquer émise
        </button>
        <button type="button" style={btnGhost} disabled={state === 'loading'}
          onClick={() => { onMarkRead(notifId); setState('done') }}>
          <XCircle size={11} />
          Non, garder brouillon
        </button>
        {state === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur — réessayez</span>}
      </div>
    )
  }

  // ── confirm_proforma_status : proforma sent → réponse client
  if (action === 'confirm_proforma_status' && data.proformaId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} disabled={state === 'loading'}
          onClick={() => run(() => notificationsApi.quickConfirmProformaAccepted(data.proformaId as string))}>
          {state === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
          Acceptée
        </button>
        <Link href={`/proformas/${data.proformaId}`} style={{ ...btnGhost, textDecoration: 'none' }}>
          Rejetée / Voir →
        </Link>
        {state === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur — réessayez</span>}
      </div>
    )
  }

  // ── confirm_proforma_draft_sent : brouillon proforma → envoyée
  if (action === 'confirm_proforma_draft_sent' && data.proformaId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} disabled={state === 'loading'}
          onClick={() => run(() => notificationsApi.quickConfirmProformaSent(data.proformaId as string))}>
          {state === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Oui, marquer envoyée
        </button>
        <button type="button" style={btnGhost} disabled={state === 'loading'}
          onClick={() => { onMarkRead(notifId); setState('done') }}>
          <XCircle size={11} />
          Non, garder brouillon
        </button>
        {state === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur — réessayez</span>}
      </div>
    )
  }

  return null
}

// ─── Notification Item ────────────────────────────────────────
function NotifItem({
  id, type, title, message, isRead, createdAt, data, entityId, onMarkRead, onRefresh,
}: {
  id: string; type: NotificationType; title: string; message: string | null
  isRead: boolean; createdAt: string; data: Record<string, unknown> | null
  entityId?: string; onMarkRead: (id: string) => void; onRefresh: () => void
}) {
  const router      = useRouter()
  const cfg         = TYPE_CONFIG[type] ?? { label: type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Bell }
  // Lien profond fourni par le backend (ex. notifs d'approbation) prioritaire,
  // sinon route dérivée du type via la config.
  const docLink     = typeof data?.documentLink === 'string' ? data.documentLink : undefined
  const href        = docLink ?? cfg.href?.(entityId)
  const hasActions  = !!data?.action
  // Notifications avec boutons d'action ne sont pas cliquables globalement
  const isClickable = !hasActions && (!isRead || !!href)

  const handleClick = () => {
    if (!isRead) onMarkRead(id)
    if (href) router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      style={{
        display: 'flex', gap: 14, padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: isRead ? 'transparent' : 'rgba(45,125,210,0.04)',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background 0.15s',
        outline: 'none',
      }}
      onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isRead ? 'transparent' : 'rgba(45,125,210,0.04)' }}
      onFocus={(e)      => { if (isClickable) e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--primary)' }}
      onBlur={(e)       => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Icon */}
      <div
        style={{
          width: 40, height: 40, borderRadius: '50%',
          background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, alignSelf: 'flex-start',
        }}
        aria-hidden="true"
      >
        <cfg.Icon size={18} color={cfg.color} strokeWidth={2} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
            textTransform: 'uppercase', letterSpacing: '0.06em', color: cfg.color,
          }}>
            {cfg.label}
          </span>
          {!isRead && (
            <span
              aria-label="Non lue"
              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }}
            />
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

        {/* Boutons d'action rapide */}
        {!!data?.action && (
          <QuickActions
            notifId={id}
            data={data}
            onMarkRead={onMarkRead}
            onDone={onRefresh}
          />
        )}
      </div>

      {/* Time */}
      <time
        dateTime={createdAt}
        style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}
      >
        {relativeTime(createdAt)}
      </time>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [page, setPage]             = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useNotifications({ page, limit: 20, unreadOnly })
  const markReadMut = useMarkRead()
  const markAllMut  = useMarkAllRead()
  const qc          = useQueryClient()

  const handleNewNotif = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])
  useSocket('notification:new', handleNewNotif)

  const handleActionDone = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])

  const notifs      = data?.data        ?? []
  const total       = data?.total       ?? 0
  const totalPages  = data?.totalPages  ?? 1
  const unreadCount = data?.unreadCount ?? 0
  const pageRange   = buildPageRange(page, totalPages)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
            Notifications
          </h1>
          <p
            style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}
            aria-live="polite"
            aria-atomic="true"
          >
            {/* Ne rien affirmer quand le chargement a échoué : `unreadCount` retombe
                à 0 et l'écran annonçait « Tout est lu » sans avoir rien pu lire. */}
            {isError && !data
              ? 'Décompte indisponible'
              : unreadCount > 0
                ? <><strong style={{ color: 'var(--primary)' }}>{unreadCount}</strong> non lue{unreadCount > 1 ? 's' : ''}</>
                : 'Tout est lu'}
            {!isError && total > 0 && ` · ${total} au total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Actualiser les notifications"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', cursor: isFetching ? 'not-allowed' : 'pointer',
              fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500,
              opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {isFetching ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
            Actualiser
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              aria-label="Marquer toutes les notifications comme lues"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--primary)',
                color: '#fff', cursor: markAllMut.isPending ? 'not-allowed' : 'pointer',
                fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
                opacity: markAllMut.isPending ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              {markAllMut.isPending
                ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                : <CheckCheck size={13} aria-hidden="true" />}
              Tout marquer comme lu
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="Filtrer les notifications">
        {([
          { label: 'Toutes',   value: false },
          { label: 'Non lues', value: true  },
        ] as const).map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={unreadOnly === opt.value}
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
          // L'échec de chargement doit précéder le cas « liste vide » : sans cette
          // branche, `data` undefined donnait `notifs = []` et l'écran affirmait
          // « Aucune notification » alors que rien n'avait pu être chargé.
          // On ne bascule sur l'erreur que s'il n'y a RIEN à montrer : quand une
          // actualisation échoue mais que des données restent en cache, mieux vaut
          // garder la liste affichée que la remplacer par un message d'erreur.
          : isError && notifs.length === 0
            ? (
              <ListLoadError
                entity="les notifications"
                message={getApiErrorMessage(error, 'La connexion au serveur a échoué. Vérifiez votre réseau, puis réessayez.')}
                onRetry={() => refetch()}
                isRetrying={isFetching}
              />
            )
          : notifs.length === 0
            ? (
              <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                <BellOff size={32} style={{ color: 'var(--text-3)', margin: '0 auto 12px' }} aria-hidden="true" />
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
                onRefresh={handleActionDone}
              />
            ))
        }

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            aria-label="Pagination des notifications"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}
          >
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Page {page} sur {totalPages}
            </p>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {/* Précédent */}
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Page précédente"
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border)', background: 'transparent',
                  color: page === 1 ? 'var(--text-3)' : 'var(--text-2)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>

              {/* Pages avec ellipsis */}
              {pageRange.map((p, i) =>
                p === '…'
                  ? (
                    <span
                      key={`ellipsis-${i}`}
                      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-3)' }}
                      aria-hidden="true"
                    >
                      …
                    </span>
                  )
                  : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                      style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid',
                        borderColor: p === page ? 'var(--primary)' : 'var(--border)',
                        background:  p === page ? 'var(--primary)' : 'transparent',
                        color:       p === page ? '#fff' : 'var(--text-2)',
                        fontSize: 13, cursor: 'pointer',
                        fontFamily: 'var(--font-display)', fontWeight: 600,
                        transition: 'all 0.15s',
                      }}
                    >
                      {p}
                    </button>
                  )
              )}

              {/* Suivant */}
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Page suivante"
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border)', background: 'transparent',
                  color: page === totalPages ? 'var(--text-3)' : 'var(--text-2)',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  opacity: page === totalPages ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}
