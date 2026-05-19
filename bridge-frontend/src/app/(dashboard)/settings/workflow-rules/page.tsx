'use client'

import { useState, useMemo } from 'react'
import { Plus, Zap, Info } from 'lucide-react'
import { useWorkflowRules } from '@/features/workflow-rules/hooks'
import { WorkflowRuleCard } from '@/features/workflow-rules/components/WorkflowRuleCard'
import { WorkflowRuleDrawer } from '@/features/workflow-rules/components/WorkflowRuleDrawer'
import { WORKFLOW_MODULES } from '@/features/workflow-rules/types'

// ─── Module filter pills ──────────────────────────────────────
const ALL_MODULES = [
  { value: '', label: 'Tous' },
  ...WORKFLOW_MODULES,
]

// ─── Skeleton card (matching WorkflowRuleCard dimensions) ─────
function SkeletonCard() {
  return (
    <div className="card animate-pulse" style={{ padding: '16px 20px', borderLeft: '3px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, width: '55%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 11, width: '75%', background: 'var(--border)', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ height: 28, width: 64, borderRadius: 100, background: 'var(--border)' }} />
          <div style={{ height: 32, width: 32, borderRadius: 8, background: 'var(--border)' }} />
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ height: 10, width: 130, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ height: 22, width: 120, borderRadius: 100, background: 'var(--border)' }} />
          <div style={{ height: 22, width: 95, borderRadius: 100, background: 'var(--border)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────
function EmptyState({ filtered, onCreate }: { filtered: boolean; onCreate: () => void }) {
  if (filtered) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Aucune règle pour ce module.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '64px 24px', textAlign: 'center',
    }}>
      {/* Icon */}
      <div style={{
        width: 72, height: 72, borderRadius: 20, marginBottom: 20,
        background: 'linear-gradient(135deg, rgba(45,125,210,0.1) 0%, rgba(45,125,210,0.05) 100%)',
        border: '1.5px solid rgba(45,125,210,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Zap size={32} style={{ color: 'var(--primary)', opacity: 0.7 }} aria-hidden="true" />
      </div>

      <h3 style={{
        margin: '0 0 10px', fontSize: 18, fontWeight: 700,
        fontFamily: 'var(--font-display)', color: 'var(--text-1)',
      }}>
        Aucune règle configurée
      </h3>
      <p style={{
        margin: '0 0 28px', fontSize: 14, color: 'var(--text-3)',
        fontFamily: 'var(--font-body)', maxWidth: 380, lineHeight: 1.6,
      }}>
        Les règles workflow automatisent vos processus métier — envoi d&apos;emails,
        notifications, changements de statut — déclenchés sur vos événements clés.
      </p>
      <button
        type="button"
        onClick={onCreate}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 22px', borderRadius: 'var(--radius-md)',
          border: 'none', background: 'var(--primary)', color: '#fff',
          cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
          fontFamily: 'var(--font-display)',
          boxShadow: '0 4px 16px rgba(45,125,210,0.3)',
          transition: 'box-shadow 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#1a65c0'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(45,125,210,0.4)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(45,125,210,0.3)' }}
      >
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
        Créer la première règle
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function WorkflowRulesPage() {
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [activeModule,  setActiveModule]  = useState('')

  const { data: rules = [], isLoading, isError } = useWorkflowRules()

  const filtered = useMemo(() =>
    activeModule ? rules.filter((r) => r.module === activeModule) : rules,
    [rules, activeModule],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            margin: '0 0 4px', fontSize: 20, fontWeight: 800,
            fontFamily: 'var(--font-display)', color: 'var(--text-1)',
          }}>
            Règles workflow
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
            {rules.length} règle{rules.length !== 1 ? 's' : ''} configurée{rules.length !== 1 ? 's' : ''}
            {rules.filter((r) => r.isActive).length > 0 && ` — ${rules.filter((r) => r.isActive).length} active${rules.filter((r) => r.isActive).length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            fontFamily: 'var(--font-display)', flexShrink: 0,
            boxShadow: '0 2px 10px rgba(45,125,210,0.3)',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a65c0'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(45,125,210,0.45)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(45,125,210,0.3)' }}
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          Nouvelle règle
        </button>
      </div>

      {/* ── Info banner ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px', borderRadius: 'var(--radius-md)',
        background: 'rgba(45,125,210,0.05)',
        border: '1px solid rgba(45,125,210,0.15)',
      }}>
        <Info size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
          Les règles workflow déclenchent automatiquement des actions — notifications internes, emails, webhooks — en réponse aux événements de vos modules (factures, paiements, dépenses…). Elles s&apos;exécutent côté serveur sans intervention manuelle.
        </p>
      </div>

      {/* ── Module filter pills ───────────────────────────────── */}
      <div
        role="group"
        aria-label="Filtrer par module"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {ALL_MODULES.map((mod) => {
          const isActive = activeModule === mod.value
          return (
            <button
              key={mod.value}
              type="button"
              onClick={() => setActiveModule(mod.value)}
              aria-pressed={isActive}
              style={{
                padding: '6px 14px', borderRadius: 100,
                border: '1.5px solid',
                borderColor:  isActive ? 'var(--primary)' : 'var(--border)',
                background:   isActive ? 'var(--primary)' : 'var(--surface)',
                color:        isActive ? '#fff' : 'var(--text-2)',
                cursor:       'pointer',
                fontSize:     12.5, fontWeight: isActive ? 700 : 500,
                fontFamily:  'var(--font-display)',
                transition:  'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                  e.currentTarget.style.color = 'var(--primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--text-2)'
                }
              }}
            >
              {mod.label}
              {mod.value && rules.filter((r) => r.module === mod.value).length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10.5, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 100,
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                  color: isActive ? '#fff' : 'var(--text-3)',
                }}>
                  {rules.filter((r) => r.module === mod.value).length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {isError ? (
        <div style={{
          padding: '20px 24px', borderRadius: 'var(--radius-md)',
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#ef4444', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            Impossible de charger les règles workflow. Veuillez rafraîchir la page.
          </p>
        </div>
      ) : isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filtered={!!activeModule} onCreate={() => setDrawerOpen(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
          {filtered.map((rule) => (
            <WorkflowRuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}

      {/* ── Drawer ────────────────────────────────────────────── */}
      {drawerOpen && (
        <WorkflowRuleDrawer onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}
