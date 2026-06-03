'use client'

import { PurchaseStatCards } from './PurchaseStatCards'
import { PurchaseOrderPipeline } from './PurchaseOrderPipeline'
import { ExpensesByCategory } from './ExpensesByCategory'
import { TopSuppliers } from './TopSuppliers'
import { StockAlerts } from './StockAlerts'

// ─── Component ────────────────────────────────────────────────
/**
 * PurchasesTab — onglet « Achats » du dashboard dirigeant.
 * Mini-stats achats, BC en cours, dépenses par catégorie + top fournisseurs, alertes stock.
 */
export function PurchasesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Mini-stats achats */}
      <PurchaseStatCards />

      {/* Bons de commande en cours + alertes stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ alignItems: 'start' }}>
        <PurchaseOrderPipeline />
        <StockAlerts />
      </div>

      {/* Dépenses par catégorie + top fournisseurs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ alignItems: 'start' }}>
        <ExpensesByCategory />
        <TopSuppliers />
      </div>
    </div>
  )
}
