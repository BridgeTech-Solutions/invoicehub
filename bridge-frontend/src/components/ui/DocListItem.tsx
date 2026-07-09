'use client'

/**
 * DocListItem — item générique style "inbox" pour listes de factures et proformas.
 *
 * Layout :
 *   [Avatar] | Nom client (gros)          | Montant TTC | Badge statut
 *            | N° · [TypeBadge] · sujet   |
 *            | Date émission → Date limite|
 *            | [====barre paiement====]   |  (optionnel)
 *
 * Ligne entière cliquable. Menu actions stop-propagation.
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import { getInitials } from '@/lib/utils'

// ─── Squelette de chargement ──────────────────────────────────

export function SkeletonDocItem() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Avatar */}
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} className="animate-pulse" />
      {/* Contenu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 14, width: 90,  background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
        <div style={{ height: 11, width: '55%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ height: 11, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 20, width: 70,  background: 'var(--border)', borderRadius: 10 }} className="animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ─── Barre de progression paiement ───────────────────────────

function PaymentBar({ amountPaid, totalTtc, isAlert }: { amountPaid: number; totalTtc: number; isAlert: boolean }) {
  const pct = totalTtc > 0 ? Math.min(100, Math.round((amountPaid / totalTtc) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% payé`}
        style={{
          flex: 1, height: 5, borderRadius: 99,
          background: 'var(--border)', overflow: 'hidden',
        }}
      >
        <div style={{
          height: '100%', width: `${pct}%`,
          background: isAlert ? '#ef4444' : '#10b981',
          borderRadius: 99, transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 11, color: isAlert ? '#ef4444' : 'var(--text-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {pct}%
      </span>
    </div>
  )
}

// ─── Types ───────────────────────────────────────────────────

export interface DocListItemProps {
  id:           string
  number:       string
  subject:      string | null
  clientName:   string
  issueDate:    string           // label "Émis le"
  limitDate:    string           // Échéance (facture) ou Validité (proforma)
  limitLabel:   string           // "Éch." | "Val."
  limitAlert:   boolean          // true = date dépassée → rouge
  totalTtc:     number
  statusBadge:  React.ReactNode
  typeBadge?:   React.ReactNode  // optionnel (factures uniquement)
  href:         string
  actions:      React.ReactNode
  // Paiement partiel
  amountPaid?:  number
  showPayBar?:  boolean
  // Fond teinté (overdue, expired, etc.)
  alertBg?:     boolean
  // Sélection clavier (navigation ↑/↓ · j/k) — pilotée par la liste parente
  selected?:    boolean
}

// ─── Composant principal ──────────────────────────────────────

export function DocListItem({
  number, subject, clientName,
  issueDate, limitDate, limitLabel, limitAlert,
  totalTtc, statusBadge, typeBadge,
  href, actions,
  amountPaid = 0, showPayBar = false,
  alertBg = false, selected = false,
}: DocListItemProps) {

  const router = useRouter()
  const [hovered, setHovered] = React.useState(false)
  const handleNav = () => router.push(href)
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNav() }
  }

  const baseBg  = alertBg ? 'rgba(239,68,68,0.03)' : 'transparent'
  const hoverBg = alertBg ? 'rgba(239,68,68,0.06)' : 'var(--surface)'
  const bgColor = selected ? 'var(--primary-light)' : hovered ? hoverBg : baseBg
  const active  = selected || hovered

  return (
    <div
      role="button"
      tabIndex={0}
      data-doc-row=""
      data-selected={selected || undefined}
      aria-label={`${number} — ${clientName}`}
      onClick={handleNav}
      onKeyDown={handleKey}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '13px 20px',
        borderBottom: '1px solid var(--border)',
        background: bgColor,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        outline: 'none',
        position: 'relative',
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--primary)' }}
      onBlur={(e)  => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Accent latéral (survol / sélection clavier) — signature Linear/Raycast */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: 'var(--primary)', borderRadius: '0 2px 2px 0',
          transform: `scaleY(${active ? 1 : 0})`,
          opacity: selected ? 1 : hovered ? 0.5 : 0,
          transformOrigin: 'center',
          transition: 'transform 0.16s ease, opacity 0.16s ease',
        }}
      />
      {/* ── Avatar initiales ── */}
      <div
        aria-hidden="true"
        style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(45,125,210,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'var(--primary)',
          fontFamily: 'var(--font-display)',
          marginTop: 1,
        }}
      >
        {getInitials(clientName)}
      </div>

      {/* ── Contenu principal ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Ligne 1 : client + montant */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-display)',
          }}>
            {clientName}
          </p>
          <p style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
            fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {new Intl.NumberFormat('fr-FR').format(Math.round(totalTtc))} XAF
          </p>
        </div>

        {/* Ligne 2 : numéro · type badge · sujet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--primary)',
            fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
          }}>
            {number}
          </span>
          {typeBadge}
          {subject && (
            <>
              <span style={{ fontSize: 11, color: 'var(--border)', flexShrink: 0 }}>·</span>
              <span style={{
                fontSize: 12, color: 'var(--text-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240,
              }}>
                {subject}
              </span>
            </>
          )}
        </div>

        {/* Ligne 3 : dates + badge statut */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, whiteSpace: 'nowrap' }}>
            Émis {issueDate}
            <span style={{ margin: '0 5px', color: 'var(--border)' }}>→</span>
            <span style={{ color: limitAlert ? '#ef4444' : 'var(--text-3)', fontWeight: limitAlert ? 600 : 400 }}>
              {limitLabel} {limitDate}
            </span>
          </p>
          {statusBadge}
        </div>

        {/* Ligne 4 : barre paiement (optionnel) */}
        {showPayBar && (
          <PaymentBar amountPaid={amountPaid} totalTtc={totalTtc} isAlert={limitAlert} />
        )}
      </div>

      {/* ── Menu actions (stop propagation) ── */}
      <div
        style={{ flexShrink: 0, marginTop: -2 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {actions}
      </div>
    </div>
  )
}
