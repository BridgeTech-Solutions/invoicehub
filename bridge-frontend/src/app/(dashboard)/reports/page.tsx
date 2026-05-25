'use client'

import { useState } from 'react'
import {
  Download, FileText, TrendingUp, Users, Tag,
  AlertTriangle, CreditCard, Receipt, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  type TooltipProps,
} from 'recharts'
import {
  useRevenue, useRevenueByClient, useRevenueByCategory,
  useUnpaid, usePayments, useTaxSummary,
} from '@/features/reports/hooks'
import { downloadCsv, downloadPdf } from '@/features/reports/api'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatDate, getInitials } from '@/lib/utils'
import { ROUTES, STATUS_LABELS } from '@/lib/constants'
import type { ReportRange } from '@/features/reports/types'
import Link from 'next/link'

// ─── Constantes ────────────────────────────────────────────────

const MONTH_SHORT: Record<string, string> = {
  '01':'Jan','02':'Fév','03':'Mar','04':'Avr','05':'Mai','06':'Jun',
  '07':'Jul','08':'Aoû','09':'Sep','10':'Oct','11':'Nov','12':'Déc',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', check: 'Chèque',
  mobile_money: 'Mobile Money', card: 'Carte',
}

const TABS = [
  { id: 'revenue',     label: "Chiffre d'affaires", icon: TrendingUp   },
  { id: 'by-client',  label: 'Par client',          icon: Users        },
  { id: 'by-category',label: 'Par catégorie',        icon: Tag          },
  { id: 'unpaid',     label: 'Impayés',              icon: AlertTriangle },
  { id: 'payments',   label: 'Encaissements',        icon: CreditCard   },
  { id: 'tax',        label: 'Récap TVA',            icon: Receipt      },
] as const

type TabId = typeof TABS[number]['id']

const CSV_ENDPOINTS: Record<TabId, { endpoint: string; filename: string }> = {
  'revenue':     { endpoint: 'revenue',      filename: 'rapport-ca-mensuel.csv'    },
  'by-client':   { endpoint: 'by-client',    filename: 'rapport-ca-clients.csv'    },
  'by-category': { endpoint: 'by-category',  filename: 'rapport-ca-categories.csv' },
  'unpaid':      { endpoint: 'unpaid',       filename: 'rapport-impayes.csv'       },
  'payments':    { endpoint: 'payments',     filename: 'rapport-encaissements.csv' },
  'tax':         { endpoint: 'tax-summary',  filename: 'rapport-tva.csv'           },
}

const PDF_ENDPOINTS: Record<TabId, { endpoint: string; filename: string }> = {
  'revenue':     { endpoint: 'revenue',      filename: 'rapport-ca-mensuel.pdf'    },
  'by-client':   { endpoint: 'by-client',    filename: 'rapport-ca-clients.pdf'    },
  'by-category': { endpoint: 'by-category',  filename: 'rapport-ca-categories.pdf' },
  'unpaid':      { endpoint: 'unpaid',       filename: 'rapport-impayes.pdf'       },
  'payments':    { endpoint: 'payments',     filename: 'rapport-encaissements.pdf' },
  'tax':         { endpoint: 'tax-summary',  filename: 'rapport-tva.pdf'           },
}

// ─── Helpers ───────────────────────────────────────────────────

function fmt(n: number | string) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(Number(n)))
}

function daysOverdue(dueDate: string | Date): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000)
}

function SkeletonTable({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div style={{ overflowX: 'auto' }} aria-hidden="true">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} style={{ padding: '12px 10px' }}>
                  <div style={{ height: 12, width: c === 0 ? 140 : 80, background: 'var(--border)', borderRadius: 3 }} className="animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>{label}</p>
    </div>
  )
}

