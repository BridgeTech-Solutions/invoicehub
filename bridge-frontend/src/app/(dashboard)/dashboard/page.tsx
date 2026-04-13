import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCards }              from '@/features/dashboard/components/KpiCards'
import { RevenueChart }           from '@/features/dashboard/components/RevenueChart'
import { InvoiceStatusDonut }     from '@/features/dashboard/components/InvoiceStatusDonut'
import { RecentInvoicesTable }    from '@/features/dashboard/components/RecentInvoicesTable'
import { TopClientsTable }        from '@/features/dashboard/components/TopClientsTable'
import { AgingWidget }            from '@/features/dashboard/components/AgingWidget'
import { DashboardSocketSync }    from '@/features/dashboard/components/DashboardSocketSync'

export const metadata: Metadata = { title: 'Tableau de bord — InvoiceHub' }

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Sync temps réel via Socket.io — invisible, aria-live pour screen readers */}
      <DashboardSocketSync />

      {/* ── En-tête ──────────────────────────────────────── */}
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité de facturation BTS"
      />

      {/* ── KPI Cards (4) ─────────────────────────────────── */}
      <KpiCards />

      {/* ── Analyses ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Ligne 2 : Graphique CA + Donut statuts ─────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <RevenueChart />
          <InvoiceStatusDonut />
        </div>

        {/* ── Ligne 3 : Factures récentes + Top Clients ──── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <RecentInvoicesTable />
          <TopClientsTable />
        </div>

        {/* ── Ligne 4 : Aging des créances ────────────────── */}
        <AgingWidget />

      </div>

    </div>
  )
}
