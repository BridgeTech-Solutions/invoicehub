'use client'

import { useState } from 'react'
import { Trash2, Zap, ChevronRight, Power } from 'lucide-react'
import { useToggleWorkflowRule, useDeleteWorkflowRule } from '../hooks'
import { WORKFLOW_MODULES, TRIGGER_EVENTS, ACTION_TYPES } from '../types'
import type { WorkflowRule } from '../types'

// ── Badge couleur par module ──────────────────────────────────
const MODULE_COLORS: Record<string, { bg: string; color: string }> = {
  invoice:  { bg: 'rgba(16,185,129,0.1)',  color: '#10b981' },
  proforma: { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  payment:  { bg: 'rgba(45,125,210,0.1)',  color: '#2D7DD2' },
  client:   { bg: 'rgba(99,102,241,0.1)',  color: '#6366f1' },
  expense:  { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  stock:    { bg: 'rgba(139,92,246,0.1)',  color: '#8b5cf6' },
}

function moduleLabel(module: string) {
  return WORKFLOW_MODULES.find((m) => m.value === module)?.label ?? module
}

function eventLabel(module: string, triggerEvent: string) {
  return TRIGGER_EVENTS[module]?.find((e) => e.value === triggerEvent)?.label ?? triggerEvent
}

function actionLabel(type: string) {
  return ACTION_TYPES.find((a) => a.value === type)?.label ?? type
}

interface WorkflowRuleCardProps {
  rule: WorkflowRule
}

export function WorkflowRuleCard({ rule }: WorkflowRuleCardProps) {
  const toggleMut = useToggleWorkflowRule()
  const deleteMut = useDeleteWorkflowRule()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const colors = MODULE_COLORS[rule.module] ?? { bg: 'rgba(90,122,150,0.1)', color: 'var(--text-3)' }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteMut.mutate(rule.id, { onSettled: () => setConfirmDelete(false) })
  }

  return (
    <div
      className="card"
      style={{
        padding:    '16px 20px',
        opacity:     rule.isActive ? 1 : 0.6,
        transition: 'opacity 0.2s',
        borderLeft: `3px solid ${rule.isActive ? colors.color : 'var(--border)'}`,
      }}
    >
      {/* Row 1 — header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: colors.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={16} style={{ color: colors.color }} aria-hidden="true" />
        </div>

        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700,
            fontFamily: 'var(--font-display)', color: 'var(--text-1)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {rule.name}
          </p>

          {/* Module → Event */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 100,
              background: colors.bg, color: colors.color,
            }}>
              {moduleLabel(rule.module)}
            </span>
            <ChevronRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} aria-hidden="true" />
            <span style={{
              fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 500,
            }}>
              {eventLabel(rule.module, rule.triggerEvent)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Toggle switch */}
          <button
            type="button"
            onClick={() => toggleMut.mutate(rule.id)}
            disabled={toggleMut.isPending}
            aria-label={rule.isActive ? 'Désactiver la règle' : 'Activer la règle'}
            title={rule.isActive ? 'Désactiver' : 'Activer'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 100, border: '1.5px solid',
              borderColor: rule.isActive ? colors.color : 'var(--border)',
              background:  rule.isActive ? colors.bg : 'transparent',
              color:       rule.isActive ? colors.color : 'var(--text-3)',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              fontFamily: 'var(--font-display)', transition: 'all 0.15s',
              opacity: toggleMut.isPending ? 0.6 : 1,
            }}
          >
            <Power size={11} aria-hidden="true" />
            {rule.isActive ? 'Actif' : 'Inactif'}
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            aria-label={confirmDelete ? 'Confirmer la suppression' : 'Supprimer la règle'}
            title={confirmDelete ? 'Cliquer pour confirmer' : 'Supprimer'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              border: confirmDelete ? '1.5px solid #ef4444' : '1.5px solid var(--border)',
              background: confirmDelete ? 'rgba(239,68,68,0.08)' : 'transparent',
              color:      confirmDelete ? '#ef4444' : 'var(--text-3)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
            onMouseLeave={(e) => {
              if (!confirmDelete) {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color       = 'var(--text-3)'
                e.currentTarget.style.background  = 'transparent'
              }
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Row 2 — Actions summary */}
      {rule.actions.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
            Actions déclenchées
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {rule.actions.map((action, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 100,
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
                }}
              >
                {actionLabel(action.type)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — meta */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
        {rule.priority > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            Priorité {rule.priority}
          </span>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {new Date(rule.createdAt).toLocaleDateString('fr-FR')}
        </span>
      </div>

      {/* Confirm delete hint */}
      {confirmDelete && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444', fontStyle: 'italic' }}>
          Cliquer à nouveau sur la corbeille pour confirmer la suppression.
        </p>
      )}
    </div>
  )
}
