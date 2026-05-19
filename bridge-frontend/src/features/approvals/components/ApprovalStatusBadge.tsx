'use client'

import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import type { ApprovalRequestStatus } from '../types'
import { STATUS_CONFIG } from '../types'

interface ApprovalStatusBadgeProps {
  request: { status: ApprovalRequestStatus; currentStep: number; totalSteps: number } | null
  onViewRequest?: () => void
}

export function ApprovalStatusBadge({ request, onViewRequest }: ApprovalStatusBadgeProps) {
  if (!request) return null

  const cfg = STATUS_CONFIG[request.status]

  const Icon =
    request.status === 'pending'   ? Clock        :
    request.status === 'approved'  ? CheckCircle2 :
    request.status === 'rejected'  ? XCircle      :
    AlertCircle

  const label =
    request.status === 'pending'
      ? `${cfg.label} (${request.currentStep}/${request.totalSteps})`
      : cfg.label

  return (
    <button
      type="button"
      onClick={onViewRequest}
      disabled={!onViewRequest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 100,
        background: cfg.bg, color: cfg.color,
        border: `1.5px solid ${cfg.color}30`,
        cursor: onViewRequest ? 'pointer' : 'default',
        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)',
      }}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </button>
  )
}
