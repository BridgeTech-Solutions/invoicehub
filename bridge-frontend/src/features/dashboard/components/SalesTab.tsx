'use client'

import { KpiCards } from './KpiCards'
import { RevenueChart } from './RevenueChart'
import { InvoiceStatusDonut } from './InvoiceStatusDonut'
import { RecentInvoicesTable } from './RecentInvoicesTable'
import { TopClientsTable } from './TopClientsTable'
import { AgingWidget } from './AgingWidget'
import { ProformaPipeline } from './ProformaPipeline'

// ─── Component ────────────────────────────────────────────────
/**
 * SalesTab — onglet « Ventes » du dashboard dirigeant.
 * KPI ventes, évolution du CA + statuts, factures récentes + top clients, balance âgée.
 */
export function SalesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI ventes (CA du mois, Factures émises, Créances, Retards) */}
      <KpiCards />

      {/* Évolution CA (large) + donut statuts (étroit) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>
        <RevenueChart />
        <InvoiceStatusDonut />
      </div>

      {/* Factures récentes (large) + top clients (étroit) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]" style={{ alignItems: 'start' }}>
        <RecentInvoicesTable />
        <TopClientsTable />
      </div>

      {/* Balance âgée des créances + pipeline devis */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]" style={{ alignItems: 'start' }}>
        <AgingWidget />
        <ProformaPipeline />
      </div>
    </div>
  )
}
