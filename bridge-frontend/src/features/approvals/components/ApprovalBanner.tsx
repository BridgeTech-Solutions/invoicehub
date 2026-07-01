'use client'

import { Clock, XCircle, AlertCircle } from 'lucide-react'
import type { ApprovalRequestStatus } from '../types'

interface ApprovalBannerProps {
  request: { status: ApprovalRequestStatus; currentStep: number; totalSteps: number } | null
}

/**
 * Bandeau de statut d'approbation, sobre (une seule couleur par état).
 * Masqué quand aucun workflow n'est en jeu ou quand c'est déjà approuvé.
 */
export function ApprovalBanner({ request }: ApprovalBannerProps) {
  if (!request || request.status === 'approved') return null

  const cfg = {
    pending:   { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.30)', color: '#b45309', Icon: Clock,       label: `En attente de validation — étape ${request.currentStep}/${request.totalSteps}` },
    rejected:  { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.25)',  color: '#dc2626', Icon: XCircle,     label: 'Demande de validation rejetée' },
    cancelled: { bg: 'rgba(148,163,184,0.10)', border: 'var(--border)',        color: '#64748b', Icon: AlertCircle, label: 'Demande de validation annulée' },
    expired:   { bg: 'rgba(148,163,184,0.10)', border: 'var(--border)',        color: '#64748b', Icon: AlertCircle, label: 'Demande de validation expirée' },
  }[request.status]

  if (!cfg) return null
  const { Icon } = cfg

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px', borderRadius: 'var(--radius-md)',
        background: cfg.bg, border: `1px solid ${cfg.border}`,
      }}
    >
      <Icon size={16} style={{ color: cfg.color, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, fontFamily: 'var(--font-display)' }}>
        {cfg.label}
      </span>
    </div>
  )
}
