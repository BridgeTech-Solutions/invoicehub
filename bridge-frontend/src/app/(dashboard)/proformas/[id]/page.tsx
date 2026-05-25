'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Calendar, Clock, User, FileText,
  Pencil, Building2, Mail,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { AccessDenied } from '@/components/ui/AccessDenied'
import { useProforma } from '@/features/proformas/hooks'
import { ProformaActionsMenu } from '@/features/proformas/components/ProformaActionsMenu'
import { ProformaForm } from '@/features/proformas/components/ProformaForm'
import { StatusTimeline } from '@/features/proformas/components/StatusTimeline'
import { TotalsPanel } from '@/components/document/TotalsPanel'
import { lineToFormLine } from '@/lib/document-math'
import { formatDate, getInitials } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ROUTES, STATUS_LABELS } from '@/lib/constants'
import type { ProformaStatus, DiscountType } from '@/features/proformas/types'

// ─── Status styles ──────────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:    { background: 'rgba(148,163,184,0.15)', color: '#64748b'  },
  sent:     { background: 'rgba(59,130,246,0.1)',   color: '#2563eb'  },
  accepted: { background: 'rgba(16,185,129,0.1)',   color: '#059669'  },
  rejected: { background: 'rgba(244,63,94,0.1)',    color: '#e11d48'  },
  expired:  { background: 'rgba(249,115,22,0.1)',   color: '#ea580c'  },
}

