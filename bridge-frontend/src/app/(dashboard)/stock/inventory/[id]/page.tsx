'use client'

import { use, useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, CheckCircle2, XCircle, Loader2, ClipboardCheck } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { useConfirm } from '@/providers/ConfirmProvider'
import {
  useInventorySession, useSaveCounts, useValidateInventory, useCancelInventory,
} from '@/features/stock/hooks'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { InventoryStatus } from '@/features/stock/types'

const STATUS: Record<InventoryStatus, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Brouillon',  color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'En cours',   color: '#d97706', bg: '#fffbeb' },
  validated:   { label: 'Validé',     color: '#16a34a', bg: '#f0fdf4' },
  cancelled:   { label: 'Annulé',     color: '#94a3b8', bg: '#f8fafc' },
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: accent ?? 'var(--text-1)' }}>{value}</p>
    </div>
  )
}

export default function InventoryCountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { can } = usePermission()
  const { format } = useCurrency()
  const confirm = useConfirm()

  const { data: session, isLoading } = useInventorySession(id)
  const saveCounts   = useSaveCounts(id)
  const validate     = useValidateInventory(id)
  const cancel       = useCancelInventory(id)

  // Saisie locale : lineId -> valeur texte du compté.
  const [counts, setCounts] = useState<Record<string, string>>({})

  const editable = session?.status === 'in_progress' && can('stock', 'adjust')

  const rows = useMemo(() => (session?.lines ?? []).map((l) => {
    const raw = counts[l.id]
    const counted = raw !== undefined ? (raw === '' ? null : Number(raw)) : l.countedQty
    const gap = counted != null ? counted - l.theoreticalQty : null
    return { ...l, counted, gap, gapValue: gap != null && l.unitCostHt != null ? gap * l.unitCostHt : null }
  }), [session, counts])

  if (!can('stock', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de gestion des stocks." />
  if (isLoading) return <div className="card animate-pulse" style={{ height: 300 }} />
  if (!session) return null

  const st = STATUS[session.status]
  const liveGaps = rows.filter(r => r.gap != null && r.gap !== 0)
  const liveGapValue = liveGaps.reduce((s, r) => s + (r.gapValue ?? 0), 0)
  const countedNb = rows.filter(r => r.counted != null).length

  function handleSave() {
    const lines = Object.entries(counts)
      .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
      .map(([lineId, v]) => ({ lineId, countedQty: Number(v) }))
    if (lines.length === 0) return
    saveCounts.mutate({ lines }, { onSuccess: () => setCounts({}) })
  }

  async function handleValidate() {
    // On enregistre d'abord toute saisie en attente.
    const pending = Object.entries(counts).filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
    const ok = await confirm({
      title: 'Valider l\'inventaire ?',
      message: `Le stock sera recalé sur les quantités comptées : ${liveGaps.length} écart(s) généreront un mouvement d'ajustement et l'écriture comptable correspondante. Action irréversible.`,
      confirmLabel: 'Valider et recaler',
    })
    if (!ok) return
    if (pending.length > 0) {
      await saveCounts.mutateAsync({ lines: pending.map(([lineId, v]) => ({ lineId, countedQty: Number(v) })) })
      setCounts({})
    }
    validate.mutate()
  }

  async function handleCancel() {
    const ok = await confirm({
      title: 'Annuler cette session ?',
      message: 'La session sera annulée sans toucher au stock. Les quantités saisies seront perdues.',
      confirmLabel: 'Annuler la session',
    })
    if (ok) cancel.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Link href={ROUTES.STOCK_INVENTORY} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}>
          <ChevronLeft size={14} /> Inventaires
        </Link>
        <PageHeader
          title={session.reference}
          description={session.notes ?? 'Inventaire physique'}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{st.label}</span>
              {editable && (
                <>
                  <button onClick={handleSave} disabled={saveCounts.isPending || Object.keys(counts).length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: Object.keys(counts).length === 0 ? 0.5 : 1 }}>
                    {saveCounts.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Enregistrer
                  </button>
                  <button onClick={handleValidate} disabled={validate.isPending}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {validate.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Valider
                  </button>
                  <button onClick={handleCancel} disabled={cancel.isPending} title="Annuler la session"
                    style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                    <XCircle size={14} />
                  </button>
                </>
              )}
            </div>
          }
        />
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Produits" value={String(session.summary.total)} />
        <Kpi label="Comptés" value={`${countedNb} / ${session.summary.total}`} />
        <Kpi label="Écarts" value={String(liveGaps.length)} accent={liveGaps.length ? '#d97706' : undefined} />
        <Kpi label="Valeur des écarts" value={format(liveGapValue)} accent={liveGapValue < 0 ? '#dc2626' : liveGapValue > 0 ? '#16a34a' : undefined} />
      </div>

      {session.status === 'validated' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
          <ClipboardCheck size={15} /> Inventaire validé{session.validatedBy ? ` par ${session.validatedBy}` : ''}{session.validatedAt ? ` le ${formatDate(session.validatedAt)}` : ''}. Le stock a été recalé.
        </div>
      )}

      {/* Table de comptage */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" aria-label="Comptage d'inventaire">
            <thead>
              <tr>
                <th scope="col">Produit</th>
                <th scope="col" style={{ textAlign: 'right' }}>Théorique</th>
                <th scope="col" style={{ textAlign: 'right' }}>Compté</th>
                <th scope="col" style={{ textAlign: 'right' }}>Écart</th>
                <th scope="col" style={{ textAlign: 'right' }}>Valeur écart</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gapColor = r.gap == null ? 'var(--text-3)' : r.gap === 0 ? 'var(--text-3)' : r.gap < 0 ? '#dc2626' : '#16a34a'
                return (
                  <tr key={r.id}>
                    <td>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{r.productName}</p>
                      {r.productReference && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.productReference}</p>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      {r.theoreticalQty}{r.stockUnit && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 3 }}>{r.stockUnit}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editable ? (
                        <input
                          type="number" step="any" min={0}
                          value={counts[r.id] !== undefined ? counts[r.id] : (r.countedQty ?? '')}
                          onChange={e => setCounts(c => ({ ...c, [r.id]: e.target.value }))}
                          placeholder="—"
                          style={{ width: 90, padding: '6px 10px', textAlign: 'right', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
                        />
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: r.counted != null ? 'var(--text-1)' : 'var(--text-3)' }}>{r.counted ?? '—'}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: gapColor }}>
                      {r.gap == null ? '—' : `${r.gap > 0 ? '+' : ''}${r.gap}`}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: gapColor }}>
                      {r.gapValue == null ? '—' : format(r.gapValue)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
