'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'

import { useState, useEffect, useCallback, useId } from 'react'
import { X, CheckCircle2, XCircle, UserCheck, ExternalLink, Clock } from 'lucide-react'
import { useApprove, useReject, useDelegate } from '../hooks'
import { useUsers } from '@/features/users/hooks'
import { DOCUMENT_TYPE_LABELS, STATUS_CONFIG } from '../types'
import type { ApprovalRequest } from '../types'

interface ApprovalDecisionDrawerProps {
  request: ApprovalRequest
  onClose: () => void
}

const fmt = new Intl.NumberFormat('fr-FR')
const fmtDate = (d: string) =>
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'À l\'instant'
  if (h < 24) return `Il y a ${h}h`
  return `Il y a ${Math.floor(h / 24)}j`
}

export function ApprovalDecisionDrawer({ request, onClose }: ApprovalDecisionDrawerProps) {
  const titleId = useId()
  const formId  = useId()

  const approveMut  = useApprove()
  const rejectMut   = useReject()
  const delegateMut = useDelegate()
  const { data: usersPage } = useUsers({ limit: 100 })
  const users = usersPage?.data ?? []

  const [isVisible, setIsVisible]   = useState(false)
  const [mode, setMode]             = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment]       = useState('')
  const [delegateId, setDelegateId] = useState('')
  const [showDelegate, setShowDelegate] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  const snapshot = request.documentSnapshot as Record<string, unknown>
  const docType  = DOCUMENT_TYPE_LABELS[request.documentType]
  const totalTtc = snapshot.totalTtc ?? snapshot.amountTtc

  const currentStep = request.workflow.steps.find((s) => s.order === request.currentStep)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return

    if (mode === 'approve') {
      approveMut.mutate({ id: request.id, payload: { comment: comment || undefined } }, { onSuccess: handleClose })
    } else {
      if (!comment.trim()) return
      rejectMut.mutate({ id: request.id, payload: { comment } }, { onSuccess: handleClose })
    }
  }

  function handleDelegate() {
    if (!delegateId.trim()) return
    delegateMut.mutate({ id: request.id, payload: { delegatedToId: delegateId, comment: comment || undefined } }, { onSuccess: handleClose })
  }

  const isPending = approveMut.isPending || rejectMut.isPending || delegateMut.isPending

  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 5, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-body)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <OverlayPortal>
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(10,20,35,0.5)', backdropFilter: 'blur(2px)',
          opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: Math.min(500, typeof window !== 'undefined' ? window.innerWidth : 500),
          background: 'var(--surface)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.16)',
          display: 'flex', flexDirection: 'column',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Top stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 60, borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Décision d&apos;approbation
          </h2>
          <button type="button" onClick={handleClose} aria-label="Fermer"
            style={{ width: 32, height: 32, border: '1.5px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* Doc summary */}
          <div style={{ padding: '16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 100, background: 'rgba(45,125,210,0.1)', color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                {docType}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
                {request.documentNumber ?? 'N/A'}
              </span>
            </div>
            {totalTtc !== undefined && (
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
                {fmt.format(Number(totalTtc))} <span style={{ fontSize: 13, color: 'var(--text-3)' }}>XAF</span>
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
              Demandé par <strong>{request.requestedBy.firstName} {request.requestedBy.lastName}</strong> · {fmtRelative(request.requestedAt)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{
                fontSize: 12, padding: '2px 8px', borderRadius: 100,
                background: STATUS_CONFIG[request.status].bg, color: STATUS_CONFIG[request.status].color,
                fontFamily: 'var(--font-display)', fontWeight: 600,
              }}>
                Étape {request.currentStep}/{request.totalSteps} — {currentStep?.name ?? ''}
              </span>
              {request.expiresAt && (
                <span style={{ fontSize: 12, color: '#d97706', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />
                  Expire {fmtRelative(request.expiresAt)}
                </span>
              )}
            </div>
          </div>

          {/* Decision timeline */}
          {request.decisions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Historique des décisions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {request.decisions.map((dec) => (
                  <div key={dec.id} style={{
                    display: 'flex', gap: 10, padding: '10px 12px',
                    borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: dec.decision === 'approved' ? 'rgba(22,163,74,0.1)' : dec.decision === 'rejected' ? 'rgba(220,38,38,0.1)' : 'rgba(107,114,128,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {dec.decision === 'approved'  && <CheckCircle2 size={14} style={{ color: '#16a34a' }} />}
                      {dec.decision === 'rejected'  && <XCircle size={14} style={{ color: '#dc2626' }} />}
                      {dec.decision === 'delegated' && <UserCheck size={14} style={{ color: '#6b7280' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                        {dec.decidedBy.firstName} {dec.decidedBy.lastName}
                        <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>{fmtDate(dec.decidedAt)}</span>
                      </p>
                      {dec.comment && (
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>{dec.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision form */}
          {request.isMyTurn && request.status === 'pending' && (
            <form id={formId} onSubmit={handleSubmit}>
              <label style={labelStyle}>Votre décision</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'approve' ? null : 'approve')}
                  style={{
                    padding: '10px', borderRadius: 8, border: '2px solid',
                    borderColor: mode === 'approve' ? '#16a34a' : 'var(--border)',
                    background: mode === 'approve' ? 'rgba(22,163,74,0.08)' : 'transparent',
                    color: mode === 'approve' ? '#16a34a' : 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s',
                  }}
                >
                  <CheckCircle2 size={16} />
                  Approuver
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'reject' ? null : 'reject')}
                  style={{
                    padding: '10px', borderRadius: 8, border: '2px solid',
                    borderColor: mode === 'reject' ? '#dc2626' : 'var(--border)',
                    background: mode === 'reject' ? 'rgba(220,38,38,0.08)' : 'transparent',
                    color: mode === 'reject' ? '#dc2626' : 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s',
                  }}
                >
                  <XCircle size={16} />
                  Rejeter
                </button>
              </div>

              {mode && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>
                    Commentaire {mode === 'reject' || currentStep?.requireComment ? '*' : '(optionnel)'}
                  </label>
                  <textarea
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                    placeholder={mode === 'reject' ? 'Motif du rejet (obligatoire)…' : 'Ajouter un commentaire…'}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required={mode === 'reject'}
                  />
                </div>
              )}

              {/* Delegation */}
              {currentStep?.allowDelegate && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDelegate(!showDelegate)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <UserCheck size={13} />
                    {showDelegate ? 'Masquer la délégation' : 'Déléguer à…'}
                  </button>
                  {showDelegate && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <select
                        style={{ ...inputStyle, flex: 1 }}
                        value={delegateId}
                        onChange={(e) => setDelegateId(e.target.value)}
                      >
                        <option value="">— Choisir un utilisateur —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}{u.status !== 'active' ? ' (inactif)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleDelegate}
                        disabled={!delegateId.trim() || isPending}
                        style={{
                          padding: '8px 14px', borderRadius: 8, border: 'none',
                          background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)',
                          opacity: !delegateId.trim() || isPending ? 0.6 : 1,
                        }}
                      >
                        Déléguer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          {!request.isMyTurn && request.status === 'pending' && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(45,125,210,0.05)', border: '1px solid rgba(45,125,210,0.15)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                En attente de décision de <strong>{currentStep?.name ?? 'l\'approbateur'}</strong>
              </p>
            </div>
          )}

          {/* Link to doc */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <a
              href={`/${request.documentType.replace('_', '-')}s/${request.documentId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              <ExternalLink size={13} />
              Voir le document complet
            </a>
          </div>
        </div>

        {/* Footer */}
        {request.isMyTurn && request.status === 'pending' && (
          <div style={{
            padding: '14px 24px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
          }}>
            <button type="button" onClick={handleClose}
              style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--text-2)' }}>
              Annuler
            </button>
            <button
              type="submit"
              form={formId}
              disabled={!mode || isPending || (mode === 'reject' && !comment.trim())}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: mode === 'reject' ? '#dc2626' : '#16a34a',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
                opacity: !mode || isPending ? 0.6 : 1, transition: 'background 0.15s',
              }}
            >
              {isPending ? 'En cours…' : mode === 'approve' ? 'Confirmer l\'approbation' : mode === 'reject' ? 'Confirmer le rejet' : 'Confirmer'}
            </button>
          </div>
        )}
      </div>
    </>
    </OverlayPortal>
  )
}
