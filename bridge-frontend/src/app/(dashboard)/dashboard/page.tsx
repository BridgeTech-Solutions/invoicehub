import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCards }              from '@/features/dashboard/components/KpiCards'
import { RevenueChart }           from '@/features/dashboard/components/RevenueChart'
import { InvoiceStatusDonut }     from '@/features/dashboard/components/InvoiceStatusDonut'
import { RecentInvoicesTable }    from '@/features/dashboard/components/RecentInvoicesTable'
import { TopClientsTable }        from '@/features/dashboard/components/TopClientsTable'
import { AgingWidget }            from '@/features/dashboard/components/AgingWidget'

export const metadata: Metadata = { title: 'Tableau de bord — InvoiceHub' }

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── En-tête ──────────────────────────────────────── */}
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité de facturation BTS"
      />

      {/* ── KPI Cards (4) ─────────────────────────────────── */}
      <KpiCards />

      {/* ── Ligne 2 : Graphique CA + Donut statuts ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <RevenueChart />
        <InvoiceStatusDonut />
      </div>

      {/* ── Ligne 3 : Factures récentes + Top Clients ──── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <RecentInvoicesTable />
        <TopClientsTable />
      </div>

      {/* ── Ligne 4 : Aging des créances ────────────────── */}
      <AgingWidget />

    </div>
  )
}
