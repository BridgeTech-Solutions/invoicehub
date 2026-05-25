'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, TrendingDown, Plus, History } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { RichEmptyState } from '@/components/ui/RichEmptyState'
import { StockStatusBadge } from '@/features/stock/components/StockStatusBadge'
import { AdjustStockDrawer } from '@/features/stock/components/AdjustStockDrawer'
import { useStockAlerts } from '@/features/stock/hooks'
import { ROUTES } from '@/lib/constants'
import type { StockAlert } from '@/features/stock/types'

export default function StockAlertsPage() {
  const { can } = usePermission()
  const { data: alerts = [], isLoading } = useStockAlerts()
  const [drawer, setDrawer] = useState<StockAlert | null>(null)

  const ruptures = alerts.filter(a => a.stockStatus === 'rupture')
  const lowStock = alerts.filter(a => a.stockStatus === 'bas')

  if (!can('stock', 'read')) return <AccessDenied message="Vous n'avez pas accès au module de gestion des stocks." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Alertes de stock"
        description={alerts.length > 0
          ? `${alerts.length} produit${alerts.length !== 1 ? 's' : ''} nécessitant une attention`
          : 'Tous les stocks sont au niveau normal'}
      />

      {/* Summary chips */}
      {!isLoading && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { count: ruptures.length, label: 'Rupture de stock', color: '#dc2626', bg: 'rgba(239,68,68,0.08)', icon: TrendingDown },
            { count: lowStock.length, label: 'Stock bas',        color: '#d97706', bg: 'rgba(217,119,6,0.08)',  icon: AlertTriangle },
          ].map((item) => (
            <div key={item.label} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
              <span style={{ width: 36, height: 36, borderRadius: 8, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                <item.icon size={16} style={{ color: item.color }} />
              </span>
              <div>
                <p style={{ fontSize: 20, fontWeight: 700, color: item.count > 0 ? item.color : 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                  {item.count}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              {[180, 80, 80, 80, 60].map((w, j) => (
                <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              ))}
              <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px' }}>
          <RichEmptyState
            icon={AlertTriangle}
            title="Aucune alerte"
            description="Tous les produits sont à un niveau de stock normal. Continuez à surveiller régulièrement."
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Alertes de stock">
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Stock actuel</th>
                  <th scope="col">Seuil min</th>
                  <th scope="col">Déficit</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <Link href={`${ROUTES.STOCK_LEVELS}/${alert.id}/history`} style={{ textDecoration: 'none' }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{alert.name}</p>
                      </Link>
                      {alert.reference && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{alert.reference}</p>}
                      {alert.category && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{alert.category.name}</p>}
                    </td>
                    <td><StockStatusBadge status={alert.stockStatus} /></td>
                    <td>
                      <span style={{
                        fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)',
                        color: alert.stockStatus === 'rupture' ? '#dc2626' : '#d97706',
                      }}>
                        {Number(alert.stockQuantity)}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      {alert.stockMinLevel != null ? Number(alert.stockMinLevel) : '—'}
                    </td>
                    <td>
                      {alert.deficit > 0 && (
                        <span style={{
                          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                          color: '#dc2626', background: 'rgba(239,68,68,0.08)',
                          padding: '3px 8px', borderRadius: 20,
                        }}>
                          -{alert.deficit}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link
                          href={`${ROUTES.STOCK_LEVELS}/${alert.id}/history`}
                          aria-label={`Historique de ${alert.name}`}
                          style={{
                            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface)',
                            color: 'var(--text-2)', textDecoration: 'none',
                          }}
                        >
                          <History size={13} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDrawer(alert)}
                          aria-label={`Ajuster le stock de ${alert.name}`}
                          style={{
                            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 6, border: '1.5px solid var(--primary)', background: 'rgba(45,125,210,0.07)',
                            color: 'var(--primary)', cursor: 'pointer',
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drawer && (
        <AdjustStockDrawer
          productId={drawer.id}
          productName={drawer.name}
          currentQty={Number(drawer.stockQuantity)}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