function StatusBadge({ status }: { status: ProformaStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  return (
    <span style={{ ...s, fontSize: 12.5, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', padding: '5px 14px', borderRadius: 20, textTransform: 'uppercase' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 13, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div style={{ height: 28, width: 280, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24, height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
      </div>
    </div>
  )
}

// ─── Detail view ────────────────────────────────────────────────

function ProformaDetailView({ id }: { id: string }) {
  const { format } = useCurrency()
  const { data: proforma, isLoading } = useProforma(id)

  if (isLoading) return <Skeleton />

  if (!proforma) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Proforma introuvable</p>
      <Link href={ROUTES.PROFORMAS} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
        ← Retour aux proformas
      </Link>
    </div>
  )

  const formLines = proforma.lines.map(lineToFormLine)
  const isExpired = proforma.status === 'sent' && new Date(proforma.validUntil) < new Date()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Breadcrumb */}
      <Link href={ROUTES.PROFORMAS} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Retour aux proformas
      </Link>

      {/* Header card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                <span className="doc-number">{proforma.number}</span>
              </h1>
              <StatusBadge status={isExpired ? 'expired' : proforma.status} />
            </div>
            {proforma.subject && (
              <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>{proforma.subject}</p>
            )}
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                <Calendar size={13} /> Émise le {formatDate(proforma.issueDate)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: isExpired ? '#ef4444' : 'var(--text-3)' }}>
                <Clock size={13} /> Valide jusqu'au {formatDate(proforma.validUntil)}
              </div>
              {proforma.lastSentAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-3)' }}>
                  <Mail size={13} /> Envoyée le {formatDate(proforma.lastSentAt)}
                </div>
              )}
            </div>
          </div>
          {/* Total TTC highlight */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total TTC</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)', margin: 0, letterSpacing: '-0.01em' }}>
              {format(Number(proforma.totalTtc))}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <ProformaActionsMenu proforma={proforma} />
        </div>
      </div>

      {/* Body grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lines table */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
              Lignes de produits / services
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    {['#', 'Désignation', 'Qté', 'Unité', 'P.U. HT', 'Remise', 'TVA %', 'Total HT'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
                        background: 'var(--surface-2)', borderBottom: '2px solid var(--border)',
                        textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proforma.lines.map((line, i) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 10px', fontSize: 12, color: 'var(--text-3)', width: 32 }}>{i + 1}</td>
                      <td style={{ padding: '11px 10px', minWidth: 180 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{line.designation}</p>
                        {line.description && (
                          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: line.description }} />
                        )}
                      </td>
                      <td style={{ padding: '11px 10px', fontSize: 13, color: 'var(--text-2)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {Number(line.quantity)}
                      </td>
                      <td style={{ padding: '11px 10px', fontSize: 12.5, color: 'var(--text-3)', textAlign: 'left' }}>
                        {line.unit}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Number(line.unitPriceHt))}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: Number(line.discountValue) > 0 ? '#d97706' : 'var(--text-3)' }}>
                        {line.discountType === 'none' ? '—' :
                          line.discountType === 'percentage' ? `${Number(line.discountValue)}%` :
                          format(Number(line.discountValue))
                        }
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {Number(line.taxRate)}%
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                        {new Intl.NumberFormat('fr-FR').format(Math.round(Number(line.netHt)))} XAF
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals panel below table */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ width: 320 }}>
                <TotalsPanel
                  lines={formLines}
                  globalDiscountType={proforma.globalDiscountType as DiscountType}
                  globalDiscountValue={Number(proforma.globalDiscountValue)}
                  readonly
                />
              </div>
            </div>
          </div>

          {/* Notes & conditions */}
          {(proforma.notes || proforma.paymentConditions || proforma.deliveryDelay || proforma.warranty) && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Conditions & Notes
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {proforma.paymentConditions && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Conditions de paiement</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{proforma.paymentConditions}</p>
                  </div>
                )}
                {proforma.deliveryDelay && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Délai de livraison</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{proforma.deliveryDelay}</p>
                  </div>
                )}
                {proforma.warranty && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Garantie</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{proforma.warranty}</p>
                  </div>
                )}
                {proforma.notes && (
                  <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes internes</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{proforma.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Compte bancaire de réception */}
          {proforma.bankAccount && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>Compte de réception</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{proforma.bankAccount.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{proforma.bankAccount.bankName}</p>
                {proforma.bankAccount.accountNumber && <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{proforma.bankAccount.accountNumber}</p>}
                {proforma.bankAccount.iban && <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>IBAN : {proforma.bankAccount.iban}</p>}
                {proforma.bankAccount.swiftBic && <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>SWIFT : {proforma.bankAccount.swiftBic}</p>}
              </div>
            </div>
          )}

          {/* Client card */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Client
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(45,125,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {getInitials(proforma.client.name)}
              </span>
              <div>
                <Link href={`${ROUTES.CLIENTS}/${proforma.clientId}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{proforma.client.name}</p>
                </Link>
                {proforma.client.email && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{proforma.client.email}</p>
                )}
              </div>
            </div>
            <Link
              href={`${ROUTES.CLIENTS}/${proforma.clientId}`}
              style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
            >
              Voir la fiche client →
            </Link>
          </div>

          {/* Meta card */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 12 }}>
              Informations
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Créée par</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>
                  {proforma.createdBy.firstName} {proforma.createdBy.lastName}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Créée le</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{formatDate(proforma.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Modifiée le</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{formatDate(proforma.updatedAt)}</span>
              </div>
              {proforma.pdfGeneratedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>PDF généré le</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{formatDate(proforma.pdfGeneratedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          {proforma.statusHistory && proforma.statusHistory.length > 0 && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 14 }}>
                Historique
              </p>
              <StatusTimeline history={proforma.statusHistory} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page (edit or detail) ──────────────────────────────────────

export default function ProformaPage() {
  const { can } = usePermission()
  const { id }         = useParams<{ id: string }>()
  const searchParams   = useSearchParams()
  const isEditMode     = searchParams.get('mode') === 'edit'
  const { data: proforma, isLoading } = useProforma(id)

  if (!can('proforma', 'read')) return <AccessDenied message="Vous n'avez pas accès aux devis." />

  if (isEditMode) {
    if (isLoading) return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 13, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card" style={{ padding: 24, height: 200 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
        </div>
      </div>
    )
    if (proforma?.status !== 'draft') {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 8 }}>
            Cette proforma ne peut plus être modifiée (statut : {STATUS_LABELS[proforma?.status ?? ''] ?? proforma?.status}).
          </p>
          <Link href={`${ROUTES.PROFORMAS}/${id}`} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            ← Retour au détail
          </Link>
        </div>
      )
    }
    return <ProformaForm proforma={proforma} />
  }

  return <ProformaDetailView id={id} />
}
