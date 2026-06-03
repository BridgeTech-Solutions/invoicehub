'use client'

import Link from 'next/link'
import { useDashboardKpis } from '../hooks'
import { ROUTES } from '@/lib/constants'
import { getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'

// ─── Skeleton ─────────────────────────────────────────────────
function SupplierSkeleton() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ height: 16, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 14, width: 60, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4, marginBottom: 5 }} className="animate-pulse" />
            <div style={{ height: 10, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
          <div style={{ height: 13, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────
/**
 * TopSuppliers — liste classée des fournisseurs par volume d'achats.
 * Miroir de TopClientsTable, accent fournisseur (violet --j-purchase).
 */
export function TopSuppliers() {
  const { format } = useCurrency()
  const { data, isLoading } = useDashboardKpis()

  if (isLoading) return <SupplierSkeleton />
  if (!data) return null

  const suppliers = data.topSuppliers
  const maxPurchases = suppliers[0]?.totalPurchases ?? 0

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h2 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
          Top fournisseurs
        </h2>
        <Link
          href={ROUTES.SUPPLIERS}
          aria-label="Voir tous les fournisseurs"
          style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
        >
          Voir tout →
        </Link>
      </div>

      {suppliers.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune donnée disponible</p>
        </div>
      ) : (
        <div>
          {suppliers.map((supplier, idx) => {
            const pct = maxPurchases > 0 ? Math.round((supplier.totalPurchases / maxPurchases) * 100) : 0

            return (
              <div
                key={supplier.supplierId}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Rank + avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 40, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 16, textAlign: 'right' }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--j-purchase-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: 'var(--j-purchase)', flexShrink: 0,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {getInitials(supplier.supplierName)}
                    </span>
                  </div>

                  {/* Name + progress */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`${ROUTES.SUPPLIERS}/${supplier.supplierId}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }} className="truncate">
                        {supplier.supplierName}
                      </p>
                    </Link>
                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }} aria-hidden="true">
                      <div
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Part des achats — ${supplier.supplierName} : ${pct}% du principal fournisseur`}
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 2,
                          background: 'var(--j-purchase)',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Purchases */}
                  <span className="amount" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, marginLeft: 8 }}>
                    {format(supplier.totalPurchases)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
