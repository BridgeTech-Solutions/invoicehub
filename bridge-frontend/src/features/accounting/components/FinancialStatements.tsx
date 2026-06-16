'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Scale, FileSpreadsheet, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useBilan, useCompteResultat } from '../hooks'
import { accountingApi } from '../api'
import { useCurrency } from '@/hooks/useCurrency'
import type { BilanActifLine, BilanPassifLine, SIGLine } from '../types'

// ─── Bouton export PDF ─────────────────────────────────────────────────────────
function ExportPdfButton({ kind, periodId, year }: { kind: 'bilan' | 'compte-resultat'; periodId?: string; year?: number }) {
  const [loading, setLoading] = useState(false)
  async function onClick() {
    setLoading(true)
    try { await accountingApi.downloadStatementPdf(kind, { periodId, year }) }
    catch (e: unknown) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }
  return (
    <button onClick={onClick} disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
      <Download size={14} /> {loading ? 'Génération…' : 'Export PDF'}
    </button>
  )
}

// ─── Voyant de contrôle (icône + couleur + texte — jamais la couleur seule) ────
function ControlBadge({ ok, okText, koText }: { ok: boolean; okText: string; koText: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
      background: ok ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
      color: ok ? '#16a34a' : '#dc2626',
    }}>
      {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {ok ? okText : koText}
    </span>
  )
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 14, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', margin: '10px 0', width: `${60 + (i % 4) * 10}%` }} />
      ))}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
  fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const numCell: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)',
  fontSize: 12.5, whiteSpace: 'nowrap',
}

// ════════════════════════════════════════════════════════════════════════════
//  BILAN
// ════════════════════════════════════════════════════════════════════════════

