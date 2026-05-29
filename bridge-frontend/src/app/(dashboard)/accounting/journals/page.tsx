'use client'

import { useState } from 'react'
import { Plus, BookOpen, Pencil, Trash2, PowerOff, Power } from 'lucide-react'
import { useJournals, useToggleJournal, useDeleteJournal } from '@/features/accounting/hooks'
import { JournalDrawer } from '@/features/accounting/components/JournalDrawer'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { AccountingJournal, JournalType } from '@/features/accounting/types'

const JOURNAL_CFG: Record<JournalType, { label: string; color: string; bg: string; desc: string }> = {
  purchases:  { label: 'Achats',          color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', desc: 'Factures fournisseurs et bons de commande' },
  sales:      { label: 'Ventes',          color: '#16a34a', bg: 'rgba(22,163,74,0.1)',  desc: 'Factures clients et avoirs' },
  bank:       { label: 'Banque',          color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)', desc: 'Opérations bancaires et virements' },
  cash:       { label: 'Caisse',          color: '#d97706', bg: 'rgba(217,119,6,0.1)',  desc: 'Encaissements et décaissements espèces' },
  operations: { label: 'Op. Diverses',    color: '#0891b2', bg: 'rgba(8,145,178,0.1)',  desc: 'Opérations de régularisation et OD' },
  misc:       { label: 'Divers',          color: '#64748b', bg: 'rgba(100,116,139,0.1)', desc: 'Écritures diverses et reclassements' },
  opening:    { label: 'À-nouveaux',      color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', desc: "Reprise des soldes d'ouverture d'exercice" },
  closing:    { label: 'Clôture',         color: '#475569', bg: 'rgba(71,85,105,0.1)',  desc: "Écritures de clôture d'exercice" },
}

function JournalCard({ journal, onEdit }: { journal: AccountingJournal; onEdit: () => void }) {
  const cfg      = JOURNAL_CFG[journal.type]
  const toggle   = useToggleJournal()
  const remove   = useDeleteJournal()
  const { can }  = usePermission()

  async function handleToggle() {
    try {
      await toggle.mutateAsync({ id: journal.id, isActive: !journal.isActive })
      toast.success(`Journal ${journal.isActive ? 'désactivé' : 'activé'}`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer le journal ${journal.code} — ${journal.name} ?`)) return
    try {
      await remove.mutateAsync(journal.id)
      toast.success('Journal supprimé')
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, opacity: journal.isActive ? 1 : 0.65, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={18} style={{ color: cfg.color }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: cfg.color, letterSpacing: '0.08em' }}>{journal.code}</span>
              {!journal.isActive && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--s-cancelled-bg)', color: 'var(--s-cancelled)' }}>INACTIF</span>
              )}
            </div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0, fontFamily: 'var(--font-display)' }}>{journal.name}</p>
          </div>
        </div>
        <ActionMenu items={[
          ...(can('accounting', 'update') ? [{ label: 'Modifier', icon: Pencil, onClick: onEdit }] : []),
          ...(can('accounting', 'update') ? [{ label: journal.isActive ? 'Désactiver' : 'Activer', icon: journal.isActive ? PowerOff : Power, onClick: handleToggle }] : []),
          ...(can('accounting', 'delete') ? [{ label: 'Supprimer', icon: Trash2, onClick: handleDelete, danger: true }] : []),
        ]} />
      </div>

      <div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '8px 0 0' }}>{cfg.desc}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Écritures enregistrées</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
          {journal.entriesCount.toLocaleString('fr-FR')}
        </span>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 14, width: 60, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
          <div style={{ height: 12, width: '70%', borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        </div>
      </div>
      <div style={{ height: 12, width: '80%', borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
    </div>
  )
}

export default function JournalsPage() {
  const { can } = usePermission()
  const { data: journals = [], isLoading } = useJournals()
  const [drawerOpen, setDrawerOpen]        = useState(false)
  const [editing, setEditing]              = useState<AccountingJournal | null>(null)

  function openCreate() { setEditing(null); setDrawerOpen(true) }
  function openEdit(j: AccountingJournal) { setEditing(j); setDrawerOpen(true) }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Journaux comptables</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{journals.length} journal{journals.length > 1 ? 'aux' : ''}</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <button onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', border: 'none', cursor: 'pointer' }}>
            <Plus size={15} /> Créer un journal
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : journals.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: '48px', textAlign: 'center' }}>
              <BookOpen size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Aucun journal comptable</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Les journaux OHADA (AC, VE, BQ, CA, OD, AN) doivent être créés en premier</p>
              <button onClick={openCreate}
                style={{ height: 38, padding: '0 20px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
                Créer le premier journal
              </button>
            </div>
          )
          : journals.map(j => (
            <JournalCard key={j.id} journal={j} onEdit={() => openEdit(j)} />
          ))
        }
      </div>

      <JournalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} editing={editing} />
    </div>
  )
}