// ─── Th / Td helpers ──────────────────────────────────────────

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' }}>
    {children}
  </th>
)
const TD = ({ children, right, mono, bold, style }: { children: React.ReactNode; right?: boolean; mono?: boolean; bold?: boolean; style?: React.CSSProperties }) => (
  <td style={{ padding: '11px 10px', fontSize: 13, textAlign: right ? 'right' : 'left', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontWeight: bold ? 700 : 400, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', whiteSpace: mono ? 'nowrap' : undefined, ...style }}>
    {children}
  </td>
)
const TotalRow = ({ children }: { children: React.ReactNode }) => (
  <tr style={{ background: 'var(--surface-2)' }}>{children}</tr>
)
const TotalTD = ({ children, right, mono }: { children?: React.ReactNode; right?: boolean; mono?: boolean }) => (
  <td style={{ padding: '11px 10px', fontSize: 13, fontWeight: 700, textAlign: right ? 'right' : 'left', fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: 'var(--text-1)', borderTop: '2px solid var(--border)', whiteSpace: mono ? 'nowrap' : undefined }}>
    {children}
  </td>
)

// ─── Tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0c2340', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color ?? '#fff', margin: '1px 0', fontFamily: 'var(--font-mono)' }}>
          {p.name} : {fmt(p.value ?? 0)} XAF
        </p>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-mono)', margin: 0 }}>{value}</p>
    </div>
  )
}

// ─── Tab contents ──────────────────────────────────────────────

function RevenueTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = useRevenue(range)
  const rows     = data ?? []
  const totalHt  = rows.reduce((s, r) => s + r.totalHt,  0)
  const totalTax = rows.reduce((s, r) => s + r.totalTax, 0)
  const totalTtc = rows.reduce((s, r) => s + r.totalTtc, 0)
  const totalCnt = rows.reduce((s, r) => s + r.count,    0)

  const chartData = rows.map(r => ({
    label: (MONTH_SHORT[r.month.slice(5)] ?? r.month.slice(5)) + ' ' + r.month.slice(0, 4),
    ht:    r.totalHt,
    ttc:   r.totalTtc,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiCard label="Total HT"    value={`${fmt(totalHt)} XAF`}  color="var(--primary)" />
        <KpiCard label="Total TTC"   value={`${fmt(totalTtc)} XAF`} color="#7c3aed" />
        <KpiCard label="Nb factures" value={String(totalCnt)}        color="#059669" />
      </div>

      {/* Chart */}
      {isLoading ? (
        <div style={{ height: 240, background: 'var(--border)', borderRadius: 8, opacity: 0.3 }} className="animate-pulse" aria-hidden="true" />
      ) : chartData.length === 0 ? <EmptyState label="Aucune donnée sur cette période" /> : (
        <div style={{ height: 240 }} role="img" aria-label="Graphique CA mensuel HT et TTC">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rHt"  x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2D7DD2" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#2D7DD2" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rTtc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} dy={4} />
              <YAxis tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}k` : String(v)} tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend
                formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-display)' }}>{value}</span>}
                wrapperStyle={{ paddingTop: 8 }}
              />
              <Area type="monotone" dataKey="ht"  name="HT"  stroke="#2D7DD2" strokeWidth={2} fill="url(#rHt)"  dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="ttc" name="TTC" stroke="#7c3aed" strokeWidth={2} fill="url(#rTtc)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {isLoading ? <SkeletonTable cols={5} /> : rows.length === 0 ? null : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>Mois</TH>
              <TH right>Total HT</TH>
              <TH right>TVA</TH>
              <TH right>Total TTC</TH>
              <TH right>Nb factures</TH>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month}>
                  <TD>{(MONTH_SHORT[r.month.slice(5)] ?? r.month.slice(5)) + ' ' + r.month.slice(0, 4)}</TD>
                  <TD right mono>{fmt(r.totalHt)} XAF</TD>
                  <TD right mono style={{ color: 'var(--text-3)' } as React.CSSProperties}>{fmt(r.totalTax)} XAF</TD>
                  <TD right mono bold>{fmt(r.totalTtc)} XAF</TD>
                  <TD right>{r.count}</TD>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow>
                <TotalTD>Total</TotalTD>
                <TotalTD right mono>{fmt(totalHt)} XAF</TotalTD>
                <TotalTD right mono>{fmt(totalTax)} XAF</TotalTD>
                <TotalTD right mono>{fmt(totalTtc)} XAF</TotalTD>
                <TotalTD right>{totalCnt}</TotalTD>
              </TotalRow>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function ByClientTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = useRevenueByClient(range)
  const rows      = data ?? []
  const chartData = rows.slice(0, 10).map(r => ({ label: r.client.name.slice(0, 20), ttc: r.totalTtc }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isLoading ? (
        <div style={{ height: 200, background: 'var(--border)', borderRadius: 8, opacity: 0.3 }} className="animate-pulse" aria-hidden="true" />
      ) : chartData.length > 0 && (
        <div style={{ height: 200 }} role="img" aria-label="Graphique CA par client (top 10)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1_000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-2)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} width={130} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(45,125,210,0.05)' }} />
              <Bar dataKey="ttc" name="TTC" fill="#2D7DD2" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {isLoading ? <SkeletonTable cols={6} /> : rows.length === 0 ? <EmptyState label="Aucune donnée sur cette période" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>#</TH>
              <TH>Client</TH>
              <TH right>Total HT</TH>
              <TH right>Total TTC</TH>
              <TH right>Encaissé</TH>
              <TH right>Solde dû</TH>
              <TH right>Factures</TH>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.client.id}>
                  <TD><span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{i + 1}</span></TD>
                  <TD>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                        {getInitials(r.client.name)}
                      </span>
                      <Link href={`${ROUTES.CLIENTS}/${r.client.id}`} style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                        {r.client.name}
                      </Link>
                    </div>
                  </TD>
                  <TD right mono>{fmt(r.totalHt)} XAF</TD>
                  <TD right mono bold>{fmt(r.totalTtc)} XAF</TD>
                  <TD right mono style={{ color: '#16a34a' } as React.CSSProperties}>{fmt(r.amountPaid)} XAF</TD>
                  <TD right mono style={{ color: r.balanceDue > 0 ? '#ef4444' : 'var(--text-3)' } as React.CSSProperties}>{fmt(r.balanceDue)} XAF</TD>
                  <TD right>{r.invoiceCount}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ByCategoryTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = useRevenueByCategory(range)
  const rows     = data ?? []
  const total    = rows.reduce((s, r) => s + r.totalHt,       0)
  const totalTtc = rows.reduce((s, r) => s + r.totalTtc,      0)
  const totalCnt = rows.reduce((s, r) => s + r.invoiceCount,  0)
  const totalPct = rows.reduce((s, r) => s + (total > 0 ? Math.round(r.totalHt / total * 100) : 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isLoading ? <SkeletonTable cols={4} /> : rows.length === 0 ? <EmptyState label="Aucune donnée sur cette période" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>Catégorie</TH>
              <TH right>Total HT</TH>
              <TH right>Total TTC</TH>
              <TH right>% CA</TH>
              <TH right>Factures</TH>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const pct = total > 0 ? Math.round(r.totalHt / total * 100) : 0
                return (
                  <tr key={r.category}>
                    <TD><span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{r.category}</span></TD>
                    <TD right mono>{fmt(r.totalHt)} XAF</TD>
                    <TD right mono bold>{fmt(r.totalTtc)} XAF</TD>
                    <TD right>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${pct}% du chiffre d'affaires`}
                          style={{ width: 60, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}
                        >
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', minWidth: 32, textAlign: 'right' }}>
                          {pct}%
                        </span>
                      </div>
                    </TD>
                    <TD right>{r.invoiceCount}</TD>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <TotalRow>
                <TotalTD>Total</TotalTD>
                <TotalTD right mono>{fmt(total)} XAF</TotalTD>
                <TotalTD right mono>{fmt(totalTtc)} XAF</TotalTD>
                <TotalTD right mono>{totalPct}%</TotalTD>
                <TotalTD right>{totalCnt}</TotalTD>
              </TotalRow>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function UnpaidTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = useUnpaid(range)
  const rows     = data ?? []
  const totalDue = rows.reduce((s, r) => s + Number(r.balanceDue), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.length > 0 && (
        <div
          role="alert"
          style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} aria-hidden="true" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#dc2626' }}>
              {rows.length} facture{rows.length > 1 ? 's' : ''} impayée{rows.length > 1 ? 's' : ''}
            </span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#dc2626' }}>{fmt(totalDue)} XAF</span>
        </div>
      )}

      {isLoading ? <SkeletonTable cols={7} /> : rows.length === 0 ? <EmptyState label="Aucune facture impayée" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>Numéro</TH>
              <TH>Client</TH>
              <TH>Émission</TH>
              <TH>Échéance</TH>
              <TH right>Retard</TH>
              <TH right>Total TTC</TH>
              <TH right>Solde dû</TH>
              <TH>Statut</TH>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const overdue = new Date(r.dueDate) < new Date()
                const days    = overdue ? daysOverdue(r.dueDate) : 0
                return (
                  <tr key={r.id}>
                    <TD>
                      <Link href={`${ROUTES.INVOICES}/${r.id}`} style={{ textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600 }}>
                        {r.number}
                      </Link>
                    </TD>
                    <TD>{r.client.name}</TD>
                    <TD>{formatDate(r.issueDate)}</TD>
                    <TD>
                      <span style={{ color: overdue ? '#ef4444' : 'var(--text-2)', fontWeight: overdue ? 600 : 400 }}>
                        {formatDate(r.dueDate)}
                      </span>
                    </TD>
                    <TD right>
                      {overdue ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ef4444' }}>
                          <AlertTriangle size={11} aria-hidden="true" />
                          J+{days}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
                      )}
                    </TD>
                    <TD right mono>{fmt(r.totalTtc)} XAF</TD>
                    <TD right mono bold style={{ color: '#ef4444' } as React.CSSProperties}>{fmt(r.balanceDue)} XAF</TD>
                    <TD>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', background: r.status === 'overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: r.status === 'overdue' ? '#ef4444' : '#d97706' }}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </TD>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <TotalRow>
                <TotalTD>Total dû</TotalTD>
                <TotalTD />
                <TotalTD />
                <TotalTD />
                <TotalTD />
                <TotalTD />
                <TotalTD right mono>{fmt(totalDue)} XAF</TotalTD>
                <TotalTD />
              </TotalRow>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function PaymentsTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = usePayments(range)
  const rows  = data ?? []
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.length > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#059669' }}>{rows.length} encaissement{rows.length > 1 ? 's' : ''}</span>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#059669' }}>{fmt(total)} XAF</span>
        </div>
      )}

      {isLoading ? <SkeletonTable cols={6} /> : rows.length === 0 ? <EmptyState label="Aucun encaissement sur cette période" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>Date</TH>
              <TH>Facture</TH>
              <TH>Client</TH>
              <TH>Mode</TH>
              <TH>Référence</TH>
              <TH right>Montant</TH>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <TD>{formatDate(r.paymentDate)}</TD>
                  <TD>
                    <Link href={`${ROUTES.INVOICES}/${r.invoiceId}`} style={{ textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600 }}>
                      {r.invoice.number}
                    </Link>
                  </TD>
                  <TD>{r.invoice.client.name}</TD>
                  <TD>{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</TD>
                  <TD><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>{r.reference ?? '—'}</span></TD>
                  <TD right mono bold style={{ color: '#16a34a' } as React.CSSProperties}>+{fmt(r.amount)} XAF</TD>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow>
                <TotalTD>Total encaissé</TotalTD>
                <TotalTD /><TotalTD /><TotalTD /><TotalTD />
                <TotalTD right mono>{fmt(total)} XAF</TotalTD>
              </TotalRow>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function TaxTab({ range }: { range: ReportRange }) {
  const { data, isLoading } = useTaxSummary(range)
  const rows     = data ?? []
  const totalHt  = rows.reduce((s, r) => s + r.totalHt,  0)
  const totalTax = rows.reduce((s, r) => s + r.totalTax, 0)
  const totalTtc = rows.reduce((s, r) => s + r.totalTtc, 0)
  const totalCnt = rows.reduce((s, r) => s + r.count,    0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <KpiCard label="Base HT totale" value={`${fmt(totalHt)} XAF`}  color="var(--primary)" />
          <KpiCard label="TVA collectée"  value={`${fmt(totalTax)} XAF`} color="#7c3aed" />
        </div>
      )}

      {isLoading ? <SkeletonTable cols={5} /> : rows.length === 0 ? <EmptyState label="Aucune donnée TVA sur cette période" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TH>Période</TH>
              <TH right>Base HT</TH>
              <TH right>TVA collectée (19,25%)</TH>
              <TH right>Total TTC</TH>
              <TH right>Nb factures</TH>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.period}>
                  <TD><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{r.period}</span></TD>
                  <TD right mono>{fmt(r.totalHt)} XAF</TD>
                  <TD right mono bold style={{ color: '#7c3aed' } as React.CSSProperties}>{fmt(r.totalTax)} XAF</TD>
                  <TD right mono>{fmt(r.totalTtc)} XAF</TD>
                  <TD right>{r.count}</TD>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow>
                <TotalTD>Total</TotalTD>
                <TotalTD right mono>{fmt(totalHt)} XAF</TotalTD>
                <TotalTD right mono>{fmt(totalTax)} XAF</TotalTD>
                <TotalTD right mono>{fmt(totalTtc)} XAF</TotalTD>
                <TotalTD right>{totalCnt}</TotalTD>
              </TotalRow>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────

export default function ReportsPage() {
  const { can } = usePermission()
  const currentYear = new Date().getFullYear()
  const [tab,          setTab]          = useState<TabId>('revenue')
  const [year,         setYear]         = useState(currentYear)
  const [quarter,      setQuarter]      = useState<number | undefined>(undefined)
  const [exporting,    setExporting]    = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const range: ReportRange = { year, ...(quarter ? { quarter } : {}) }
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  async function handleExport() {
    const { endpoint, filename } = CSV_ENDPOINTS[tab]
    setExporting(true)
    try {
      await downloadCsv(endpoint, filename, range)
      toast.success('Export CSV téléchargé')
    } catch {
      toast.error("Erreur lors de l'export")
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    const { endpoint, filename } = PDF_ENDPOINTS[tab]
    setExportingPdf(true)
    try {
      await downloadPdf(endpoint, filename, range)
      toast.success('Rapport PDF téléchargé')
    } catch {
      toast.error('Erreur lors de la génération PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  if (!can('report', 'read')) return <AccessDenied message="Vous n'avez pas accès aux rapports financiers." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Rapports financiers"
        description="Analyses, suivi des impayés et export CSV / PDF"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              aria-label="Exporter le rapport en PDF"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: exportingPdf ? 'not-allowed' : 'pointer', opacity: exportingPdf ? 0.7 : 1, boxShadow: '0 3px 8px rgba(45,125,210,0.25)', transition: 'opacity 0.15s' }}
            >
              {exportingPdf
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <FileText size={14} aria-hidden="true" />}
              {exportingPdf ? 'Génération…' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              aria-label="Exporter le rapport en CSV"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1, transition: 'opacity 0.15s' }}
            >
              {exporting
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <Download size={14} aria-hidden="true" />}
              {exporting ? 'Export…' : 'Export CSV'}
            </button>
          </div>
        }
      />

      {/* Filtres */}
      <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }} aria-hidden="true">
          Période :
        </span>

        {/* Année */}
        <label htmlFor="report-year" className="sr-only">Année</label>
        <select
          id="report-year"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          aria-label="Filtrer par année"
          style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-body)', cursor: 'pointer' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Trimestre */}
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Filtrer par trimestre">
          {([
            { label: "Toute l'année", value: undefined },
            { label: 'T1', value: 1 },
            { label: 'T2', value: 2 },
            { label: 'T3', value: 3 },
            { label: 'T4', value: 4 },
          ] as const).map(({ label, value }) => {
            const active = quarter === value
            return (
              <button
                key={label}
                type="button"
                onClick={() => setQuarter(value)}
                aria-pressed={active}
                style={{ padding: '5px 11px', borderRadius: 'var(--radius-md)', border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent', background: active ? 'rgba(45,125,210,0.08)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-3)', fontSize: 12, fontWeight: active ? 600 : 400, fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabs + contenu */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Sections du rapport"
          style={{ borderBottom: '1px solid var(--border)', display: 'flex', overflowX: 'auto', padding: '0 4px' }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={active}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: active ? 700 : 500, color: active ? 'var(--primary)' : 'var(--text-3)', borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 24px' }}>
          {TABS.map(({ id }) => (
            <div
              key={id}
              id={`panel-${id}`}
              role="tabpanel"
              aria-labelledby={`tab-${id}`}
              hidden={tab !== id}
            >
              {tab === id && (
                <>
                  {id === 'revenue'     && <RevenueTab    range={range} />}
                  {id === 'by-client'   && <ByClientTab   range={range} />}
                  {id === 'by-category' && <ByCategoryTab range={range} />}
                  {id === 'unpaid'      && <UnpaidTab      range={range} />}
                  {id === 'payments'    && <PaymentsTab    range={range} />}
                  {id === 'tax'         && <TaxTab         range={range} />}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
