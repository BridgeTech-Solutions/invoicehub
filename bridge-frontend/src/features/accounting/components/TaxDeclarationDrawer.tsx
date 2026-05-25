'use client'

import { useState, useEffect } from 'react'
import { X, FileCheck, AlertCircle } from 'lucide-react'
import { useFiscalYears, useCreateTaxDeclaration } from '@/features/accounting/hooks'
import { toast } from 'sonner'
import type { FiscalPeriod } from '@/features/accounting/types'

interface Props {
  open:     boolean
  onClose:  () => void
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function TaxDeclarationDrawer({ open, onClose }: Props) {
  const [visible, setVisible]   = useState(false)
  const [yearId, setYearId]     = useState('')
  const [periodId, setPeriodId] = useState('')
  const [notes, setNotes]       = useState('')

  const { data: fiscalYears = [] } = useFiscalYears()
  const create = useCreateTaxDeclaration()

  const selectedYear  = fiscalYears.find(y => y.id === yearId)
  const openPeriods   = selectedYear?.periods.filter(p => p.status !== 'archived') ?? []

  useEffect(() => {
    if (open) { setTimeout(() => setVisible(true), 10) }
    else { setVisible(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    setYearId(''); setPeriodId(''); setNotes('')
  }, [open])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!periodId) { toast.error('Sélectionnez une période'); return }
    try {
      await create.mutateAsync({ periodId, notes: notes || undefined })
      toast.success('Déclaration TVA créée')
      handleClose()
    } catch (err: unknown) { toast.error((err as Error).message) }
  }

  if (!open && !visible) return null

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,35,0.45)',
          backdropFilter: 'blur(2px)', zIndex: 300,
          opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 600,
        background: 'var(--surface)', boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
        zIndex: 301, display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Gradient stripe */}
        <div style={{ height: 4, background: 'linear-gradient(90deg, #16a34a, #2D7DD2, #d97706)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={17} style={{ color: '#16a34a' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>Nouvelle déclaration TVA</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>TVA Cameroun · 19,25% (19% + 0,25% CAC)</p>
            </div>
          </div>
          <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <form id="tax-decl-form" onSubmit={handleSubmit}>

            {/* Info banner */}
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(45,125,210,0.06)', borderRadius: 8, border: '1px solid rgba(45,125,210,0.2)', marginBottom: 24 }}>
              <AlertCircle size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                Les montants TVA sont extraits automatiquement des comptes <strong>4455x</strong> (collectée) et <strong>4452x</strong> (déductible) pour la période sélectionnée.
              </p>
            </div>

            {/* Exercice */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Exercice fiscal <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={yearId}
                onChange={e => { setYearId(e.target.value); setPeriodId('') }}
                required
                style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}>
                <option value="">Sélectionner un exercice…</option>
                {fiscalYears.map(y => (
                  <option key={y.id} value={y.id}>{y.year} — {y.startDate.slice(0,10)} → {y.endDate.slice(0,10)}</option>
                ))}
              </select>
            </div>

            {/* Période */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Période de déclaration <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                required
                disabled={!yearId}
                style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: yearId ? 'var(--text-1)' : 'var(--text-3)', outline: 'none', cursor: yearId ? 'pointer' : 'not-allowed', opacity: yearId ? 1 : 0.6 }}>
                <option value="">{yearId ? 'Sélectionner un mois…' : 'Choisir d\'abord un exercice'}</option>
                {openPeriods.map((p: FiscalPeriod) => (
                  <option key={p.id} value={p.id}>
                    {MONTHS[p.month - 1]} {p.year} — {p.startDate.slice(0,10)} → {p.endDate.slice(0,10)}
                  </option>
                ))}
              </select>
            </div>

            {/* Taux info */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>Taux applicables (DGI Cameroun)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'TVA standard', rate: '19,25%', detail: '19% TVA + 0,25% CAC', color: '#2D7DD2' },
                  { label: 'Exonéré (TVA 0%)', rate: '0%', detail: 'Produits de première nécessité', color: '#94a3b8' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${item.color}30`, background: `${item.color}08` }}>
                    <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{item.rate}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{item.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-3)' }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Notes internes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}>(optionnel)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ajustements manuels, observations, références DGI…"
                rows={4}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
            </div>

            {/* Warning */}
            <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.06)', borderRadius: 8, border: '1px solid rgba(217,119,6,0.2)' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                <strong>Déclaration mensuelle</strong> si CA &gt; 50M XAF · <strong>Trimestrielle</strong> sinon (Art. 138 CGI Cameroun). Une fois déposée, la déclaration ne peut plus être modifiée.
              </p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleClose}
            style={{ height: 38, padding: '0 18px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'transparent', color: 'var(--text-1)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
            Annuler
          </button>
          <button
            type="submit"
            form="tax-decl-form"
            disabled={create.isPending || !periodId}
            style={{
              height: 38, padding: '0 20px', borderRadius: 8, border: 'none',
              background: !periodId ? '#94a3b8' : '#16a34a',
              color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: !periodId ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.15s',
            }}>
            <FileCheck size={15} />
            {create.isPending ? 'Création…' : 'Créer la déclaration'}
          </button>
        </div>
      </div>
    </>
  )
}
