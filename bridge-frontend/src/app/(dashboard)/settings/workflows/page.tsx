'use client'

import { useState } from 'react'
import { Plus, Settings2, Trash2, Edit2, Power } from 'lucide-react'
import { useApprovalWorkflows, useDeleteApprovalWorkflow, useUpdateApprovalWorkflow } from '@/features/approvals/hooks'
import { WorkflowDrawer } from '@/features/approvals/components/WorkflowDrawer'
import type { ApprovalWorkflow, CreateWorkflowPayload } from '@/features/approvals/types'
import { DOCUMENT_TYPE_LABELS, OPERATOR_LABELS } from '@/features/approvals/types'

// ─── WorkflowCard ─────────────────────────────────────────────────

function WorkflowCard({ wf, onEdit }: { wf: ApprovalWorkflow; onEdit: () => void }) {
  const deleteMut = useDeleteApprovalWorkflow()
  const updateMut = useUpdateApprovalWorkflow(wf.id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteMut.mutate(wf.id, { onSettled: () => setConfirmDelete(false) })
  }

  function handleToggle() {
    updateMut.mutate({ isActive: !wf.isActive } as Partial<CreateWorkflowPayload>)
  }

  // Group triggers by document type for a cleaner summary
  const docTypes = [...new Set(wf.triggers.map((t) => t.documentType))]
  const condSummary = wf.triggers.map((t) =>
    `${OPERATOR_LABELS[t.operator]} ${parseInt(t.value, 10)
      ? new Intl.NumberFormat('fr-FR').format(Number(t.value)) + ' XAF'
      : t.value}`,
  ).join(' & ')

  const borderColor = wf.isActive ? '#16a34a' : '#9ca3af'

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        borderLeft: `3px solid ${borderColor}`,
        opacity: wf.isActive ? 1 : 0.75,
        transition: 'opacity 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ padding: '16px 20px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: wf.isActive ? 'rgba(22,163,74,0.1)' : 'rgba(107,114,128,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings2 size={15} style={{ color: wf.isActive ? '#16a34a' : '#9ca3af' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
                {wf.name}
              </p>
              <span style={{
                fontSize: 10.5, padding: '2px 8px', borderRadius: 100, fontFamily: 'var(--font-display)', fontWeight: 600,
                background: wf.isActive ? 'rgba(22,163,74,0.1)' : 'rgba(107,114,128,0.1)',
                color: wf.isActive ? '#16a34a' : '#6b7280',
              }}>
                {wf.isActive ? 'Actif' : 'Inactif'}
              </span>
              {wf.priority > 0 && (
                <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
                  Priorité {wf.priority}
                </span>
              )}
            </div>
            {wf.description && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>{wf.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleToggle}
              disabled={updateMut.isPending}
              aria-label={wf.isActive ? 'Désactiver' : 'Activer'}
              title={wf.isActive ? 'Désactiver' : 'Activer'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8,
                border: '1.5px solid',
                borderColor: wf.isActive ? 'rgba(22,163,74,0.4)' : 'var(--border)',
                background: wf.isActive ? 'rgba(22,163,74,0.08)' : 'transparent',
                cursor: 'pointer', color: wf.isActive ? '#16a34a' : 'var(--text-3)',
                opacity: updateMut.isPending ? 0.5 : 1,
              }}
            >
              <Power size={12} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Modifier"
              title="Modifier"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'transparent',
                cursor: 'pointer', color: 'var(--text-3)',
              }}
            >
              <Edit2 size={12} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              aria-label={confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              title={confirmDelete ? 'Cliquer pour confirmer' : 'Supprimer'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8,
                border: confirmDelete ? '1.5px solid #ef4444' : '1.5px solid var(--border)',
                background: confirmDelete ? 'rgba(239,68,68,0.08)' : 'transparent',
                cursor: 'pointer', color: confirmDelete ? '#ef4444' : 'var(--text-3)',
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Trigger + Steps summary */}
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Document type pills */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', minWidth: 66, flexShrink: 0 }}>
              Déclenche
            </span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {docTypes.map((dt) => (
                <span key={dt} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 100, fontFamily: 'var(--font-display)', fontWeight: 600,
                  background: 'rgba(45,125,210,0.08)', color: 'var(--primary)',
                }}>
                  {DOCUMENT_TYPE_LABELS[dt]}
                </span>
              ))}
              {condSummary && (
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', alignSelf: 'center' }}>
                  {condSummary}
                </span>
              )}
            </div>
          </div>

          {/* Step pills */}
          {wf.steps.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', minWidth: 66, flexShrink: 0 }}>
                {wf.steps.length} étape{wf.steps.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {wf.steps.map((s, idx) => (
                  <span key={s.order} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 9px', borderRadius: 100,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 500,
                    }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', marginRight: 4 }}>{s.order}</span>
                      {s.name}
                    </span>
                    {idx < wf.steps.length - 1 && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {confirmDelete && (
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#ef4444', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>
            Cliquer à nouveau sur la corbeille pour confirmer la suppression.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card animate-pulse" style={{ padding: '16px 20px', borderLeft: '3px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, width: '52%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 11, width: '70%', background: 'var(--border)', borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ height: 10, width: 190, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
        <div style={{ height: 10, width: 140, background: 'var(--border)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<ApprovalWorkflow | undefined>()

  const { data: result, isLoading, isError } = useApprovalWorkflows()
  const workflows = result as unknown as ApprovalWorkflow[] | undefined ?? []

  const activeCount   = Array.isArray(workflows) ? workflows.filter((w) => w.isActive).length : 0
  const totalCount    = Array.isArray(workflows) ? workflows.length : 0

  function openCreate() { setEditing(undefined); setDrawerOpen(true) }
  function openEdit(wf: ApprovalWorkflow) { setEditing(wf); setDrawerOpen(true) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Workflows d&apos;approbation
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            {totalCount} workflow{totalCount !== 1 ? 's' : ''} configuré{totalCount !== 1 ? 's' : ''}
            {activeCount > 0 && (
              <span>
                {' — '}
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            fontFamily: 'var(--font-display)', flexShrink: 0,
            boxShadow: '0 2px 10px rgba(45,125,210,0.3)',
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nouveau workflow
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px', borderRadius: 'var(--radius-md)',
        background: 'rgba(45,125,210,0.05)', border: '1px solid rgba(45,125,210,0.15)',
      }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
          Les workflows déclenchent des demandes de validation multi-étapes sur les documents métier
          (factures, bons de commande, dépenses…) selon des règles de montant ou de type. Réservé aux administrateurs.
        </p>
      </div>

      {/* Content */}
      {isError ? (
        <div style={{ padding: '20px 24px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#ef4444', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            Impossible de charger les workflows. Veuillez rafraîchir.
          </p>
        </div>
      ) : isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : !Array.isArray(workflows) || workflows.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(45,125,210,0.1) 0%, rgba(45,125,210,0.05) 100%)',
            border: '1.5px solid rgba(45,125,210,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings2 size={32} style={{ color: 'var(--primary)', opacity: 0.7 }} />
          </div>
          <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Aucun workflow configuré
          </h3>
          <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--text-3)', fontFamily: 'var(--font-body)', maxWidth: 380, lineHeight: 1.6 }}>
            Créez des workflows pour imposer des validations multi-étapes sur vos documents avant émission.
          </p>
          <button
            type="button"
            onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--primary)', color: '#fff',
              cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
              fontFamily: 'var(--font-display)',
              boxShadow: '0 4px 16px rgba(45,125,210,0.3)',
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Créer le premier workflow
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {(workflows as ApprovalWorkflow[]).map((wf) => (
            <WorkflowCard key={wf.id} wf={wf} onEdit={() => openEdit(wf)} />
          ))}
        </div>
      )}

      {drawerOpen && (
        <WorkflowDrawer workflow={editing} onClose={() => { setDrawerOpen(false); setEditing(undefined) }} />
      )}
    </div>
  )
}
