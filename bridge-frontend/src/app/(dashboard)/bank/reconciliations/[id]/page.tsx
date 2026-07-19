'use client'

import { useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Zap, CheckCircle2, AlertTriangle,
  Loader2, GitMerge, TrendingUp, Link2,
  ChevronDown, ChevronUp, Search, X, Info,
  FileText, CreditCard, Receipt,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import {
  useReconciliation, useTransactions,
  useReconcileTransaction, useAutoMatch,
  useCompleteReconciliation, useTransactionSuggestions,
} from '@/features/bank/hooks'
import { ReconciliationStatusBadge } from '@/features/bank/components/ReconciliationStatusBadge'
import { TransactionAmount } from '@/features/bank/components/TransactionAmount'
import { ConfidenceBar } from '@/features/bank/components/ConfidenceBar'
import type { BankTransaction, MatchingSuggestion, MatchedEntityType } from '@/features/bank/types'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { toast } from 'sonner'
import { OverlayPortal } from '@/components/ui/OverlayPortal'

// ─── Balance bar ────────────────────────────────────────────────────────────

function BalanceBar({
  statementBalance,
  systemBalance,
  difference,
  currency,
  matchedCount,
  pendingCount,
}: {
  statementBalance: number
  systemBalance:    number
  difference:       number | null
  currency:         string
  matchedCount:     number
  pendingCount:     number
}) {
  const diff   = difference ?? (systemBalance - statementBalance)
  const isOk   = Math.abs(diff) < 0.01
  const diffColor  = isOk ? '#16a34a' : Math.abs(diff) < 1000 ? '#d97706' : '#dc2626'
  const diffBg     = isOk ? '#dcfce7' : Math.abs(diff) < 1000 ? '#fef3c7' : '#fee2e2'
  const totalItems = matchedCount + pendingCount
  const progress   = totalItems > 0 ? Math.round((matchedCount / totalItems) * 100) : 0

  return (
    <div style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '12px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 10 }}>

        {/* Solde relevé */}
        <div style={{ flex: '1 1 160px', paddingRight: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>
            Solde relevé
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            {statementBalance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>{currency}</span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0, marginRight: 20 }} />

        {/* Solde système */}
        <div style={{ flex: '1 1 160px', paddingRight: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>
            Solde système
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            {systemBalance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>{currency}</span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0, marginRight: 20 }} />

        {/* Écart */}
        <div style={{ flex: '1 1 120px', paddingRight: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>
            Écart
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 99,
            background: diffBg, border: `1.5px solid ${diffColor}30`,
          }}>
            {isOk && <CheckCircle2 size={13} style={{ color: diffColor }} />}
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: diffColor, letterSpacing: '-0.01em' }}>
              {isOk ? 'Équilibré' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`}
            </span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0, marginRight: 20 }} />

        {/* Progression */}
        <div style={{ flex: '2 1 200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
              Progression
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: progress === 100 ? '#16a34a' : 'var(--text-2)' }}>
              {matchedCount} / {totalItems}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: progress === 100 ? '#16a34a' : 'var(--primary)',
              borderRadius: 99,
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Auto match modal ────────────────────────────────────────────────────────

/** Palier de confiance — énonce la règle appliquée par le serveur, sans la négocier. */
function ConfidenceTier({
  range, accent, title, detail,
}: { range: string; accent: string; title: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: accent, background: `${accent}14`, border: `1px solid ${accent}33`,
        borderRadius: 999, padding: '3px 9px', marginTop: 1,
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {range}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 1 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  )
}

/** Ligne de suite à donner après un auto-matching. Icône + texte : jamais la couleur seule. */
function ResultRow({
  icon, bg, border, color, text,
}: { icon: React.ReactNode; bg: string; border: string; color: string; text: string }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      background: bg, border: `1px solid ${border}`,
    }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, color, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

function AutoMatchModal({
  reconciliationId,
  onClose,
}: { reconciliationId: string; onClose: () => void }) {
  const [applied, setApplied] = useState(false)
  const [result,  setResult]  = useState<{ applied: number; pending: number; conflicts: number } | null>(null)
  const autoMatch = useAutoMatch(reconciliationId)

  const handleApply = async () => {
    // Le serveur n'applique que les ≥ 90 %. `medium` = suggestions à confirmer,
    // `skipped` = ≥ 90 % abandonnées faute de contrepartie libre. Les trois issues
    // sont distinctes et toutes affichées.
    const res = await autoMatch.mutateAsync()
    setResult({
      applied:   res.applied,
      pending:   res.medium?.length  ?? 0,
      conflicts: res.skipped?.length ?? 0,
    })
    setApplied(true)
  }

  return (
    <OverlayPortal>
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,20,35,0.55)', backdropFilter: 'blur(3px)' }} aria-hidden />
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          width: '100%', maxWidth: 420,
          overflow: 'hidden',
        }}>
          {/* Gradient stripe */}
          <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#9333ea 50%,#2D7DD2 100%)' }} />

          <div style={{ padding: '24px 28px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={20} style={{ color: '#9333ea' }} strokeWidth={1.8} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
                Auto-matching intelligent
              </h3>
            </div>

            {!applied ? (
              <>
                <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
                  L'algorithme analyse les montants, dates et libellés pour détecter automatiquement les correspondances.
                </p>

                {/* Règle de décision — deux paliers, énoncés tels qu'appliqués par le serveur */}
                <div style={{
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  overflow: 'hidden', marginBottom: 16,
                }}>
                  <ConfidenceTier
                    range="≥ 90 %"
                    accent="#16a34a"
                    title="Rapprochées automatiquement"
                    detail="Montant exact, même date, libellé concordant."
                  />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <ConfidenceTier
                    range="70–89 %"
                    accent="#d97706"
                    title="Proposées, à confirmer"
                    detail="Trop ambigu pour être écrit sans relecture. Vous validez au cas par cas."
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={onClose}
                    style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button type="button" onClick={handleApply} disabled={autoMatch.isPending}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 'var(--radius-md)', background: '#9333ea', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: autoMatch.isPending ? 'wait' : 'pointer', opacity: autoMatch.isPending ? 0.8 : 1, boxShadow: '0 4px 12px rgba(147,51,234,0.3)', transition: 'opacity 0.15s' }}>
                    {autoMatch.isPending ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Zap size={14} />}
                    {autoMatch.isPending ? 'Traitement…' : 'Lancer l\'auto-matching'}
                  </button>
                </div>
              </>
            ) : result ? (
              <div style={{ padding: '4px 0 4px' }}>
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: result.applied > 0 ? '#dcfce7' : 'var(--surface-2)',
                    border: `2px solid ${result.applied > 0 ? '#86efac' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                  }}>
                    <CheckCircle2 size={26} style={{ color: result.applied > 0 ? '#16a34a' : 'var(--text-3)' }} />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                    {result.applied}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 2 }}>
                    mouvement{result.applied !== 1 ? 's' : ''} rapproché{result.applied !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Ce qui reste à faire — jamais masqué : sans ça, l'écran laisserait
                    croire que le rapprochement est terminé. */}
                {(result.pending > 0 || result.conflicts > 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                    {result.pending > 0 && (
                      <ResultRow
                        icon={<AlertTriangle size={14} style={{ color: '#d97706' }} />}
                        bg="#fffbeb" border="#fde68a" color="#92400e"
                        text={`${result.pending} correspondance${result.pending > 1 ? 's' : ''} à 70–89 % attend${result.pending > 1 ? 'ent' : ''} votre confirmation, dans la liste ci-dessous.`}
                      />
                    )}
                    {result.conflicts > 0 && (
                      <ResultRow
                        icon={<AlertTriangle size={14} style={{ color: '#dc2626' }} />}
                        bg="#fef2f2" border="#fecaca" color="#991b1b"
                        text={`${result.conflicts} écartée${result.conflicts > 1 ? 's' : ''} : la contrepartie est déjà rapprochée d'un autre mouvement.`}
                      />
                    )}
                  </div>
                )}

                {result.applied === 0 && result.pending === 0 && result.conflicts === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, textAlign: 'center', marginBottom: 18 }}>
                    Aucune correspondance trouvée sur cette période. Rapprochez les mouvements à la main, ou vérifiez que les paiements correspondants ont bien été saisis.
                  </p>
                )}

                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={onClose}
                    style={{ padding: '10px 24px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
                    Continuer le rapprochement
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}

// ─── Transaction row (left panel) ────────────────────────────────────────────

function TxRow({
  tx,
  selected,
  onClick,
}: { tx: BankTransaction; selected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={selected}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '11px 16px',
        background: selected
          ? 'rgba(45,125,210,0.07)'
          : hovered ? 'var(--surface-2)' : 'transparent',
        border: 'none',
        borderLeft: `3px solid ${selected ? 'var(--primary)' : 'transparent'}`,
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        position: 'relative',
      }}
    >
      {/* Date + label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: selected ? 'var(--primary)' : 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.12s',
        }}>
          {tx.label}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{formatDate(tx.transactionDate)}</span>
          {tx.reference && <><span>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>{tx.reference}</span></>}
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginLeft: 12, flexShrink: 0 }}>
        <TransactionAmount amount={tx.amount} type={tx.type} size="sm" />
      </div>
    </button>
  )
}

// ─── Suggestion card (right panel) ───────────────────────────────────────────

const ENTITY_ICON: Record<MatchedEntityType, React.ElementType> = {
  payment:          CreditCard,
  supplier_payment: FileText,
  expense:          Receipt,
}

const ENTITY_LABEL: Record<MatchedEntityType, string> = {
  payment:          'Paiement client',
  supplier_payment: 'Paiement fournisseur',
  expense:          'Dépense',
}

function SuggestionCard({
  suggestion,
  transactionId,
  onReconciled,
}: {
  suggestion:     MatchingSuggestion
  transactionId:  string
  onReconciled:   () => void
}) {
  const reconcile = useReconcileTransaction()
  const [hovered, setHovered] = useState(false)
  const EIcon = ENTITY_ICON[suggestion.entityType] ?? FileText
  const scoreColor = suggestion.score >= 90 ? '#16a34a' : suggestion.score >= 70 ? '#d97706' : '#dc2626'
  const scoreBg    = suggestion.score >= 90 ? '#dcfce7' : suggestion.score >= 70 ? '#fef3c7' : '#fee2e2'

  const handleReconcile = async () => {
    await reconcile.mutateAsync({
      id: transactionId,
      data: { matchedEntityType: suggestion.entityType, matchedEntityId: suggestion.entityId },
    })
    onReconciled()
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${hovered ? 'var(--primary)' : 'var(--border)'}`,
        background: hovered ? 'rgba(45,125,210,0.03)' : 'var(--surface)',
        padding: '12px 14px',
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'pointer',
      }}
      onClick={handleReconcile}
      role="button"
      tabIndex={0}
      aria-label={`Rapprocher avec ${suggestion.label}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReconcile() } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Entity icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <EIcon size={14} style={{ color: 'var(--text-3)' }} strokeWidth={1.8} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Reference + entity type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
              {suggestion.reference}
            </span>
            <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-3)', fontWeight: 500, flexShrink: 0 }}>
              {ENTITY_LABEL[suggestion.entityType]}
            </span>
          </div>

          {/* Label */}
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
            {suggestion.label}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Amount */}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
              {suggestion.amount.toLocaleString('fr-FR')} XAF
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(suggestion.date)}</span>
          </div>
        </div>

        {/* Score + action */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: scoreColor, background: scoreBg, padding: '2px 7px', borderRadius: 99 }}>
            {suggestion.score}%
          </span>
          {reconcile.isPending
            ? <Loader2 size={14} style={{ color: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
            : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11.5, color: hovered ? 'var(--primary)' : 'var(--text-3)',
                fontWeight: 600, transition: 'color 0.12s',
              }}>
                <Link2 size={11} />
                Rapprocher
              </div>
            )}
        </div>
      </div>

      {/* Confidence detail bar */}
      {suggestion.score >= 70 && (
        <div style={{ marginTop: 8 }}>
          <ConfidenceBar value={suggestion.score} showLabel={false} />
        </div>
      )}
    </div>
  )
}

