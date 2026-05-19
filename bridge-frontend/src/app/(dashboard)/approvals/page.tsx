'use client'

import { useState, useMemo } from 'react'
import {
  CheckSquare, Clock, CheckCircle2, XCircle, AlertCircle,
  Filter, ArrowRight, User,
} from 'lucide-react'
import { useApprovalRequests } from '@/features/approvals/hooks'
import { ApprovalDecisionDrawer } from '@/features/approvals/components/ApprovalDecisionDrawer'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_COLORS,
  STATUS_CONFIG,
} from '@/features/approvals/types'
import type { ApprovalRequest, ApprovalRequestStatus } from '@/features/approvals/types'

// ─── Constants ───────────────────────────────────────────────────

const STATUS_TABS: { value: ApprovalRequestStatus | ''; label: string }[] = [
  { value: '',          label: 'Toutes' },
  { value: 'pending',   label: 'En attente' },
  { value: 'approved',  label: 'Approuvées' },
  { value: 'rejected',  label: 'Rejetées' },
  { value: 'expired',   label: 'Expirées' },
]

const fmt     = new Intl.NumberFormat('fr-FR')
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const h    = Math.floor(diff / 3_600_000)
  if (h < 1)  return "À l'instant"
  if (h < 24) return `Il y a ${h}h`
  return `Il y a ${Math.floor(h / 24)}j`
}

// ─── KPI Card ────────────────────────────────────────────────────

