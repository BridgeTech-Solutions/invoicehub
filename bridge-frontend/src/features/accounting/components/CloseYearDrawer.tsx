'use client'

import { OverlayPortal } from '@/components/ui/OverlayPortal'
import { useState, useEffect, useCallback } from 'react'
import { X, Lock, CheckCircle2, XCircle, AlertTriangle, ArrowRight, FileText } from 'lucide-react'
import { useYearClosePreview, useCloseYear } from '../hooks'
import { toast } from 'sonner'
import type { YearCloseResult } from '../types'

interface Props {
  year:    number | null
  onClose: () => void
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} XAF`

function ControlRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 0' }}>
      {ok
        ? <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
        : <XCircle size={16} style={{ color: 'var(--s-overdue, #dc2626)', flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{label}</div>
        {!ok && hint && <div style={{ fontSize: 12, color: 'var(--s-overdue, #dc2626)', marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  )
}

export function CloseYearDrawer({ year, onClose }: Props) {
  const open = year !== null
  const [visible, setVisible] = useState(false)
  const [result, setResult]   = useState<YearCloseResult | null>(null)

  const preview = useYearClosePreview(year, open)
  const closeMut = useCloseYear()

  useEffect(() => { if (open) { setVisible(true); setResult(null) } }, [open])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !closeMut.isPending) handleClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, handleClose, closeMut.isPending])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleConfirm() {
    if (year === null) return
    try {
      const res = await closeMut.mutateAsync(year)
      setResult(res)
      toast.success(`Exercice ${year} clôturé`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'La clôture a échoué')
    }
  }

  if (!open && !visible) return null

  const p        = preview.data
  const isBenef  = (p?.resultat.sens ?? 'benefice') === 'benefice'
  const resColor = isBenef ? '#16a34a' : 'var(--s-overdue, #dc2626)'
  const canClose = !!p?.controls.canClose

  return (
    <OverlayPortal>
    <>
      <div onClick={() => !closeMut.isPending && handleClose()}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: 460, maxWidth: '100vw', background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#2D7DD2 0%,#0f2d4a 100%)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(15,45,74,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={16} style={{ color: '#0f2d4a' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {result ? `Exercice ${year} clôturé` : `Clôture de l'exercice ${year}`}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>SYSCOHADA — détermination du résultat & à-nouveaux</p>
          </div>
          <button onClick={handleClose} disabled={closeMut.isPending}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: closeMut.isPending ? 'default' : 'pointer', color: 'var(--text-3)', opacity: closeMut.isPending ? 0.5 : 1 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── ÉTAT SUCCÈS ── */}
          {result ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0 4px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 99, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={26} style={{ color: '#16a34a' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>L'exercice a été clôturé</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>Les écritures de {year} sont désormais verrouillées.</div>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '4px 14px' }}>
                <SummaryRow label={`Résultat ${result.resultat.sens === 'benefice' ? '(bénéfice)' : '(perte)'}`} value={fmt(result.resultat.resultat)} strong color={result.resultat.sens === 'benefice' ? '#16a34a' : 'var(--s-overdue, #dc2626)'} />
                {result.determinationEntry && <SummaryRow label="Écriture de résultat" value={result.determinationEntry} mono />}
                {result.aNouveauEntry && <SummaryRow label={`Report à-nouveau ${year! + 1}`} value={result.aNouveauEntry} mono />}
                {result.nextYearPeriodsCreated > 0 && <SummaryRow label={`Périodes ${year! + 1}`} value={`${result.nextYearPeriodsCreated} mois`} />}
                <SummaryRow label="Périodes verrouillées" value={String(result.lockedPeriods)} last />
              </div>
            </>
          ) : preview.isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Analyse de l'exercice…</div>
          ) : preview.isError || !p ? (
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <XCircle size={16} style={{ color: 'var(--s-overdue, #dc2626)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: 'var(--s-overdue, #dc2626)', margin: 0 }}>Impossible de charger l'aperçu de clôture.</p>
            </div>
          ) : (
            <>
              {/* HERO — Résultat de l'exercice */}
              <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface-2)', padding: '18px 20px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Résultat de l'exercice {year}</div>
                <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-mono)', color: resColor, lineHeight: 1.15, marginTop: 4 }}>
                  {isBenef ? '' : '−'}{Math.round(Math.abs(p.resultat.resultat)).toLocaleString('fr-FR')}
                  <span style={{ fontSize: 15, fontWeight: 600, marginLeft: 6, color: 'var(--text-3)' }}>XAF</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: resColor, marginTop: 2 }}>{isBenef ? 'Bénéfice' : 'Perte'}</div>
                <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Produits (classe 7)</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{fmt(p.resultat.produits)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Charges (classe 6)</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{fmt(p.resultat.charges)}</div>
                  </div>
                </div>
              </div>

              {/* Contrôles */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', marginBottom: 2 }}>Contrôles avant clôture</div>
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <ControlRow ok={p.controls.allPeriodsClosed} label="Toutes les périodes de l'exercice sont clôturées" hint="Clôturez d'abord chaque mois de l'exercice." />
                  <ControlRow ok={p.controls.noDraftEntries}   label="Aucune écriture en brouillon" hint={p.draftCount > 0 ? `${p.draftCount} écriture(s) à valider d'abord.` : undefined} />
                  <ControlRow ok={p.controls.balanced}         label="Balance équilibrée (débit = crédit)" hint="La balance générale n'est pas équilibrée." />
                </div>
              </div>

              {/* Ce qui sera enregistré */}
              {canClose && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>Ce qui sera enregistré</div>
                  <Step label={`Détermination du résultat → compte ${isBenef ? '1301 (bénéfice)' : '1302 (perte)'}`} />
                  <Step label={`Report à-nouveau du bilan sur l'exercice ${year! + 1}`} />
                  <Step label={`${p.carryForwardCount} compte(s) de bilan reporté(s)`} />
                  <Step label={`Verrouillage définitif des écritures de ${year}`} />
                </div>
              )}

              {/* Avertissement irréversibilité */}
              <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(217,119,6,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(217,119,6,0.2)' }}>
                <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12.5, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                  La clôture est <strong>définitive</strong>. Les écritures de l'exercice seront verrouillées ; toute correction ultérieure devra passer par une <strong>contre-passation</strong>.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {result ? (
            <button onClick={handleClose}
              style={{ height: 38, padding: '0 22px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
              Fermer
            </button>
          ) : (
            <>
              <button type="button" onClick={handleClose} disabled={closeMut.isPending}
                style={{ height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleConfirm} disabled={!canClose || closeMut.isPending}
                title={!canClose ? 'Les contrôles doivent tous être au vert.' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', border: 'none', background: canClose ? '#0f2d4a' : 'var(--border)', fontSize: 13.5, fontWeight: 600, color: canClose ? '#fff' : 'var(--text-3)', cursor: canClose && !closeMut.isPending ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', opacity: closeMut.isPending ? 0.7 : 1 }}>
                <Lock size={14} /> {closeMut.isPending ? 'Clôture…' : `Clôturer l'exercice ${year}`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
    </OverlayPortal>
  )
}

function Step({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
      <ArrowRight size={13} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
      <span>{label}</span>
    </div>
  )
}

function SummaryRow({ label, value, mono, strong, last, color }: { label: string; value: string; mono?: boolean; strong?: boolean; last?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {mono && <FileText size={12} style={{ color: 'var(--text-3)' }} />}{label}
      </span>
      <span style={{ fontSize: 13, fontWeight: strong ? 700 : 600, fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: color ?? 'var(--text-1)' }}>{value}</span>
    </div>
  )
}
