'use client'

import { Wallet, AlertCircle, GitMerge, Upload } from 'lucide-react'
import Link from 'next/link'
import { useBankSummary } from '../hooks'
import { ROUTES } from '@/lib/constants'

interface KpiCardProps {
  icon:     React.ElementType
  iconColor: string
  iconBg:   string
  label:    string
  value:    React.ReactNode
  href?:    string
  loading?: boolean
}

function KpiCard({ icon: Icon, iconColor, iconBg, label, value, href, loading }: KpiCardProps) {
  const content = (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '16px 20px',
      cursor: href ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s, transform 0.15s',
      textDecoration: 'none',
    }}
    onMouseEnter={e => {
      if (href) {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
      }
    }}
    onMouseLeave={e => {
      ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      ;(e.currentTarget as HTMLElement).style.transform = ''
    }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} style={{ color: iconColor }} strokeWidth={1.8} />
      </div>
      <div style={{ minWidth: 0 }}>
        {loading ? (
          <>
            <div style={{ height: 20, width: 80, borderRadius: 6, background: 'var(--border)', marginBottom: 5 }} />
            <div style={{ height: 12, width: 100, borderRadius: 4, background: 'var(--border)' }} />
          </>
        ) : (
          <>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-1)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}>
              {value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, fontWeight: 500 }}>
              {label}
            </div>
          </>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link>
  }
  return content
}

export function BankSummaryKpiCards() {
  const { data, isLoading } = useBankSummary()

  const totalBalance = data?.totalBalance ?? 0
  const formatted = totalBalance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 12,
      marginBottom: 24,
    }}>
      <KpiCard
        icon={Wallet}
        iconColor="var(--primary)"
        iconBg="rgba(45,125,210,0.10)"
        label="Solde total (XAF)"
        value={isLoading ? null : `${formatted}`}
        loading={isLoading}
      />
      <KpiCard
        icon={AlertCircle}
        iconColor="#d97706"
        iconBg="#fef3c7"
        label="Non rapprochées"
        value={isLoading ? null : data?.unreconciledCount ?? 0}
        href={data?.unreconciledCount ? `${ROUTES.BANK_TRANSACTIONS}?reconciled=false` : undefined}
        loading={isLoading}
      />
      <KpiCard
        icon={GitMerge}
        iconColor="#9333ea"
        iconBg="#f3e8ff"
        label="Sessions ouvertes"
        value={isLoading ? null : data?.openReconciliations ?? 0}
        href={data?.openReconciliations ? ROUTES.BANK_RECONCILIATIONS : undefined}
        loading={isLoading}
      />
      <KpiCard
        icon={Upload}
        iconColor="#16a34a"
        iconBg="#dcfce7"
        label="Imports ce mois"
        value={isLoading ? null : data?.importsThisMonth ?? 0}
        loading={isLoading}
      />
    </div>
  )
}