// ─── Right panel ──────────────────────────────────────────────────────────────

function RightPanel({
  selectedTx,
  onReconciled,
}: {
  selectedTx:  BankTransaction | null
  onReconciled: () => void
}) {
  const [search, setSearch] = useState('')
  const { data: suggestions = [], isLoading } = useTransactionSuggestions(
    selectedTx?.id ?? '', !!selectedTx
  )

  const filtered = search.trim()
    ? suggestions.filter(s =>
        s.label.toLowerCase().includes(search.toLowerCase()) ||
        s.reference?.toLowerCase().includes(search.toLowerCase())
      )
    : suggestions

  if (!selectedTx) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <GitMerge size={24} style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
          Sélectionnez une transaction
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 240 }}>
          Cliquez sur une transaction bancaire à gauche pour voir les correspondances suggérées.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Selected transaction summary */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(45,125,210,0.04)', flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
          Transaction sélectionnée
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedTx.label}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {formatDate(selectedTx.transactionDate)}
              {selectedTx.reference && <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 6 }}>{selectedTx.reference}</span>}
            </div>
          </div>
          <TransactionAmount amount={selectedTx.amount} type={selectedTx.type} size="md" />
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} aria-hidden />
          <input
            type="search"
            placeholder="Filtrer les correspondances…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Filtrer les correspondances"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 32px 7px 32px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }}
            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.background = 'var(--bg)' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Suggestions list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', color: 'var(--text-3)', fontSize: 13 }}>
            <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
            Analyse en cours…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <Info size={20} style={{ color: 'var(--text-3)', margin: '0 auto 10px', display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
              {search ? 'Aucune correspondance pour ce filtre' : 'Aucune correspondance automatique'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {search ? 'Essayez un autre terme.' : 'Cette transaction ne correspond à aucune écriture connue. Vous pouvez l\'ignorer ou la saisir manuellement.'}
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 2 }}>
              {filtered.length} correspondance{filtered.length !== 1 ? 's' : ''} — cliquez pour rapprocher
            </div>
            {filtered.map(s => (
              <SuggestionCard
                key={s.entityId}
                suggestion={s}
                transactionId={selectedTx.id}
                onReconciled={onReconciled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reconciled section (collapsible) ────────────────────────────────────────

function ReconciledSection({ transactions }: { transactions: BankTransaction[] }) {
  const [open, setOpen] = useState(false)
  if (transactions.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Rapprochées ({transactions.length})
          </span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ opacity: 0.65 }}>
          {transactions.map(tx => (
            <div key={tx.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tx.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {formatDate(tx.transactionDate)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <TransactionAmount amount={tx.amount} type={tx.type} size="sm" />
                <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Complete session modal ────────────────────────────────────────────────────

function CompleteModal({
  sessionId,
  difference,
  onClose,
  onCompleted,
}: { sessionId: string; difference: number | null; onClose: () => void; onCompleted: () => void }) {
  const complete  = useCompleteReconciliation()
  const diff      = difference ?? 0
  const isOk      = Math.abs(diff) < 0.01

  const handleComplete = async () => {
    await complete.mutateAsync(sessionId)
    onCompleted()
  }

  return (
    <OverlayPortal>
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,20,35,0.55)', backdropFilter: 'blur(3px)' }} aria-hidden />
        <div style={{ position: 'relative', zIndex: 1, background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1.5px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', width: '100%', maxWidth: 400, overflow: 'hidden' }}>
          <div style={{ height: 3, background: isOk ? 'linear-gradient(90deg,#16a34a,#22c55e)' : 'linear-gradient(90deg,#dc2626,#f87171)' }} />
          <div style={{ padding: '24px 28px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: isOk ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              {isOk
                ? <CheckCircle2 size={28} style={{ color: '#16a34a' }} />
                : <AlertTriangle size={28} style={{ color: '#dc2626' }} />}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
              {isOk ? 'Clôturer le rapprochement ?' : 'Écart non résolu'}
            </h3>
            {!isOk && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: '#fee2e2', marginBottom: 16 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#dc2626', fontFamily: 'var(--font-mono)' }}>
                  Écart de {Math.abs(diff).toLocaleString('fr-FR')} XAF non résolu.
                </span>
                <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>
                  Il est recommandé de résoudre l'écart avant de clôturer.
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
              {isOk
                ? 'Cette session sera marquée comme terminée. Les transactions rapprochées ne pourront plus être modifiées.'
                : 'Vous pouvez quand même clôturer avec un écart. Cela sera consigné dans le rapport.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
                Continuer
              </button>
              <button type="button" onClick={handleComplete} disabled={complete.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 'var(--radius-md)', background: isOk ? '#16a34a' : '#dc2626', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: complete.isPending ? 'wait' : 'pointer', opacity: complete.isPending ? 0.8 : 1, boxShadow: `0 4px 12px ${isOk ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}` }}>
                {complete.isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {isOk ? 'Clôturer' : 'Clôturer quand même'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconciliationWorkspacePage() {
  const { can } = usePermission()
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const [selectedTx,    setSelectedTx]    = useState<BankTransaction | null>(null)
  const [autoMatchOpen, setAutoMatchOpen] = useState(false)
  const [completeOpen,  setCompleteOpen]  = useState(false)

  const { data: session, isLoading: sessionLoading } = useReconciliation(params.id)

  const txParams = useMemo(() => session ? {
    accountId: session.bankAccountId,
    dateFrom:  session.periodStart,
    dateTo:    session.periodEnd,
    limit:     200,
    page:      1,
  } : null, [session])

  const { data: txData, isLoading: txLoading } = useTransactions(
    txParams ?? undefined
  )

  const allTx       = txData?.data ?? []
  const pendingTx   = allTx.filter(t => t.reconciliationStatus === 'pending' || t.reconciliationStatus === 'unmatched')
  const reconciledTx = allTx.filter(t => t.reconciliationStatus === 'reconciled')

  const handleReconciled = useCallback(() => {
    setSelectedTx(null)
    toast.success('Transaction rapprochée', { duration: 2000 })
  }, [])

  const handleCompleted = useCallback(() => {
    setCompleteOpen(false)
    toast.success('Session de rapprochement clôturée')
    router.push(ROUTES.BANK_RECONCILIATIONS)
  }, [router])

  const isLoading = sessionLoading || txLoading
  const sessionCompleted = session?.status === 'completed'

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Chargement de la session…</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
        <AlertTriangle size={28} style={{ color: '#dc2626' }} />
        <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>Session introuvable.</span>
        <button type="button" onClick={() => router.push(ROUTES.BANK_RECONCILIATIONS)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Retour
        </button>
      </div>
    )
  }

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)', overflow: 'hidden' }}>

      {/* ── Sticky header ────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={() => router.push(ROUTES.BANK_RECONCILIATIONS)}
            aria-label="Retour à la liste"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}>
            <ArrowLeft size={14} />
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                Rapprochement — {session.bankAccount?.name ?? 'Compte'}
              </span>
              {session.status !== 'in_progress' && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99,
                  background: session.status === 'completed' ? '#dcfce7' : '#f1f5f9',
                  color: session.status === 'completed' ? '#16a34a' : '#64748b',
                  fontWeight: 600, fontFamily: 'var(--font-display)',
                }}>
                  {session.status === 'completed' ? 'Terminé' : 'Annulé'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              {formatDate(session.periodStart)} → {formatDate(session.periodEnd)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!sessionCompleted && (
            <>
              <button
                type="button"
                onClick={() => setAutoMatchOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid #9333ea30', background: 'rgba(147,51,234,0.07)', color: '#9333ea', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(147,51,234,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(147,51,234,0.07)' }}
              >
                <Zap size={14} />
                Auto-matcher
              </button>
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.25)', transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <TrendingUp size={14} />
                Terminer
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Balance bar ──────────────────────────────────────────── */}
      <BalanceBar
        statementBalance={session.closingBalanceStatement}
        systemBalance={session.openingBalance}
        difference={session.closingBalanceStatement - session.closingBalanceSystem}
        currency={session.bankAccount?.currency ?? 'XAF'}
        matchedCount={reconciledTx.length}
        pendingCount={pendingTx.length}
      />

      {/* ── Split workspace ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: Bank transactions */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Column header */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                Transactions bancaires
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: pendingTx.length > 0 ? '#d97706' : '#16a34a' }}>
                {pendingTx.length} en attente
              </span>
            </div>
          </div>

          {/* Pending transactions */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {txLoading ? (
              <div aria-hidden>
                {[...Array(8)].map((_, i) => (
                  <div key={i} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 13, width: '70%', background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
                      <div style={{ height: 10, width: '40%', background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                    </div>
                    <div style={{ height: 13, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                  </div>
                ))}
              </div>
            ) : pendingTx.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
                <CheckCircle2 size={28} style={{ color: '#16a34a', marginBottom: 10 }} />
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>
                  Toutes les transactions sont rapprochées
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Vous pouvez maintenant clôturer la session.
                </div>
              </div>
            ) : (
              pendingTx.map(tx => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  selected={selectedTx?.id === tx.id}
                  onClick={() => setSelectedTx(prev => prev?.id === tx.id ? null : tx)}
                />
              ))
            )}

            {/* Reconciled section (collapsed) */}
            <ReconciledSection transactions={reconciledTx} />
          </div>
        </div>

        {/* Right: Suggestions panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
          {/* Column header */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                Correspondances
              </span>
              {selectedTx && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Cliquez une correspondance pour rapprocher
                </span>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
            <RightPanel selectedTx={selectedTx} onReconciled={handleReconciled} />
          </div>
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
      {autoMatchOpen && (
        <AutoMatchModal
          reconciliationId={params.id}
          onClose={() => setAutoMatchOpen(false)}
        />
      )}
      {completeOpen && (
        <CompleteModal
          sessionId={params.id}
          difference={session.closingBalanceStatement - session.closingBalanceSystem}
          onClose={() => setCompleteOpen(false)}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  )
}