export function BilanReport({ periodId, year }: { periodId?: string; year?: number }) {
  const { format } = useCurrency()
  const { data, isLoading } = useBilan({ periodId, year })

  if (isLoading) return <TableSkeleton rows={12} />
  if (!data) return null

  const actif  = data.actif.filter(l => Math.abs(l.brut) > 0.5 || Math.abs(l.net) > 0.5)
  const passif = data.passif.filter(l => Math.abs(l.net) > 0.5)
  const empty  = actif.length === 0 && passif.length === 0

  if (empty) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>
        <Scale size={36} style={{ margin: '0 auto 10px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Aucune donnée sur ce périmètre</p>
        <p style={{ fontSize: 13 }}>Le bilan se construit à partir des écritures validées.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Voyants de contrôle + export */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ControlBadge ok={data.equilibre} okText="Bilan équilibré" koText={`Déséquilibre : ${format(Math.abs(data.ecart))}`} />
          {Math.abs(data.comptesNonVentiles) > 0.5 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'rgba(217,119,6,0.1)', color: '#b45309' }}>
              <AlertTriangle size={14} /> Comptes non ventilés : {format(Math.abs(data.comptesNonVentiles))} à reclasser
            </span>
          )}
        </div>
        <ExportPdfButton kind="bilan" periodId={periodId} year={year} />
      </div>

      {/* Actif | Passif */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        {/* ACTIF */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', paddingBottom: 6, borderBottom: '2px solid var(--primary)' }}>Actif</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Poste</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Brut</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amort./Dépréc.</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {actif.map((l: BilanActifLine, i) => (
                  <tr key={l.code} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ padding: '6px 10px', fontSize: 12.5, color: 'var(--text-1)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', marginRight: 6 }}>{l.code}</span>{l.label}
                    </td>
                    <td style={{ ...numCell, color: l.brut > 0 ? 'var(--text-2)' : 'var(--text-3)' }}>{l.brut > 0 ? format(l.brut) : '—'}</td>
                    <td style={{ ...numCell, color: l.amortissements > 0 ? '#b45309' : 'var(--text-3)' }}>{l.amortissements > 0 ? format(l.amortissements) : '—'}</td>
                    <td style={{ ...numCell, fontWeight: 700, color: 'var(--text-1)' }}>{format(l.net)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#0c234012', borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={3} style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>TOTAL ACTIF</td>
                  <td style={{ ...numCell, fontSize: 13.5, fontWeight: 800, color: 'var(--primary)' }}>{format(data.totalActif)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* PASSIF */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', paddingBottom: 6, borderBottom: '2px solid #7c3aed' }}>Passif</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Poste</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {passif.map((l: BilanPassifLine, i) => {
                  const isResult = l.code === 'CH'
                  return (
                    <tr key={l.code} style={{ borderBottom: '1px solid var(--border)', background: isResult ? 'rgba(22,163,74,0.06)' : i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                      <td style={{ padding: '6px 10px', fontSize: 12.5, color: 'var(--text-1)', fontWeight: isResult ? 700 : 400 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', marginRight: 6 }}>{l.code}</span>{l.label}
                      </td>
                      <td style={{ ...numCell, fontWeight: 700, color: isResult ? (l.net >= 0 ? '#16a34a' : '#dc2626') : 'var(--text-1)' }}>{format(l.net)}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#0c234012', borderTop: '2px solid var(--border-strong)' }}>
                  <td style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>TOTAL PASSIF</td>
                  <td style={{ ...numCell, fontSize: 13.5, fontWeight: 800, color: '#7c3aed' }}>{format(data.totalPassif)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPTE DE RÉSULTAT
// ════════════════════════════════════════════════════════════════════════════

export function CompteResultatReport({ periodId, year }: { periodId?: string; year?: number }) {
  const { format } = useCurrency()
  const { data, isLoading } = useCompteResultat({ periodId, year })

  if (isLoading) return <TableSkeleton rows={10} />
  if (!data) return null

  const lines = data.lines.filter(l => l.kind === 'solde' || Math.abs(l.amount) > 0.5)
  const empty = lines.every(l => Math.abs(l.amount) < 0.5)

  if (empty) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>
        <FileSpreadsheet size={36} style={{ margin: '0 auto 10px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Aucune donnée sur ce périmètre</p>
        <p style={{ fontSize: 13 }}>Le compte de résultat se construit à partir des écritures validées.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <ControlBadge ok={data.coherent} okText="Cascade des SIG cohérente" koText="Incohérence SIG — un compte échappe au calcul" />
        <ExportPdfButton kind="compte-resultat" periodId={periodId} year={year} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {lines.map((l: SIGLine, i) => {
              const isSolde = l.kind === 'solde'
              const isFinal = l.code === 'XH'
              const color =
                isSolde ? 'var(--text-1)'
                : l.kind === 'produit' ? 'var(--acc-credit)'
                : 'var(--acc-debit)'
              return (
                <tr key={l.code}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: isFinal ? '#0c234012' : isSolde ? 'var(--surface-2)' : i % 2 === 1 ? 'rgba(0,0,0,0.01)' : 'transparent',
                    borderTop: isFinal ? '2px solid var(--border-strong)' : undefined,
                  }}>
                  <td style={{ padding: isSolde ? '9px 12px' : '6px 12px', fontSize: isSolde ? 12.5 : 12.5, fontWeight: isSolde ? 800 : 400, color: isSolde ? 'var(--text-1)' : 'var(--text-2)', fontFamily: isSolde ? 'var(--font-display)' : 'var(--font-body)', letterSpacing: isSolde ? '0.02em' : 0 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', marginRight: 8 }}>{l.code}</span>
                    {l.label}
                  </td>
                  <td style={{
                    padding: isSolde ? '9px 12px' : '6px 12px', textAlign: 'right',
                    fontFamily: 'var(--font-mono)', fontSize: isFinal ? 14 : isSolde ? 13 : 12.5,
                    fontWeight: isSolde ? 800 : 600,
                    color: isFinal ? (l.amount >= 0 ? '#16a34a' : '#dc2626') : color, whiteSpace: 'nowrap',
                  }}>
                    {l.kind === 'charge' && l.amount > 0 ? '(' : ''}{format(Math.abs(l.amount))}{l.kind === 'charge' && l.amount > 0 ? ')' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10, padding: '0 4px' }}>
        Les charges sont présentées entre parenthèses. Soldes intermédiaires de gestion en gras.
      </p>
    </div>
  )
}
