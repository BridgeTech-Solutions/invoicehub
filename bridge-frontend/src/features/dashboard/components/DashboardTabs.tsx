'use client'

import { useState, useMemo } from 'react'
import { usePermission } from '@/hooks/usePermission'
import type { Resource } from '@/hooks/usePermission'
import { OverviewTab } from './OverviewTab'
import { SalesTab } from './SalesTab'
import { PurchasesTab } from './PurchasesTab'
import { TreasuryTab } from './TreasuryTab'

// ─── Tab definitions ───────────────────────────────────────────
type TabKey = 'overview' | 'sales' | 'purchases' | 'treasury'

interface TabDef {
  key:      TabKey
  label:    string
  // Ressource RBAC requise pour voir l'onglet (null = toujours visible).
  // admin contourne tout (isAdmin). TODO RBAC : affiner par action si besoin.
  resource: Resource | null
}

const TABS: TabDef[] = [
  { key: 'overview',  label: "Vue d'ensemble", resource: null },
  { key: 'sales',     label: 'Ventes',         resource: 'invoice' },
  { key: 'purchases', label: 'Achats',         resource: 'purchase-order' },
  { key: 'treasury',  label: 'Trésorerie',     resource: 'bank' },
]

// ─── Component ────────────────────────────────────────────────
/**
 * DashboardTabs — coquille à onglets du tableau de bord dirigeant.
 * Visibilité par rôle via RBAC : l'admin voit tout, les autres rôles
 * ne voient que les onglets dont ils ont la permission de lecture.
 */
export function DashboardTabs() {
  const { can, isAdmin } = usePermission()

  // Onglets visibles selon le rôle. admin = tout ; sinon read sur la ressource.
  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        (t) => t.resource === null || isAdmin || can(t.resource, 'read'),
      ),
    [can, isAdmin],
  )

  const [active, setActive] = useState<TabKey>('overview')

  // Garde-fou : si l'onglet actif n'est plus visible (changement de rôle),
  // on retombe sur le premier onglet disponible.
  const activeKey = visibleTabs.some((t) => t.key === active)
    ? active
    : (visibleTabs[0]?.key ?? 'overview')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Barre d'onglets segmentée (pill) */}
      <div
        role="tablist"
        aria-label="Sections du tableau de bord"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          padding: 4,
          gap: 2,
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`dashtab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`dashpanel-${tab.key}`}
              onClick={() => setActive(tab.key)}
              style={{
                padding: '7px 18px',
                borderRadius: 18,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'var(--font-display)',
                fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap',
                background: isActive ? 'var(--primary)' : 'transparent',
                color:      isActive ? '#fff' : 'var(--text-3)',
                transition: 'background 0.2s ease, color 0.2s ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Panneaux */}
      <div
        role="tabpanel"
        id={`dashpanel-${activeKey}`}
        aria-labelledby={`dashtab-${activeKey}`}
        tabIndex={0}
      >
        {activeKey === 'overview'  && <OverviewTab />}
        {activeKey === 'sales'     && <SalesTab />}
        {activeKey === 'purchases' && <PurchasesTab />}
        {activeKey === 'treasury'  && <TreasuryTab />}
      </div>
    </div>
  )
}
