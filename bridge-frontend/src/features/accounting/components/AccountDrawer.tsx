'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, BookOpen, Info } from 'lucide-react'
import { useCreateAccount, useUpdateAccount } from '../hooks'
import { toast } from 'sonner'
import type { AccountListItem, AccountNature } from '../types'

interface Props {
  open:      boolean
  onClose:   () => void
  editing?:  AccountListItem | null
  parentId?: string | null
}

// Nature auto-suggérée selon la classe SYSCOHADA
function suggestNature(number: string): AccountNature {
  const d = number.trim().charAt(0)
  return d === '7' ? 'credit_normal' : 'debit_normal'
}

// Libellé de classe SYSCOHADA
const CLASS_LABEL: Record<string, string> = {
  '1': 'Classe 1 — Ressources durables',
  '2': 'Classe 2 — Actif immobilisé',
  '3': 'Classe 3 — Actif circulant (stocks)',
  '4': 'Classe 4 — Tiers',
  '5': 'Classe 5 — Trésorerie',
  '6': 'Classe 6 — Charges',
  '7': 'Classe 7 — Produits',
  '8': 'Classe 8 — Autres charges et produits',
}

export function AccountDrawer({ open, onClose, editing, parentId }: Props) {
  const [visible, setVisible]  = useState(false)
  const [number, setNumber]    = useState('')
  const [name, setName]        = useState('')
  const [shortName, setShortName]  = useState('')
  const [nature, setNature]        = useState<AccountNature>('debit_normal')
  const [isDetail, setIsDetail]    = useState(true)
  const [allowsRec, setAllowsRec]  = useState(false)
  const [description, setDescription] = useState('')
  const [notes, setNotes]          = useState('')

  const create = useCreateAccount()
  const update = useUpdateAccount()

  const classDigit   = number.trim().charAt(0)
  const classLabel   = CLASS_LABEL[classDigit] ?? ''

  // Suggestion de nature quand le numéro change (mode création seulement)
  useEffect(() => {
    if (!editing && number.length >= 1) {
      setNature(suggestNature(number))
      // Les comptes 401, 411 : suggérer réconciliation automatiquement
      const n = number.trim()
      setAllowsRec(n.startsWith('401') || n.startsWith('411') || n.startsWith('512') || n.startsWith('521'))
    }
  }, [number, editing])

  useEffect(() => {
    if (open) {
      setVisible(true)
      if (editing) {
        setNumber(editing.number)
        setName(editing.name)
        setShortName(editing.shortName ?? '')
        setNature(editing.accountNature)
        setIsDetail(editing.isDetailAccount)
        setAllowsRec(editing.allowsReconciliation)
        setDescription('')
        setNotes('')
      } else {
        setNumber(''); setName(''); setShortName(''); setNature('debit_normal')
        setIsDetail(true); setAllowsRec(false); setDescription(''); setNotes('')
      }
    }
  }, [open, editing])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!number.trim()) { toast.error('Le numéro de compte est obligatoire'); return }
    if (!name.trim())   { toast.error("L'intitulé est obligatoire"); return }
    if (!classDigit || !CLASS_LABEL[classDigit]) {
      toast.error('Numéro invalide — le 1er chiffre doit être entre 1 et 8'); return
    }

    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.number,
          data: {
            name:                 name.trim(),
            shortName:            shortName.trim() || undefined,
            accountNature:        nature,
            isDetailAccount:      isDetail,
            allowsReconciliation: allowsRec,
            description:          description.trim() || undefined,
            notes:                notes.trim() || undefined,
          },
        })
        toast.success('Compte mis à jour')
      } else {
        await create.mutateAsync({
          accountNumber:        number.trim(),
          name:                 name.trim(),
          shortName:            shortName.trim() || undefined,
          parentAccountNumber:  parentId ?? undefined,
          accountNature:        nature,
          isDetailAccount:      isDetail,
          allowsReconciliation: allowsRec,
          description:          description.trim() || undefined,
          notes:                notes.trim() || undefined,
        })
        toast.success('Compte créé')
      }
      handleClose()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erreur')
    }
  }

  if (!open && !visible) return null
  const isPending = create.isPending || update.isPending

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: 520, background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#2D7DD2 0%,#0891b2 50%,#22d3ee 100%)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={16} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {editing ? 'Modifier le compte' : 'Nouveau compte OHADA'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Plan comptable SYSCOHADA révisé</p>
          </div>
          <button onClick={handleClose} aria-label="Fermer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form id="account-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Numéro + Intitulé */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={sectionTitle}>Identification</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Numéro <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input
                  value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, ''))}
                  required placeholder="ex : 4011"
                  disabled={!!editing}
                  style={{ ...inp, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em', fontSize: 15, opacity: editing ? 0.6 : 1 }}
                />
                {classLabel && (
                  <p style={{ marginTop: 4, fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>{classLabel}</p>
                )}
              </div>
              <div>
                <label style={lbl}>Intitulé long <span style={{ color: 'var(--s-overdue)' }}>*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  placeholder="ex : Fournisseurs, dettes en compte" style={inp} />
              </div>
            </div>

            <div>
              <label style={lbl}>Intitulé court <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optionnel)</span></label>
              <input value={shortName} onChange={e => setShortName(e.target.value)} maxLength={100}
                placeholder="ex : Fournisseurs" style={inp} />
              <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>Affiché dans les listes et les rapports abrégés.</p>
            </div>
          </section>

          {/* Nature comptable */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={sectionTitle}>Nature comptable</h3>

            <div>
              <label style={lbl}>Sens normal du solde</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  { value: 'debit_normal',  label: 'Débit normal', sub: 'Actif, Charges (cl. 6)', color: 'var(--acc-debit)' },
                  { value: 'credit_normal', label: 'Crédit normal', sub: 'Passif, Produits (cl. 7)', color: 'var(--acc-credit)' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button" onClick={() => setNature(opt.value)}
                    style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${nature === opt.value ? opt.color : 'var(--border)'}`, background: nature === opt.value ? `${opt.color}12` : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: nature === opt.value ? opt.color : 'var(--text-1)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* Compte détail / regroupement */}
              <button type="button" onClick={() => setIsDetail(v => !v)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${isDetail ? 'var(--primary)' : 'var(--border)'}`, background: isDetail ? 'rgba(45,125,210,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isDetail ? 'var(--primary)' : 'var(--border)'}`, background: isDetail ? 'var(--primary)' : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isDetail && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Compte de détail</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Saisie d'écritures autorisée</div>
                </div>
              </button>

              {/* Lettrage / réconciliation */}
              <button type="button" onClick={() => setAllowsRec(v => !v)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${allowsRec ? '#7c3aed' : 'var(--border)'}`, background: allowsRec ? 'rgba(124,58,237,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${allowsRec ? '#7c3aed' : 'var(--border)'}`, background: allowsRec ? '#7c3aed' : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {allowsRec && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Lettrage actif</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Réconciliation débit/crédit</div>
                </div>
              </button>
            </div>

            {/* Hint */}
            {(number.startsWith('401') || number.startsWith('411')) && (
              <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(124,58,237,0.06)', borderRadius: 8, border: '1px solid rgba(124,58,237,0.15)' }}>
                <Info size={13} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11.5, color: '#7c3aed', margin: 0, lineHeight: 1.5 }}>
                  Les comptes {number.startsWith('401') ? '401 (Fournisseurs)' : '411 (Clients)'} nécessitent généralement le lettrage activé pour la réconciliation.
                </p>
              </div>
            )}
          </section>

          {/* Description + Notes */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={sectionTitle}>Informations complémentaires</h3>

            <div>
              <label style={lbl}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Description du rôle de ce compte dans le plan OHADA…"
                style={{ ...inp, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <div>
              <label style={lbl}>Notes internes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Commentaires comptables, consignes d'utilisation…"
                style={{ ...inp, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.5, background: 'rgba(245,158,11,0.03)', borderColor: notes ? 'rgba(245,158,11,0.5)' : undefined }} />
            </div>
          </section>
        </form>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={btnSec}>Annuler</button>
          <button
            form="account-form" type="submit" onClick={handleSubmit}
            disabled={isPending || !number.trim() || !name.trim()}
            style={{ ...btnPri, opacity: isPending || !number.trim() || !name.trim() ? 0.6 : 1 }}>
            {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-3)', fontFamily: 'var(--font-display)', margin: 0,
  paddingBottom: 6, borderBottom: '1px solid var(--border)',
}
const lbl: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500,
  color: 'var(--text-2)', fontFamily: 'var(--font-display)',
}
const inp: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)', background: 'var(--surface)',
  fontSize: 13.5, color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
}
const btnSec: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)', background: 'transparent',
  fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
}
const btnPri: React.CSSProperties = {
  height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)',
  border: 'none', background: 'var(--primary)',
  fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer',
  fontFamily: 'var(--font-display)', transition: 'opacity 0.15s',
}
