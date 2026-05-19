'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { StockKpiCards } from '@/features/stock/components/StockKpiCards'
import { RecentMovementsTable } from '@/features/stock/components/RecentMovementsTable'
import { ROUTES } from '@/lib/constants'
import Link from 'next/link'
import { Layers, AlertTriangle, ArrowRightLeft } from 'lucide-react'

export default function StockPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Gestion des stocks"
        description="Vue d'ensemble des niveaux, valorisation et mouvements de stock"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={ROUTES.STOCK_ALERTS}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, textDecoration: 'none',
                fontFamily: 'var(--font-display)', fontWeight: 500,
              }}
            >
              <AlertTriangle size={14} aria-hidden /> Alertes
            </Link>
            <Link
              href={ROUTES.STOCK_MOVEMENTS}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', fontSize: 13.5, textDecoration: 'none',
                fontFamily: 'var(--font-display)', fontWeight: 500,
              }}
            >
              <ArrowRightLeft size={14} aria-hidden /> Mouvements
            </Link>
            <Link
              href={ROUTES.STOCK_LEVELS}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--primary)', color: '#fff',
                textDecoration: 'none', fontSize: 13.5,
                fontFamily: 'var(--font-display)', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(45,125,210,0.3)',
              }}
            >
              <Layers size={14} aria-hidden /> Niveaux de stock
            </Link>
          </div>
        }
      />

      <StockKpiCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentMovementsTable />

        {/* Quick links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              href:  ROUTES.STOCK_LEVELS,
              icon:  Layers,
              title: 'Niveaux de stock',
              desc:  'Consultez les quantités, valeurs CMUP et seuils par produit',
              color: '#2D7DD2',
              bg:    'rgba(45,125,210,0.08)',
            },
            {
              href:  ROUTES.STOCK_MOVEMENTS,
              icon:  ArrowRightLeft,
              title: 'Journal des mouvements',
              desc:  'Historique complet de toutes les entrées et sorties de stock',
              color: '#7c3aed',
              bg:    'rgba(124,58,237,0.08)',
            },
            {
              href:  ROUTES.STOCK_ALERTS,
              icon:  AlertTriangle,
              title: 'Alertes de stock',
              desc:  'Produits en rupture ou sous le seuil minimum d\'alerte',
              color: '#d97706',
              bg:    'rgba(217,119,6,0.08)',
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: 'none' }}
            >
              <div
                className="card card-hover"
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 40, height: 40, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <item.icon size={18} style={{ color: item.color }} />
                </span>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', marginBottom: 2 }}>
                    {item.title}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{item.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
