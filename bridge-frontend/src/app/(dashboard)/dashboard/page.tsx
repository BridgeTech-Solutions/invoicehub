import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/PageHeader'
import { FinancialHeroBand }   from '@/features/dashboard/components/FinancialHeroBand'
import { DashboardTabs }       from '@/features/dashboard/components/DashboardTabs'
import { DashboardSocketSync } from '@/features/dashboard/components/DashboardSocketSync'

export const metadata: Metadata = { title: 'Tableau de bord — InvoiceHub' }

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Sync temps réel via Socket.io — invisible, aria-live pour screen readers */}
      <DashboardSocketSync />

      {/* ── En-tête ──────────────────────────────────────── */}
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité financière BTS"
      />

      {/* ── Bandeau héros PERMANENT (au-dessus des onglets) ─ */}
      <FinancialHeroBand />

      {/* ── Coquille à onglets (multi-rôles, RBAC) ────────── */}
      <DashboardTabs />

    </div>
  )
}
