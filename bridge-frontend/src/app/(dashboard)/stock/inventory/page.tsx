'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Plus, X, Loader2, ChevronRight } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { OverlayPortal } from '@/components/ui/OverlayPortal'
import { useInventorySessions, useCreateInventory } from '@/features/stock/hooks'
import { useProductCategories } from '@/features/products/hooks'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import type { InventoryStatus } from '@/features/stock/types'

const STATUS: Record<InventoryStatus, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Brouillon',  color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'En cours',   color: '#d97706', bg: '#fffbeb' },
  validated:   { label: 'Validé',     color: '#16a34a', bg: '#f0fdf4' },
  cancelled:   { label: 'Annulé',     color: '#94a3b8', bg: '#f8fafc' },
}

function NewInventoryModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { data: cats } = useProductCategories()
  const create = useCreateInventory()
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')

  function submit() {
    create.mutate(
      { categoryId: categoryId || undefined, notes: notes.trim() || undefined },
      { onSuccess: (r) => { onClose(); router.push(`${ROUTES.STOCK_INVENTORY}/${r.id}`) } },
    )
  }

  return (
    <OverlayPortal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
        <div className="card" style={{ width: 460, maxWidth: '100%', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Nouvel inventaire</h3>
            <button onClick={onClose} aria-label="Fermer" style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}><X size={15} /></button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            Le stock théorique de chaque produit suivi sera figé maintenant. Vous saisirez ensuite les quantités réellement comptées.
          </p>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Portée</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, cursor: 'pointer' }}>
              <option value="">Tous les produits suivis</option>
              {(cats ?? []).map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Note (facultatif)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex. Inventaire annuel 2026"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Annuler</button>
            <button onClick={submit} disabled={create.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Créer et compter
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}

export default function InventoryListPage() {
  const { can } = usePermission()
  const { data: sessions, isLoading } = useInventorySessions()
  const [showNew, setShowNew] = useState(false)

  if (!can('stock', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de gestion des stocks." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showNew && <NewInventoryModal onClose={() => setShowNew(false)} />}

      <PageHeader
        title="Inventaires"
        description="Comptage physique et recalage du stock"
        actions={can('stock', 'adjust') ? (
          <button onClick={() => setShowNew(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            <Plus size={14} /> Nouvel inventaire
          </button>
        ) : undefined}
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {isLoading ? (
          <div aria-hidden>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                {[120, 90, 60, 100].map((w, j) => <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />)}
              </div>
            ))}
          </div>
        ) : (sessions ?? []).length === 0 ? (
          <RichEmptyState
            icon={ClipboardList}
            title="Aucun inventaire"
            description="Lancez un inventaire pour compter physiquement le stock et corriger les écarts."
            compact
          />
        ) : (
          <table className="data-table" aria-label="Sessions d'inventaire">
            <thead>
              <tr>
                <th scope="col">Référence</th>
                <th scope="col">Statut</th>
                <th scope="col">Produits</th>
                <th scope="col">Date</th>
                <th scope="col" style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => {
                const st = STATUS[s.status]
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`${ROUTES.STOCK_INVENTORY}/${s.id}`} style={{ textDecoration: 'none' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{s.reference}</span>
                      </Link>
                      {s.notes && <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{s.notes}</p>}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{st.label}</span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.lineCount}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                      {s.status === 'validated' && s.validatedAt ? `Validé ${formatDate(s.validatedAt)}` : formatDate(s.createdAt)}
                    </td>
                    <td>
                      <Link href={`${ROUTES.STOCK_INVENTORY}/${s.id}`} aria-label="Ouvrir" style={{ color: 'var(--text-3)', display: 'inline-flex' }}><ChevronRight size={16} /></Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
