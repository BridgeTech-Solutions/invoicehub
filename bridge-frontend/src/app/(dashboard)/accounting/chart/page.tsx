'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, ChevronRight, ChevronDown, Pencil, Eye, PowerOff, Power, List } from 'lucide-react'
import { useAccounts, useToggleAccount, useDeleteAccount } from '@/features/accounting/hooks'
import { AccountDrawer } from '@/features/accounting/components/AccountDrawer'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/constants'
import { useCurrency } from '@/hooks/useCurrency'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { toast } from 'sonner'
import type { AccountListItem, AccountClass, AccountType } from '@/features/accounting/types'

const CLASSES: { id: AccountClass; label: string }[] = [
  { id: 1, label: '1 — Ressources durables' },
  { id: 2, label: '2 — Investissements' },
  { id: 3, label: '3 — Stocks' },
  { id: 4, label: '4 — Tiers' },
  { id: 5, label: '5 — Trésorerie' },
  { id: 6, label: '6 — Charges' },
  { id: 7, label: '7 — Produits' },
  { id: 8, label: '8 — Résultats' },
]

const TYPE_CFG: Record<AccountType, { label: string; color: string; bg: string }> = {
  asset:     { label: 'Actif',     color: '#2D7DD2', bg: 'rgba(45,125,210,0.1)' },
  liability: { label: 'Passif',    color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  equity:    { label: 'Capitaux',  color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  revenue:   { label: 'Produit',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  expense:   { label: 'Charge',    color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

interface TreeNode extends AccountListItem {
  children: TreeNode[]
  depth: number
}

function buildTree(accounts: AccountListItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  accounts.forEach(a => map.set(a.id, { ...a, children: [], depth: 0 }))
  const roots: TreeNode[] = []
  accounts.forEach(a => {
    const node = map.get(a.id)!
    if (a.parentId && map.has(a.parentId)) {
      const parent = map.get(a.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []
  function walk(list: TreeNode[]) {
    list.forEach(n => { result.push(n); if (n.children.length) walk(n.children) })
  }
  walk(nodes)
  return result
}

function AccountRow({ node, expanded, onToggle, onEdit, onViewLedger, onToggleActive }: {
  node: TreeNode
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onViewLedger: () => void
  onToggleActive: () => void
}) {
  const { format } = useCurrency()
  const { can }   = usePermission()
  const hasChildren = node.children.length > 0
  const typeCfg = TYPE_CFG[node.type]

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
      <td style={{ padding: '7px 12px', width: 40 }}>
        {hasChildren ? (
          <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 4, border: 'none', background: 'var(--border)', cursor: 'pointer', color: 'var(--text-2)' }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : null}
      </td>
      <td style={{ padding: '7px 12px', paddingLeft: `${12 + node.depth * 20}px` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--primary)' }}>{node.number}</span>
      </td>
      <td style={{ padding: '7px 12px' }}>
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: node.depth === 0 ? 600 : 400 }}>{node.name}</span>
      </td>
      <td style={{ padding: '7px 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: typeCfg.bg, color: typeCfg.color }}>{typeCfg.label}</span>
      </td>
      <td style={{ padding: '7px 12px', fontSize: 12.5, color: node.normalBalance === 'debit' ? 'var(--acc-debit)' : 'var(--acc-credit)', fontWeight: 600 }}>
        {node.normalBalance === 'debit' ? 'Débit' : 'Crédit'}
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-2)' }}>
        {node.openingBalance !== 0 ? format(node.openingBalance) : '—'}
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: node.isActive ? '#16a34a' : '#94a3b8', margin: '0 auto' }} />
      </td>
      <td style={{ padding: '7px 8px', textAlign: 'right' }}>
        <ActionMenu items={[
          ...(can('accounting', 'update') ? [{ label: 'Modifier', icon: Pencil, onClick: onEdit }] : []),
          { label: 'Grand livre', icon: Eye, onClick: onViewLedger },
          ...(can('accounting', 'update') ? [{ label: node.isActive ? 'Désactiver' : 'Activer', icon: node.isActive ? PowerOff : Power, onClick: onToggleActive }] : []),
        ]} />
      </td>
    </tr>
  )
}

export default function ChartOfAccountsPage() {
  const { can } = usePermission()
  const [selectedClass, setSelectedClass] = useState<AccountClass | null>(null)
  const [search, setSearch]               = useState('')
  const [expandedIds, setExpandedIds]     = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen]       = useState(false)
  const [editing, setEditing]             = useState<AccountListItem | null>(null)

  const { data: accounts = [], isLoading } = useAccounts({ class: selectedClass ?? undefined })
  const toggle   = useToggleAccount()
  const router   = useRouter()

  const filtered = useMemo(() => {
    if (!search) return accounts
    const s = search.toLowerCase()
    return accounts.filter(a => a.number.includes(s) || a.name.toLowerCase().includes(s))
  }, [accounts, search])

  const tree  = useMemo(() => buildTree(filtered), [filtered])
  const flat  = useMemo(() => {
    if (search) return flattenTree(tree)
    function walkVisible(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = []
      nodes.forEach(n => {
        result.push(n)
        if (expandedIds.has(n.id) && n.children.length) {
          result.push(...walkVisible(n.children))
        }
      })
      return result
    }
    return walkVisible(tree)
  }, [tree, expandedIds, search])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleOpenEdit(account: AccountListItem) {
    setEditing(account)
    setDrawerOpen(true)
  }

  async function handleToggleActive(account: AccountListItem) {
    try {
      await toggle.mutateAsync({ id: account.id, isActive: !account.isActive })
      toast.success(`Compte ${account.isActive ? 'désactivé' : 'activé'}`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  if (!can('accounting', 'read')) return <AccessDenied message="Vous n'avez pas accès à la comptabilité." />

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <List size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0 }}>Plan comptable</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>OHADA — Classes 1 à 8</p>
          </div>
        </div>
        {can('accounting', 'create') && (
          <button onClick={() => { setEditing(null); setDrawerOpen(true) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-display)', border: 'none', cursor: 'pointer' }}>
            <Plus size={15} /> Ajouter un compte
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setSelectedClass(null)}
          style={{ height: 32, padding: '0 12px', borderRadius: 99, border: `1.5px solid ${!selectedClass ? 'var(--primary)' : 'var(--border)'}`, background: !selectedClass ? 'var(--primary-light)' : 'transparent', color: !selectedClass ? 'var(--primary)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'all 0.15s' }}>
          Tous
        </button>
        {CLASSES.map(c => (
          <button key={c.id} onClick={() => setSelectedClass(c.id === selectedClass ? null : c.id)}
            style={{ height: 32, padding: '0 12px', borderRadius: 99, border: `1.5px solid ${selectedClass === c.id ? 'var(--primary)' : 'var(--border)'}`, background: selectedClass === c.id ? 'var(--primary-light)' : 'transparent', color: selectedClass === c.id ? 'var(--primary)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            Cl. {c.id}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Numéro ou intitulé…"
            style={{ width: '100%', height: 32, paddingLeft: 32, paddingRight: 10, borderRadius: 99, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', outline: 'none' }} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={th}></th>
                <th style={th}>N°</th>
                <th style={{ ...th, textAlign: 'left' }}>Intitulé</th>
                <th style={th}>Type</th>
                <th style={th}>Sens</th>
                <th style={{ ...th, textAlign: 'right' }}>S. ouverture</th>
                <th style={th}>Actif</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{ height: 14, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: j === 2 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : flat.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', fontSize: 14, color: 'var(--text-3)' }}>
                  {search ? 'Aucun compte ne correspond à votre recherche.' : 'Aucun compte dans le plan comptable.'}
                </td></tr>
              ) : (
                flat.map(node => (
                  <AccountRow key={node.id} node={node}
                    expanded={expandedIds.has(node.id)}
                    onToggle={() => toggleExpand(node.id)}
                    onEdit={() => handleOpenEdit(node)}
                    onViewLedger={() => router.push(`${ROUTES.ACCOUNTING_REPORTS}?accountId=${node.id}&tab=ledger`)}
                    onToggleActive={() => handleToggleActive(node)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AccountDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} editing={editing} />
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
  fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em',
  textAlign: 'left', whiteSpace: 'nowrap',
}
