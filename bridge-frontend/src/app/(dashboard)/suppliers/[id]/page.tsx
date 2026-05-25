'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Building2, Mail, Phone, Globe, MapPin,
  Pencil, ShoppingCart, FileInput, Banknote,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSupplier } from '@/features/suppliers/hooks'
import { formatDate } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES } from '@/lib/constants'

function InfoRow({ label, value }: { label: string; value?: string | null | number }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
    </div>
  )
}

function StatCard({ label, value, color, href }: { label: string; value: string; color?: string; href?: string }) {
  const content = (
    <div className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${color ?? 'var(--primary)'}`, cursor: href ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}>
      <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link> : content
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { format } = useCurrency()
  const { id } = use(params)
  const router  = useRouter()
  const { data: supplier, isLoading } = useSupplier(id)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 24, width: 200, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[1, 2, 3].map(i => <div key={i} className="card animate-pulse" style={{ height: 80 }} />)}
        </div>
        <div className="card animate-pulse" style={{ height: 300 }} />
      </div>
    )
  }

  if (!supplier) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 920, animation: 'page-in 0.2s ease' }}>
      <div>
        <Link href={ROUTES.SUPPLIERS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <ChevronLeft size={14} /> Fournisseurs
        </Link>
        <PageHeader
          title={supplier.name}
          description={`Fournisseur · Depuis ${formatDate(supplier.createdAt)}`}
          actions={
            <button onClick={() => router.push(`${ROUTES.SUPPLIERS}/${id}/edit`)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              <Pencil size={13} /> Modifier
            </button>
          }
        />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label="Total achats" value={format(supplier.totalPurchases ?? 0)} color="var(--primary)" href={`${ROUTES.PURCHASE_ORDERS}?supplierId=${id}`} />
        <StatCard label="Solde dû" value={format(supplier.totalDue ?? 0)} color={(supplier.totalDue ?? 0) > 0 ? '#dc2626' : '#16a34a'} href={`${ROUTES.SUPPLIER_INVOICES}?supplierId=${id}`} />
        <StatCard label="Délai paiement" value={`${supplier.paymentTermDays} jours`} color="#d97706" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Informations */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
            Informations
          </h3>
          <div>
            <InfoRow label="NIU" value={supplier.taxNumber} />
            <InfoRow label="RCCM" value={supplier.rccm} />
            <InfoRow label="Devise" value={supplier.currency} />
            <InfoRow label="Compte SYSCOHADA" value={supplier.accountingAccount} />
            <InfoRow label="Statut" value={supplier.isActive ? 'Actif' : 'Inactif'} />
            <InfoRow label="Créé le" value={formatDate(supplier.createdAt)} />
          </div>
        </div>

        {/* Contact */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
            Contact
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {supplier.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mail size={13} style={{ color: 'var(--primary)' }} />
                </div>
                <a href={`mailto:${supplier.email}`} style={{ fontSize: 13.5, color: 'var(--text-1)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-1)')}>{supplier.email}</a>
              </div>
            )}
            {supplier.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={13} style={{ color: 'var(--primary)' }} />
                </div>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{supplier.phone}</span>
              </div>
            )}
            {(supplier.city || supplier.address) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={13} style={{ color: 'var(--primary)' }} />
                </div>
                <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>
                  {[supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {supplier.website && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(45,125,210,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={13} style={{ color: 'var(--primary)' }} />
                </div>
                <a href={supplier.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: 'var(--text-1)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-1)')}>{supplier.website}</a>
              </div>
            )}
            {!supplier.email && !supplier.phone && !supplier.city && !supplier.website && (
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucun contact renseigné</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Bons de commande', icon: ShoppingCart, href: `${ROUTES.PURCHASE_ORDERS}?supplierId=${id}`, count: supplier._count?.purchaseOrders },
          { label: 'Factures fournisseur', icon: FileInput, href: `${ROUTES.SUPPLIER_INVOICES}?supplierId=${id}`, count: supplier._count?.supplierInvoices },
          { label: 'Nouvelle commande', icon: ShoppingCart, href: `${ROUTES.PURCHASE_ORDERS}/new?supplierId=${id}`, count: undefined, primary: true },
        ].map(({ label, icon: Icon, href, count, primary }) => (
          <Link key={label} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 'var(--radius-lg)', border: `1.5px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, background: primary ? 'rgba(45,125,210,0.05)' : 'var(--surface)', textDecoration: 'none', transition: 'all 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = primary ? 'rgba(45,125,210,0.1)' : 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = primary ? 'rgba(45,125,210,0.05)' : 'var(--surface)')}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: primary ? 'rgba(45,125,210,0.12)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} style={{ color: primary ? 'var(--primary)' : 'var(--text-3)' }} />
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: primary ? 'var(--primary)' : 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{label}</p>
              {count !== undefined && <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{count} document{count !== 1 ? 's' : ''}</p>}
            </div>
          </Link>
        ))}
      </div>

      {/* Notes */}
      {supplier.notes && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Notes</h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{supplier.notes}</p>
        </div>
      )}
    </div>
  )
}
