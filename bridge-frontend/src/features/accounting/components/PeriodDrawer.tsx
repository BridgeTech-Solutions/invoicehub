'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Calendar, AlertTriangle } from 'lucide-react'
import { useCreateFiscalYear } from '../hooks'
import { toast } from 'sonner'

interface Props {
  open:    boolean
  onClose: () => void
}

export function PeriodDrawer({ open, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [year, setYear]       = useState(new Date().getFullYear())

  const create = useCreateFiscalYear()

  useEffect(() => {
    if (open) {
      setVisible(true)
      setYear(new Date().getFullYear())
    }
  }, [open])

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
    try {
      await create.mutateAsync({
        year,
        startDate: `${year}-01-01`,
        endDate:   `${year}-12-31`,
      })
      toast.success(`Exercice ${year} créé`)
      handleClose()
    } catch (err: unknown) { toast.error((err as Error).message ?? 'Erreur') }
  }

  if (!open && !visible) return null

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: 440, background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#2D7DD2 0%,#16a34a 100%)' }} />
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={16} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              Nouvel exercice fiscal
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>SYSCOHADA — exercice annuel 01/01 → 31/12</p>
          </div>
          <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>
              Année de l'exercice <span style={{ color: 'var(--s-overdue)' }}>*</span>
            </label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2000} max={2099} required
              style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)', outline: 'none' }} />
          </div>

          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Début de période :</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>01/01/{year}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Fin de période :</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>31/12/{year}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Périodes générées :</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>12 mois</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(217,119,6,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(217,119,6,0.2)' }}>
            <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12.5, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
              La création d'un exercice génère automatiquement 12 périodes mensuelles. L'exercice sera en statut <strong>ouvert</strong> jusqu'à sa clôture manuelle.
            </p>
          </div>
        </form>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={{ height: 38, padding: '0 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-strong)', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSubmit} disabled={create.isPending}
            style={{ height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', opacity: create.isPending ? 0.6 : 1 }}>
            {create.isPending ? 'Création…' : `Créer l'exercice ${year}`}
          </button>
        </div>
      </div>
    </>
  )
}
