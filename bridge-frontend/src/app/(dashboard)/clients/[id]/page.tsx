'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useId } from 'react'
import {
  ChevronLeft, Pencil, Archive, FileText, AlertTriangle,
  Mail, Phone, MapPin, Building2, User, Clock, TrendingUp,
  Hash, CreditCard, FileCheck, StickyNote, Loader2,
} from 'lucide-react'
import { useClient, useClientSummary, useArchiveClient } from '@/features/clients/hooks'
import { useInvoices } from '@/features/invoices/hooks'
import { ClientInvoiceHistory } from '@/features/clients/components/ClientInvoiceHistory'
import { useAuthStore } from '@/features/auth/store'
import { ClientSummaryCard } from '@/features/clients/components/ClientSummaryCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, formatXAF, getInitials } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'

// ─── Confirm archive modal ─────────────────────────────────────

function ConfirmArchiveModal({
  name, isPending, onConfirm, onCancel,
}: { name: string; isPending: boolean; onConfirm: () => void; onCancel: () => void }) {
  const titleId    = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 28px 24px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(217,119,6,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} aria-hidden style={{ color: '#d97706' }} />
          </div>
          <div>
            <h3 id={titleId} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: '0 0 6px' }}>
              Archiver ce client
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Voulez-vous archiver <strong>{name}</strong> ? Le client ne sera plus actif mais son historique sera conservé.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', minHeight: 44, borderRadius: 'var(--radius-md)', background: '#d97706', color: '#fff', border: 'none', fontSize: 13.5, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.65 : 1 }}>
            {isPending && <Loader2 size={13} className="animate-spin" aria-hidden />}
            {isPending ? 'Archivage…' : 'Archiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Info row helper ───────────────────────────────────────────
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: 'var(--text-3)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

export default function ClientDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [showArchive, setShowArchive] = useState(false)

  const { data: client, isLoading }    = useClient(id)
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ clientId: id, limit: 10, page: 1 })
  const { can } = usePermission()
  const { user } = useAuthStore()
  const archiveMutation = useArchiveClient()
  const canSeeInternalNotes = user?.role === 'admin' || user?.role === 'commercial'

  // ─── Loading ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 14, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ height: 28, width: 280, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div className="card" style={{ padding: 24 }}>
          <div style={{ height: 60, background: 'var(--border)', borderRadius: 6, opacity: 0.5 }} className="animate-pulse" />
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Client introuvable</p>
        <Link href={ROUTES.CLIENTS} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
          ← Retour aux clients
        </Link>
      </div>
    )
  }

  const isActive = client.status === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Breadcrumb */}
      <Link
        href={ROUTES.CLIENTS}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
      >
        <ChevronLeft size={14} /> Retour aux clients
      </Link>

      {/* Header */}
      <PageHeader
        title={client.name}
        description={client.type === 'company' ? 'Entreprise' : 'Particulier'}
        actions={
          <>
            {can('client', 'create') && (
              <Link
                href={`${ROUTES.INVOICES}/new?clientId=${id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-2)', fontSize: 13.5,
                  textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 500,
                }}
              >
                <FileText size={14} /> Nouvelle facture
              </Link>
            )}
            {can('client', 'update') && (
              <button
                onClick={() => router.push(`${ROUTES.CLIENTS}/${id}/edit`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13.5,
                  fontFamily: 'var(--font-display)', fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(45,125,210,0.25)',
                }}
              >
                <Pencil size={14} /> Modifier
              </button>
            )}
          </>
        }
      />

      {/* Summary KPIs */}
      <ClientSummaryCard clientId={id} />

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left — Fiche client */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Identity card */}
          <div className="card" style={{ padding: '20px' }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <span style={{
                width: 60, height: 60, borderRadius: '50%',
                background: isActive ? 'rgba(45,125,210,0.1)' : 'var(--bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: isActive ? 'var(--primary)' : 'var(--text-3)',
                fontFamily: 'var(--font-display)', marginBottom: 10,
                border: `2px solid ${isActive ? 'rgba(45,125,210,0.2)' : 'var(--border)'}`,
              }}>
                {getInitials(client.name)}
              </span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>{client.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                {client.type === 'company'
                  ? <><Building2 size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12, color: 'var(--text-3)' }}>Entreprise</span></>
                  : <><User       size={12} style={{ color: 'var(--text-3)' }} /><span style={{ fontSize: 12, color: 'var(--text-3)' }}>Particulier</span></>
                }
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border)' }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                  background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.15)',
                  color: isActive ? '#16a34a' : '#64748b',
                }}>
                  {isActive ? 'Actif' : 'Archivé'}
                </span>
              </div>
            </div>

            {/* Details list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

              {/* Contact */}
              {client.email && (
                <InfoRow icon={<Mail size={14} />}>
                  <a href={`mailto:${client.email}`} style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 13 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)' }}
                  >{client.email}</a>
                </InfoRow>
              )}
              {client.phone && (
                <InfoRow icon={<Phone size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{client.phone}</span>
                </InfoRow>
              )}
              {client.phone2 && (
                <InfoRow icon={<Phone size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{client.phone2}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginLeft: 4 }}>2ème</span>
                </InfoRow>
              )}

              {/* Localisation */}
              {(client.address || client.city || client.postalBox || client.country) && (
                <InfoRow icon={<MapPin size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    {[client.address, client.postalBox && `BP ${client.postalBox}`, client.city, client.country !== 'Cameroun' ? client.country : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                </InfoRow>
              )}

              {/* Légal */}
              {client.taxNumber && (
                <InfoRow icon={<Hash size={14} />}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>Fiscal</span>
                  <span className="doc-number" style={{ fontSize: 12 }}>{client.taxNumber}</span>
                </InfoRow>
              )}
              {client.rccm && (
                <InfoRow icon={<FileCheck size={14} />}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>RCCM</span>
                  <span className="doc-number" style={{ fontSize: 12 }}>{client.rccm}</span>
                </InfoRow>
              )}

              {/* Conditions de paiement */}
              {client.defaultPaymentTerms && (
                <InfoRow icon={<CreditCard size={14} />}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{client.defaultPaymentTerms}</span>
                </InfoRow>
              )}

              {/* Notes internes */}
              {canSeeInternalNotes && client.internalNotes && (
                <div style={{
                  marginTop: 4, padding: '10px 12px',
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <StickyNote size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>{client.internalNotes}</span>
                </div>
              )}

              {/* Depuis */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <Clock size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Client depuis le {formatDate(client.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card" style={{ padding: '16px' }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>
              Actions rapides
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link
                href={`${ROUTES.PROFORMAS}/new?clientId=${id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  textDecoration: 'none', fontSize: 13, color: 'var(--text-2)',
                  fontFamily: 'var(--font-body)', fontWeight: 500,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--primary)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)' }}
              >
                <FileText size={13} /> Créer une proforma
              </Link>
              <Link
                href={`${ROUTES.INVOICES}/new?clientId=${id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                  borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                  textDecoration: 'none', fontSize: 13, color: 'var(--text-2)',
                  fontFamily: 'var(--font-body)', fontWeight: 500,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--primary)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)' }}
              >
                <TrendingUp size={13} /> Créer une facture
              </Link>
              {can('client', 'update') && isActive && (
                <button
                  onClick={() => setShowArchive(true)}
                  disabled={archiveMutation.isPending}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)',
                    background: 'none', cursor: 'pointer', fontSize: 13, color: '#d97706',
                    fontFamily: 'var(--font-body)', fontWeight: 500, textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d97706'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(217,119,6,0.05)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                >
                  <Archive size={13} /> Archiver ce client
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right — Factures + Quick Fill info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ClientQuickFillBanner clientId={id} />
          <ClientInvoiceHistory
            invoices={invoicesData?.data ?? []}
            isLoading={invoicesLoading}
            clientId={id}
          />
        </div>
      </div>

      {showArchive && (
        <ConfirmArchiveModal
          name={client.name}
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate(id)}
          onCancel={() => setShowArchive(false)}
        />
      )}
    </div>
  )
}

// ─── Quick Fill Banner ─────────────────────────────────────────
function ClientQuickFillBanner({ clientId }: { clientId: string }) {
  const { data } = useClientSummary(clientId)

  if (!data || data.totalPending === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(217,119,6,0.06)',
      border: '1px solid rgba(217,119,6,0.25)',
    }}>
      <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: '#92400e', marginBottom: 2 }}>
          Solde impayé en cours
        </p>
        <p style={{ fontSize: 13, color: '#b45309' }}>
          <span className="amount">{formatXAF(data.totalPending)}</span> à encaisser sur {data.pendingInvoiceCount} facture{data.pendingInvoiceCount > 1 ? 's' : ''}.
        </p>
      </div>
    </div>
  )
}
