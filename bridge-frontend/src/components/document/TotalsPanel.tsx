'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { FormLine, DiscountType, DocumentTotals } from '@/features/proformas/types'
import { computeDocumentTotals } from '@/lib/document-math'
import { formatXAF } from '@/lib/utils'

interface TotalsPanelProps {
  lines: FormLine[]
  globalDiscountType: DiscountType
  globalDiscountValue: number
  onGlobalDiscountTypeChange?: (t: DiscountType) => void
  onGlobalDiscountValueChange?: (v: number) => void
  readonly?: boolean
  invoiceType?: string
  acomptePercentage?: number
  totalAcomptesDeducted?: number
}

export function TotalsPanel({
  lines,
  globalDiscountType,
  globalDiscountValue,
  onGlobalDiscountTypeChange,
  onGlobalDiscountValueChange,
  readonly = false,
  invoiceType,
  acomptePercentage,
  totalAcomptesDeducted = 0,
}: TotalsPanelProps) {

  const totals = computeDocumentTotals(lines, globalDiscountType, globalDiscountValue)

  const isAcompte = invoiceType === 'acompte'
  const isSolde   = invoiceType === 'solde'
  const pct       = acomptePercentage ?? 30

  // Acompte breakdown
  const acompteHt  = isAcompte ? Math.round(totals.totalHt  * pct / 100) : 0
  const accomteTva = isAcompte ? Math.round(totals.totalTax * pct / 100) : 0
  const acompteTtc = acompteHt + accomteTva
  const acompteReste = Math.round(totals.totalTtc - acompteTtc)

  // Solde breakdown
  const soldeDu = Math.round(totals.totalTtc - totalAcomptesDeducted)

  const row = (label: string, value: string, bold = false, large = false, accent = false) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{
        fontSize: bold ? 13.5 : 13, fontWeight: bold ? 600 : 400,
        color: accent ? 'var(--primary)' : 'var(--text-2)',
        fontFamily: bold ? 'var(--font-display)' : 'var(--font-body)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: large ? 16 : bold ? 13.5 : 13,
        fontWeight: bold ? 700 : 500,
        color: accent ? 'var(--primary)' : 'var(--text-1)',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  )

  const hasDiscount = totals.globalDiscountAmount > 0

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      minWidth: 280,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
          Récapitulatif
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {lines.length} ligne{lines.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {/* Sous-total */}
        {row('Sous-total HT', formatXAF(totals.sumNetHt))}

        {/* Global discount row */}
        {!readonly ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
              Remise globale
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" min="0" step="0.1"
                value={globalDiscountType === 'none' ? '' : globalDiscountValue}
                disabled={globalDiscountType === 'none'}
                placeholder="0"
                onChange={(e) => onGlobalDiscountValueChange?.(parseFloat(e.target.value) || 0)}
                style={{
                  width: 72, padding: '5px 8px', textAlign: 'right',
                  borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)',
                  background: 'var(--bg)', fontSize: 12.5, color: 'var(--text-1)',
                  fontFamily: 'var(--font-mono)', outline: 'none',
                  opacity: globalDiscountType === 'none' ? 0.4 : 1,
                }}
              />
              <select
                value={globalDiscountType}
                onChange={(e) => {
                  onGlobalDiscountTypeChange?.(e.target.value as DiscountType)
                  if (e.target.value === 'none') onGlobalDiscountValueChange?.(0)
                }}
                style={{
                  padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border)', background: 'var(--bg)',
                  fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="none">—</option>
                <option value="percentage">%</option>
                <option value="fixed">XAF</option>
              </select>
            </div>
          </div>
        ) : (
          row('Remise globale', hasDiscount ? `— ${formatXAF(totals.globalDiscountAmount)}` : '0 XAF')
        )}

        {/* Separator */}
        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

        {/* Total HT */}
        {row('Total HT net', formatXAF(totals.totalHt), true)}

        {/* TVA */}
        {row(
          `TVA (${lines.length > 0 ? `${lines[0].taxRate}%` : '19.25%'})`,
          formatXAF(totals.totalTax),
        )}

        {/* Thick separator */}
        <div style={{ height: 2, background: 'var(--primary)', opacity: 0.2, margin: '10px 0' }} />

        {/* Total TTC */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={{ fontSize: isAcompte ? 13.5 : 15, fontWeight: 700, color: isAcompte ? 'var(--text-2)' : 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
            Total TTC{isAcompte && <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>(projet complet)</span>}
          </span>
          <span style={{ fontSize: isAcompte ? 14 : 20, fontWeight: isAcompte ? 600 : 800, color: isAcompte ? 'var(--text-2)' : 'var(--primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
            {formatXAF(totals.totalTtc)}
          </span>
        </div>

        {/* ── Acompte breakdown ── */}
        {isAcompte && (
          <>
            <div style={{ height: 1, background: 'rgba(124,58,237,0.2)', margin: '10px 0' }} />
            <div style={{
              background: 'rgba(124,58,237,0.04)',
              border: '1px solid rgba(124,58,237,0.15)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7c3aed' }}>
                Acompte {pct}%
              </p>
              {row('Acompte HT',      formatXAF(acompteHt))}
              {row('TVA sur acompte', formatXAF(accomteTva))}
              <div style={{ height: 1, background: 'rgba(124,58,237,0.15)', margin: '4px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-display)' }}>
                  Montant acompte TTC
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed', fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
                  {formatXAF(acompteTtc)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 2px', borderTop: '1px dashed rgba(124,58,237,0.2)', marginTop: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
                Solde restant TTC
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                {formatXAF(acompteReste)}
              </span>
            </div>
          </>
        )}

        {/* ── Solde breakdown ── */}
        {isSolde && totalAcomptesDeducted > 0 && (
          <>
            <div style={{ height: 1, background: 'rgba(8,145,178,0.2)', margin: '10px 0' }} />
            <div style={{
              background: 'rgba(8,145,178,0.04)',
              border: '1px solid rgba(8,145,178,0.15)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 10.5, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0891b2' }}>
                Déduction acompte(s)
              </p>
              {row('Total projet TTC', formatXAF(Math.round(totals.totalTtc)))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 13, color: '#0891b2', fontFamily: 'var(--font-body)' }}>Acomptes versés</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0891b2', fontFamily: 'var(--font-mono)' }}>
                  − {formatXAF(Math.round(totalAcomptesDeducted))}
                </span>
              </div>
              <div style={{ height: 1, background: 'rgba(8,145,178,0.15)', margin: '4px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0891b2', fontFamily: 'var(--font-display)' }}>
                  Solde dû TTC
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0891b2', fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
                  {formatXAF(soldeDu)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
