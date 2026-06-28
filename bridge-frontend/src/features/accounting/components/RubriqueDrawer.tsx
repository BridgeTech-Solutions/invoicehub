'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Sliders, Plus, Trash2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateRubrique } from '../hooks'
import type { StatementRubrique, RubriqueMode, RubriqueSource } from '../types'

interface Props {
  open:     boolean
  onClose:  () => void
  rubrique: StatementRubrique | null
}

// Une source en cours d'édition : préfixes/exclude saisis en texte (séparés par virgule).
interface DraftSource { column: 'brut' | 'amort'; mode: RubriqueMode; prefixes: string; exclude: string }

const MODE_OPTS: { value: RubriqueMode; label: string; hint: string }[] = [
  { value: 'debitRaw',   label: 'Débit (brut)',          hint: 'Somme des soldes — comptes naturellement débiteurs (immobilisations, stocks).' },
  { value: 'creditRaw',  label: 'Crédit',                hint: 'Somme des soldes créditeurs — capitaux, dettes, amortissements/dépréciations.' },
  { value: 'debitSign',  label: 'Débiteurs seulement',   hint: 'Comptes bifonctionnels : ne retient que les soldes débiteurs (→ Actif).' },
  { value: 'creditSign', label: 'Créditeurs seulement',  hint: 'Comptes bifonctionnels : ne retient que les soldes créditeurs (→ Passif).' },
]

const toDraft = (s: RubriqueSource): DraftSource => ({
  column: s.column, mode: s.mode,
  prefixes: s.prefixes.join(', '),
  exclude: (s.exclude ?? []).join(', '),
})
const splitList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

export function RubriqueDrawer({ open, onClose, rubrique }: Props) {
  const [visible, setVisible] = useState(false)
  const [label, setLabel]     = useState('')
  const [sources, setSources] = useState<DraftSource[]>([])
  const update = useUpdateRubrique()

  const isResult = rubrique?.isResult ?? false
  const isActif  = rubrique?.side === 'actif'

  useEffect(() => {
    if (open && rubrique) {
      setVisible(true)
      setLabel(rubrique.label)
      setSources(rubrique.sources.map(toDraft))
    }
  }, [open, rubrique])

  const handleClose = useCallback(() => { setVisible(false); setTimeout(onClose, 280) }, [onClose])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, handleClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function setSource(i: number, patch: Partial<DraftSource>) {
    setSources(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function addSource() {
    setSources(prev => [...prev, { column: 'brut', mode: isActif ? 'debitRaw' : 'creditRaw', prefixes: '', exclude: '' }])
  }
  function removeSource(i: number) {
    setSources(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rubrique) return
    if (!label.trim()) { toast.error('Le libellé est obligatoire'); return }

    const payload: { label?: string; sources?: RubriqueSource[] } = { label: label.trim() }
    if (!isResult) {
      const built: RubriqueSource[] = []
      for (const s of sources) {
        const prefixes = splitList(s.prefixes)
        if (prefixes.length === 0) { toast.error('Chaque source doit avoir au moins un compte/préfixe'); return }
        const exclude = splitList(s.exclude)
        built.push({ column: isActif ? s.column : 'brut', mode: s.mode, prefixes, ...(exclude.length ? { exclude } : {}) })
      }
      payload.sources = built
    }

    try {
      await update.mutateAsync({ code: rubrique.code, data: payload })
      toast.success(`Poste ${rubrique.code} mis à jour`)
      handleClose()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erreur lors de la mise à jour')
    }
  }

  if (!open && !visible) return null

  return createPortal((
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: 560, maxWidth: '100vw', background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#2D7DD2 0%,#0891b2 50%,#22d3ee 100%)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sliders size={16} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Poste <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{rubrique?.code}</span> — {rubrique?.side === 'actif' ? 'Actif' : 'Passif'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{rubrique?.masseLabel}</p>
          </div>
          <button onClick={handleClose} aria-label="Fermer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form id="rubrique-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={lbl}>Libellé du poste <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
            <input value={label} onChange={e => setLabel(e.target.value)} required maxLength={255} style={inp} />
          </div>

          {isResult ? (
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(22,163,74,0.06)', borderRadius: 8, border: '1px solid rgba(22,163,74,0.18)' }}>
              <Info size={15} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: '#15803d', margin: 0, lineHeight: 1.55 }}>
                Le <strong>résultat net</strong> est calculé automatiquement depuis le compte de résultat (classes 6 &amp; 7). Ses comptes ne se paramètrent pas ici — seul le libellé est modifiable.
              </p>
            </div>
          ) : (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={sectionTitle}>Comptes du poste</h3>
                <button type="button" onClick={addSource} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 7, border: '1.5px solid var(--primary)', background: 'rgba(45,125,210,0.08)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={13} /> Ajouter
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(45,125,210,0.05)', borderRadius: 8, border: '1px solid rgba(45,125,210,0.12)' }}>
                <Info size={13} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                  Chaque source agrège des comptes par <strong>préfixe</strong> (ex. <code>41</code> = tous les 41xx). La règle définit le sens retenu. Modifier ces sources recalcule le bilan.
                </p>
              </div>

              {sources.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>Aucune source — ce poste sera à zéro. Ajoutez-en une.</p>
              )}

              {sources.map((s, i) => {
                const modeInfo = MODE_OPTS.find(m => m.value === s.mode)
                return (
                  <div key={i} style={{ border: '1px solid var(--border-strong)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source {i + 1}</span>
                      <button type="button" onClick={() => removeSource(i)} aria-label="Supprimer la source" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--s-overdue)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isActif ? '1fr 1fr' : '1fr', gap: 8 }}>
                      {isActif && (
                        <div>
                          <label style={lblSm}>Colonne</label>
                          <select value={s.column} onChange={e => setSource(i, { column: e.target.value as 'brut' | 'amort' })} style={sel}>
                            <option value="brut">Valeur brute</option>
                            <option value="amort">Amort./Dépréciation</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label style={lblSm}>Règle de signe</label>
                        <select value={s.mode} onChange={e => setSource(i, { mode: e.target.value as RubriqueMode })} style={sel}>
                          {MODE_OPTS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {modeInfo && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '-2px 0 0', lineHeight: 1.45 }}>{modeInfo.hint}</p>}

                    <div>
                      <label style={lblSm}>Comptes / préfixes <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(séparés par des virgules)</span></label>
                      <input value={s.prefixes} onChange={e => setSource(i, { prefixes: e.target.value })} placeholder="ex : 41, 411" style={{ ...inp, fontFamily: 'var(--font-mono)', height: 34 }} />
                    </div>
                    <div>
                      <label style={lblSm}>Exclure <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optionnel)</span></label>
                      <input value={s.exclude} onChange={e => setSource(i, { exclude: e.target.value })} placeholder="ex : 478, 479" style={{ ...inp, fontFamily: 'var(--font-mono)', height: 34 }} />
                    </div>
                  </div>
                )
              })}
            </section>
          )}
        </form>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={btnSec}>Annuler</button>
          <button form="rubrique-form" type="submit" onClick={handleSubmit} disabled={update.isPending || !label.trim()}
            style={{ ...btnPri, opacity: update.isPending || !label.trim() ? 0.6 : 1 }}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  ), document.body)
}

const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', margin: 0 }
const lbl: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }
const lblSm: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 11.5, fontWeight: 500, color: 'var(--text-2)' }
const inp: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }
const sel: React.CSSProperties = { ...inp, height: 34, cursor: 'pointer' }
const btnSec: React.CSSProperties = { height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }
const btnPri: React.CSSProperties = { height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'opacity 0.15s' }