function KpiCard({
  label, value, color, bg, borderColor,
}: { label: string; value: number | string; color: string; bg: string; borderColor: string }) {
  return (
    <div
      className="card"
      style={{
        padding: '14px 20px', flex: 1, minWidth: 120,
        borderTop: `3px solid ${borderColor}`,
        background: bg,
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', color }}>
        {value}
      </p>
    </div>
  )
}

// ─── Request Card ────────────────────────────────────────────────

function RequestCard({ request, onDecide }: { request: ApprovalRequest; onDecide: () => void }) {
  const colors    = DOCUMENT_TYPE_COLORS[request.documentType]
  const statusCfg = STATUS_CONFIG[request.status]
  const snapshot  = request.documentSnapshot as Record<string, unknown>
  const totalTtc  = snapshot.totalTtc ?? snapshot.amountTtc

  const expiresInMs  = request.expiresAt ? new Date(request.expiresAt).getTime() - Date.now() : null
  const expiresInH   = expiresInMs !== null && expiresInMs > 0 ? Math.floor(expiresInMs / 3_600_000) : null
  const isUrgent     = expiresInH !== null && expiresInH < 24
  const isExpiredSoon = expiresInH !== null && expiresInH < 48

  const completedSteps = request.decisions.length
  const currentStepName = request.workflow.steps.find((s) => s.order === request.currentStep)?.name

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        border: request.isMyTurn && request.status === 'pending'
          ? '1.5px solid rgba(45,125,210,0.3)'
          : '1px solid var(--border)',
        opacity: !['pending', 'approved'].includes(request.status) ? 0.72 : 1,
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Color stripe top */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${colors.color} 0%, ${colors.color}80 100%)` }} />

      <div style={{ padding: '16px 20px' }}>
        {/* Row 1 — badges + amount */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 9px', borderRadius: 100, background: colors.bg, color: colors.color, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {DOCUMENT_TYPE_LABELS[request.documentType]}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
                {request.documentNumber ?? 'Réf. inconnue'}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: statusCfg.bg, color: statusCfg.color, fontFamily: 'var(--font-display)', fontWeight: 600, flexShrink: 0 }}>
                {statusCfg.label}
              </span>
              {request.isMyTurn && request.status === 'pending' && (
                <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 100, background: 'rgba(45,125,210,0.12)', color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 700, flexShrink: 0 }}>
                  Mon tour
                </span>
              )}
            </div>

            {/* Requester */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
              <User size={11} aria-hidden />
              <span>
                <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>
                  {request.requestedBy.firstName} {request.requestedBy.lastName}
                </strong>
                {' · '}{fmtRelative(request.requestedAt)}{' · '}{fmtDate(request.requestedAt)}
              </span>
            </div>
          </div>

          {/* Right — amount + step */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {totalTtc !== undefined && (
              <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                {fmt.format(Number(totalTtc))}
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 3 }}>XAF</span>
              </p>
            )}
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
              Étape {request.currentStep}/{request.totalSteps}
              {currentStepName && <span style={{ color: 'var(--text-2)', fontWeight: 500 }}> — {currentStepName}</span>}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: request.isMyTurn || !request.isMyTurn ? 12 : 0 }}>
          {request.workflow.steps.map((step) => {
            const isDone   = step.order < request.currentStep || request.status === 'approved'
            const isActive = step.order === request.currentStep && request.status === 'pending'
            return (
              <div
                key={step.order}
                title={step.name}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: isDone ? '#16a34a' : isActive ? 'var(--primary)' : 'var(--border)',
                  transition: 'background 0.2s',
                }}
              />
            )
          })}
          {expiresInH !== null && (
            <span style={{ fontSize: 11, color: isUrgent ? '#dc2626' : isExpiredSoon ? '#d97706' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 8, flexShrink: 0, fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              <Clock size={11} />
              {isUrgent ? `${expiresInH}h restante${expiresInH > 1 ? 's' : ''}` : `${Math.floor(expiresInH / 24)}j`}
            </span>
          )}
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {request.isMyTurn && request.status === 'pending' ? (
            <button
              type="button"
              onClick={onDecide}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8,
                border: 'none', background: 'var(--primary)', color: '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
                boxShadow: '0 2px 8px rgba(45,125,210,0.25)',
              }}
            >
              <CheckCircle2 size={13} />
              Approuver / Rejeter
              <ArrowRight size={12} />
            </button>
          ) : request.status === 'pending' ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>
              En attente de <strong style={{ color: 'var(--text-2)', fontStyle: 'normal' }}>{currentStepName ?? '—'}</strong>
            </p>
          ) : (
            <div />
          )}

          {/* Decisions taken */}
          {request.decisions.length > 0 && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
              {completedSteps} décision{completedSteps > 1 ? 's' : ''} enregistrée{completedSteps > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 3, background: 'var(--border)' }} />
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ height: 20, width: 80, background: 'var(--border)', borderRadius: 100 }} />
              <div style={{ height: 20, width: 100, background: 'var(--border)', borderRadius: 4 }} />
            </div>
            <div style={{ height: 12, width: 160, background: 'var(--border)', borderRadius: 4 }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ height: 22, width: 100, background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 12, width: 80, background: 'var(--border)', borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 12 }} />
        <div style={{ height: 32, width: 160, background: 'var(--border)', borderRadius: 8 }} />
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [activeStatus, setActiveStatus] = useState<ApprovalRequestStatus | ''>('')
  const [pendingForMe, setPendingForMe]  = useState(false)
  const [selected, setSelected]         = useState<ApprovalRequest | null>(null)

  const { data, isLoading, isError } = useApprovalRequests({
    ...(activeStatus   ? { status: activeStatus } : {}),
    ...(pendingForMe   ? { pendingForMe: true }   : {}),
  })

  const requests = data?.data ?? []

  const counts = useMemo(() => {
    const all = data?.data ?? []
    return {
      total:    all.length,
      pending:  all.filter((r) => r.status === 'pending').length,
      approved: all.filter((r) => r.status === 'approved').length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      myTurn:   all.filter((r) => r.isMyTurn).length,
    }
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Approbations
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            Circuit de validation multi-étapes des documents métier
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPendingForMe((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            borderRadius: 'var(--radius-md)', border: '1.5px solid',
            borderColor:  pendingForMe ? 'var(--primary)' : 'var(--border)',
            background:   pendingForMe ? 'rgba(45,125,210,0.06)' : 'var(--surface)',
            color:        pendingForMe ? 'var(--primary)' : 'var(--text-2)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <Filter size={13} />
          {pendingForMe ? 'Toutes les demandes' : 'Mes approbations'}
          {!pendingForMe && counts.myTurn > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '0 4px' }}>
              {counts.myTurn}
            </span>
          )}
        </button>
      </div>

      {/* KPIs */}
      {!isLoading && !isError && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KpiCard label="Total"       value={counts.total}    color="var(--text-1)"   bg="var(--surface)"              borderColor="var(--border)" />
          <KpiCard label="En attente"  value={counts.pending}  color="#d97706"          bg="rgba(217,119,6,0.04)"        borderColor="#d97706" />
          <KpiCard label="Approuvées"  value={counts.approved} color="#16a34a"          bg="rgba(22,163,74,0.04)"        borderColor="#16a34a" />
          <KpiCard label="Rejetées"    value={counts.rejected} color="#dc2626"          bg="rgba(220,38,38,0.04)"        borderColor="#dc2626" />
        </div>
      )}

      {/* Status tabs */}
      <div
        role="group"
        aria-label="Filtrer par statut"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '4px', background: 'var(--surface-2, #f8fafc)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
          width: 'fit-content',
        }}
      >
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveStatus(tab.value as ApprovalRequestStatus | '')}
              aria-pressed={isActive}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none',
                background:  isActive ? '#fff' : 'transparent',
                color:       isActive ? 'var(--text-1)' : 'var(--text-3)',
                cursor: 'pointer', fontSize: 12.5, fontWeight: isActive ? 700 : 400,
                fontFamily: 'var(--font-display)', transition: 'all 0.15s',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isError ? (
        <div style={{ padding: '20px 24px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#ef4444', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            Impossible de charger les demandes. Veuillez rafraîchir.
          </p>
        </div>
      ) : isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : requests.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '72px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, marginBottom: 20, background: 'linear-gradient(135deg, rgba(45,125,210,0.1) 0%, rgba(45,125,210,0.05) 100%)', border: '1.5px solid rgba(45,125,210,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckSquare size={32} style={{ color: 'var(--primary)', opacity: 0.7 }} />
          </div>
          <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            {activeStatus ? `Aucune demande ${STATUS_CONFIG[activeStatus]?.label.toLowerCase() ?? ''}` : 'Aucune demande'}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', fontFamily: 'var(--font-body)', maxWidth: 380, lineHeight: 1.6 }}>
            {pendingForMe
              ? "Aucune demande ne requiert votre décision pour l'instant."
              : activeStatus
                ? 'Aucune demande ne correspond à ce filtre.'
                : 'Les demandes d\'approbation créées par les workflows apparaîtront ici.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((req) => (
            <RequestCard key={req.id} request={req} onDecide={() => setSelected(req)} />
          ))}
          {(data?.total ?? 0) > requests.length && (
            <p style={{ margin: '4px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
              Affichage de {requests.length} / {data?.total} demandes
            </p>
          )}
        </div>
      )}

      {selected && (
        <ApprovalDecisionDrawer request={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
