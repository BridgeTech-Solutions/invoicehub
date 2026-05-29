'use client'

import { useState, useId, useEffect } from 'react'
import { Plus, Zap, Search, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfidenceBar } from '@/features/bank/components/ConfidenceBar'
import { useMatchingRules, useCreateMatchingRule, useUpdateMatchingRule, useDeleteMatchingRule, useBankAccounts } from '@/features/bank/hooks'
import type { BankMatchingRule, CreateMatchingRulePayload, MatchedEntityType } from '@/features/bank/types'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

const ENTITY_TYPE_LABEL: Record<MatchedEntityType, string> = {
  payment:          'Paiement client',
  supplier_payment: 'Paiement fournisseur',
  expense:          'Dépense',
}

const ENTITY_TYPE_COLORS: Record<MatchedEntityType, { color: string; bg: string }> = {
  payment:          { color: '#2D7DD2', bg: 'rgba(45,125,210,0.09)' },
  supplier_payment: { color: '#9333ea', bg: '#f3e8ff' },
  expense:          { color: '#d97706', bg: '#fef3c7' },
}

// ─── Rule drawer ───────────────────────────────────────────────────────────

function RuleDrawer({ rule, accounts, onClose }: {
  rule?: BankMatchingRule | null
  accounts: import('@/features/bank/types').BankAccount[]
  onClose: () => void
}) {
  const isEdit = !!rule
  const titleId = useId()
  const [isVisible, setIsVisible] = useState(false)
  const [form, setForm] = useState<CreateMatchingRulePayload>({
    bankAccountId: rule?.bankAccountId ?? null,
    labelContains:  rule?.labelContains  ?? '',
    entityType:    rule?.entityType    ?? 'payment',
    amountMin:     rule?.amountMin     ?? null,
    amountMax:     rule?.amountMax     ?? null,
    autoApply:     rule?.autoApply     ?? false,
    notes:         rule?.notes         ?? '',
  })

  const createMutation = useCreateMatchingRule()
  const updateMutation = useUpdateMatchingRule()
  const isPending = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 280) }
  const set = (k: keyof CreateMatchingRulePayload, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const INPUT_STYLE: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13.5,
    border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', fontFamily: 'var(--font-body)',
  }
  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(45,125,210,0.12)'
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, notes: form.notes || null }
    if (isEdit) {
      await updateMutation.mutateAsync({ id: rule.id, data: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    handleClose()
  }

  function Field({ label, required, children, htmlFor }: { label: string; required?: boolean; children: React.ReactNode; htmlFor?: string }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-display)', letterSpacing: '0.015em' }}>
          {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }} aria-hidden>*</span>}
        </label>
        {children}
      </div>
    )
  }

  return (
    <>
      <div onClick={handleClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,20,35,0.45)', backdropFilter: 'blur(2px)', opacity: isVisible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div role="dialog" aria-modal aria-labelledby={titleId} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301, width: '100%', maxWidth: 460, background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(10,20,35,0.18)', borderLeft: '1px solid var(--border)', transform: isVisible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#0f2d4a 0%,#2D7DD2 100%)' }} />
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'rgba(45,125,210,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={16} style={{ color: 'var(--primary)' }} strokeWidth={1.8} />
            </div>
            <h2 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>
              {isEdit ? 'Modifier la règle' : 'Nouvelle règle'}
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--text-3)', display: 'flex' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <X size={17} />
          </button>
        </div>

        <form id="rule-form" onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Compte (optionnel)">
            <select value={form.bankAccountId ?? ''} onChange={e => set('bankAccountId', e.target.value || null)}
              onFocus={focusStyle} onBlur={blurStyle} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
              <option value="">Tous les comptes</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label="Pattern du libellé" required htmlFor="rule-pattern">
            <input id="rule-pattern" type="text" required value={form.labelContains}
              onChange={e => set('labelContains', e.target.value)}
              onFocus={focusStyle} onBlur={blurStyle}
              placeholder="ex: VIREMENT AFRILAND* ou FRAIS TENUE*"
              style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>* = joker (plusieurs caractères) · ? = un seul caractère</span>
          </Field>

          <Field label="Type d'entité" required htmlFor="rule-entity">
            <select id="rule-entity" required value={form.entityType}
              onChange={e => set('entityType', e.target.value as MatchedEntityType)}
              onFocus={focusStyle} onBlur={blurStyle}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
              {(Object.entries(ENTITY_TYPE_LABEL) as [MatchedEntityType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Montant min (XAF)" htmlFor="rule-min">
              <input id="rule-min" type="number" min={0} value={form.amountMin ?? ''}
                onChange={e => set('amountMin', e.target.value ? parseFloat(e.target.value) : null)}
                onFocus={focusStyle} onBlur={blurStyle}
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            </Field>
            <Field label="Montant max (XAF)" htmlFor="rule-max">
              <input id="rule-max" type="number" min={0} value={form.amountMax ?? ''}
                onChange={e => set('amountMax', e.target.value ? parseFloat(e.target.value) : null)}
                onFocus={focusStyle} onBlur={blurStyle}
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }} />
            </Field>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${form.autoApply ? 'var(--primary)' : 'var(--border)'}`, background: form.autoApply ? 'rgba(45,125,210,0.05)' : 'var(--surface)', transition: 'all 0.15s' }}>
            <input type="checkbox" checked={form.autoApply} onChange={e => set('autoApply', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>Application automatique</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>Appliqué automatiquement lors des imports</div>
            </div>
          </label>

          <Field label="Notes" htmlFor="rule-notes">
            <textarea id="rule-notes" value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              onFocus={focusStyle as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              onBlur={blurStyle  as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>
        </form>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleClose} style={{ padding: '9px 18px', minHeight: 40, borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-2)', border: '1.5px solid var(--border)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" form="rule-form" disabled={isPending} style={{ padding: '9px 20px', minHeight: 40, borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(45,125,210,0.25)' }}>
            {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {isEdit ? 'Enregistrer' : 'Créer la règle'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function MatchingRulesPage() {
  const { can } = usePermission()
  const [drawerOpen,    setDrawerOpen]   = useState(false)
  const [editingRule,   setEditingRule]  = useState<BankMatchingRule | null>(null)
  const [accountFilter, setAccountFilter] = useState('')
  const [search,        setSearch]       = useState('')
  const searchId = useId()

  const { data: rules = [],    isLoading }  = useMatchingRules(accountFilter || undefined)
  const { data: accounts = [] }             = useBankAccounts()
  const deleteMutation                      = useDeleteMatchingRule()
  const updateMutation                      = useUpdateMatchingRule()

  const filtered = rules.filter(r =>
    !search || r.labelContains.toLowerCase().includes(search.toLowerCase())
  )

  const handleEdit = (rule: BankMatchingRule) => {
    setEditingRule(rule)
    setDrawerOpen(true)
  }
  const handleClose = () => {
    setDrawerOpen(false)
    setTimeout(() => setEditingRule(null), 300)
  }
  const handleDelete = async (rule: BankMatchingRule) => {
    if (!confirm(`Supprimer la règle "${rule.labelContains}" ?`)) return
    await deleteMutation.mutateAsync(rule.id)
  }
  const handleToggleAutoApply = async (rule: BankMatchingRule) => {
    await updateMutation.mutateAsync({ id: rule.id, data: { autoApply: !rule.autoApply } })
  }

  if (!can('bank', 'read')) return <AccessDenied message="Vous n'avez pas accès au module bancaire." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Règles de matching"
        description="Appris automatiquement à partir de vos rapprochements"
        actions={
          <button
            type="button"
            onClick={() => { setEditingRule(null); setDrawerOpen(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(45,125,210,0.3)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Créer une règle
          </button>
        }
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
            aria-label="Filtrer par compte"
            style={{ padding: '0 10px', height: 40, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}>
            <option value="">Tous les comptes</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <label htmlFor={searchId} className="sr-only">Rechercher un pattern</label>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} aria-hidden />
            <input id={searchId} type="search" placeholder="Rechercher un pattern…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', height: 40, boxSizing: 'border-box', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, color: 'var(--text-1)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--bg)' }} />
          </div>
        </div>

        {isLoading ? (
          <div aria-hidden>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {[200, 120, 140, 80, 60, 40].map((w, j) => (
                  <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <RichEmptyState
            icon={Zap}
            title={search ? `Aucun résultat pour « ${search} »` : 'Aucune règle de matching'}
            description={search
              ? 'Essayez un autre pattern de libellé.'
              : 'Les règles s\'apprennent automatiquement lors de vos rapprochements. Vous pouvez aussi en créer manuellement.'}
            features={!search ? ['Auto-apprentissage', 'Jokers * et ?', 'Plages de montants'] : undefined}
            cta={!search ? { label: '+ Créer une règle', onClick: () => setDrawerOpen(true) } : undefined}
            compact={!!search}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Règles de matching">
              <thead>
                <tr>
                  <th>Pattern libellé</th>
                  <th>Type entité</th>
                  <th>Compte</th>
                  <th style={{ minWidth: 120 }}>Confiance</th>
                  <th style={{ textAlign: 'center' }}>Auto</th>
                  <th style={{ textAlign: 'right' }}>Utilisations</th>
                  <th>Créée le</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(rule => {
                  const entityCfg = ENTITY_TYPE_COLORS[rule.entityType]
                  return (
                    <tr key={rule.id} style={{ opacity: rule.isActive ? 1 : 0.5 }}>
                      <td>
                        <code style={{
                          fontSize: 12.5, padding: '3px 8px', borderRadius: 5,
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 500,
                        }}>
                          {rule.labelContains}
                        </code>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, color: entityCfg.color, background: entityCfg.bg, fontFamily: 'var(--font-display)' }}>
                          {ENTITY_TYPE_LABEL[rule.entityType]}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                        {rule.bankAccount?.name ?? 'Tous'}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <ConfidenceBar value={rule.confidence} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.autoApply}
                          aria-label={rule.autoApply ? 'Désactiver application auto' : 'Activer application auto'}
                          onClick={() => handleToggleAutoApply(rule)}
                          style={{
                            width: 36, height: 20, borderRadius: 99, border: 'none',
                            background: rule.autoApply ? 'var(--primary)' : 'var(--border)',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            left: rule.autoApply ? 18 : 2,
                            transition: 'left 0.2s',
                          }} />
                        </button>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                        {(rule.usageCount ?? 0).toLocaleString('fr-FR')}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDate(rule.createdAt)}</td>
                      <td>
                        <ActionMenu
                          items={[
                            { label: 'Modifier',    icon: Pencil, onClick: () => handleEdit(rule) },
                            { label: 'Supprimer',   icon: Trash2, onClick: () => handleDelete(rule), danger: true, separator: true },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && (
        <RuleDrawer rule={editingRule} accounts={accounts} onClose={handleClose} />
      )}
    </div>
  )
}
