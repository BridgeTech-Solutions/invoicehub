'use client'

import { useState, useMemo } from 'react'
import { Sliders, Pencil, RotateCcw, Info } from 'lucide-react'
import { useStatementRubriques, useResetRubriques } from '@/features/accounting/hooks'
import { RubriqueDrawer } from '@/features/accounting/components/RubriqueDrawer'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { StatementRubrique, RubriqueSource } from '@/features/accounting/types'

const MODE_TAG: Record<RubriqueSource['mode'], string> = {
  debitRaw: '', creditRaw: '', debitSign: ' débiteurs', creditSign: ' créditeurs',
}

function summarizeSource(s: RubriqueSource): string {
  const minus = s.column === 'amort' ? '− ' : ''
  const ex = s.exclude?.length ? ` (hors ${s.exclude.join(', ')})` : ''
  return `${minus}${s.prefixes.join('+')}${MODE_TAG[s.mode]}${ex}`
}

function RubriqueRow({ r, onEdit, canEdit }: { r: StatementRubrique; onEdit: () => void; canEdit: boolean }) {
  const summary = r.isResult
    ? 'Calculé (résultat du compte de résultat)'
    : r.sources.length === 0 ? '—' : r.sources.map(summarizeSource).join('  ·  ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', width: 30, flexShrink: 0 }}>{r.code}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</div>
      </div>
      {canEdit && (
        <button onClick={onEdit} aria-label={`Éditer le poste ${r.code}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 7, border: '1.5px solid var(--border-strong)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          <Pencil size={12} /> Éditer
        </button>
      )}
    </div>
  )
}

export default function StatementConfigPage() {
  const { can } = usePermission()
  const { data: rubriques = [], isLoading } = useStatementRubriques()
  const reset = useResetRubriques()
  const [editing, setEditing] = useState<StatementRubrique | null>(null)
  const canEdit = can('accounting', 'update')

  // Regroupe par côté puis par masse, en conservant l'ordre du backend.
  const grouped = useMemo(() => {
    const sides: { side: 'actif' | 'passif'; label: string; masses: { code: string; label: string; rows: StatementRubrique[] }[] }[] = [
      { side: 'actif', label: 'Actif', masses: [] },
      { side: 'passif', label: 'Passif', masses: [] },
    ]
    for (const r of rubriques) {
      const side = sides.find(s => s.side === r.side)!
      let masse = side.masses.find(m => m.code === r.masseCode)
      if (!masse) { masse = { code: r.masseCode, label: r.masseLabel, rows: [] }; side.masses.push(masse) }
      masse.rows.push(r)
    }
    return sides
  }, [rubriques])

  async function handleReset() {
    if (!confirm('Réinitialiser tout le modèle du bilan au standard SYSCOHADA ? Toutes vos personnalisations seront perdues.')) return
    try {
      await reset.mutateAsync()
      toast.success('Modèle réinitialisé au standard SYSCOHADA')
    } catch (e: unknown) { toast.error((e as Error).message ?? 'Erreur') }
  }

  if (!can('accounting', 'update')) return <AccessDenied message="Le paramétrage des états financiers requiert les droits comptables." />

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sliders size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Paramétrage du bilan</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Comptes rattachés à chaque poste — modèle SYSCOHADA éditable</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={handleReset} disabled={reset.isPending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)', border: '1.5px solid var(--border-strong)', cursor: 'pointer', opacity: reset.isPending ? 0.6 : 1 }}>
            <RotateCcw size={14} /> Réinitialiser
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(45,125,210,0.05)', borderRadius: 10, border: '1px solid rgba(45,125,210,0.12)', marginBottom: 20 }}>
        <Info size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
          Chaque poste du bilan agrège un ou plusieurs groupes de comptes (par préfixe) selon une règle de signe.
          Modifier un poste recalcule immédiatement le bilan et le détail des comptes. Pensez à vérifier l'équilibre après vos changements.
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 46, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20, alignItems: 'start' }}>
          {grouped.map(side => (
            <div key={side.side}>
              <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', paddingBottom: 6, borderBottom: `2px solid ${side.side === 'actif' ? 'var(--primary)' : '#7c3aed'}` }}>{side.label}</h2>
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                {side.masses.map(masse => (
                  <div key={masse.code}>
                    <div style={{ padding: '7px 12px', background: '#0f2d4a', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{masse.code}</span>{masse.label}
                    </div>
                    {masse.rows.map(r => (
                      <RubriqueRow key={r.code} r={r} canEdit={canEdit} onEdit={() => setEditing(r)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RubriqueDrawer open={!!editing} onClose={() => setEditing(null)} rubrique={editing} />
    </div>
  )
}
