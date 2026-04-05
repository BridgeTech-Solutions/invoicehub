'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ROUTES } from '@/lib/constants'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NavItem  { label: string; anchor: string }
interface NavGroup { title: string; items: NavItem[] }
interface TocSub   { label: string; anchor: string }
interface TocItem  { label: string; anchor: string; sub?: TocSub[] }

// ─── Navigation data ───────────────────────────────────────────────────────────

const NAV: NavGroup[] = [
  {
    title: 'Démarrage',
    items: [{ label: "Vue d'ensemble", anchor: 'overview' }],
  },
  {
    title: 'Documents',
    items: [
      { label: 'Factures',             anchor: 'facturation' },
      { label: 'Proformas & Devis',    anchor: 'proformas'   },
      { label: 'Factures récurrentes', anchor: 'recurrence'  },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { label: 'Clients',             anchor: 'clients'  },
      { label: 'Produits & Services', anchor: 'produits' },
    ],
  },
  {
    title: 'Analyse & IA',
    items: [
      { label: 'Tableau de bord', anchor: 'rapports'      },
      { label: 'Notifications',   anchor: 'notifications' },
      { label: 'Assistant BTS',   anchor: 'assistant'     },
    ],
  },
  {
    title: 'Mon compte',
    items: [
      { label: 'Sécurité',               anchor: 'securite' },
      { label: 'Historique des actions', anchor: 'audit'    },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Paramètres', anchor: 'parametres' },
    ],
  },
]

const TOC: TocItem[] = [
  { label: "Vue d'ensemble", anchor: 'overview' },
  {
    label: 'Factures', anchor: 'facturation',
    sub: [
      { label: 'Types de factures',       anchor: 'fact-types'    },
      { label: 'Statuts de paiement',     anchor: 'fact-statuts'  },
      { label: 'Créer une facture',       anchor: 'fact-creer'    },
      { label: 'Enregistrer un paiement', anchor: 'fact-paiement' },
      { label: 'Télécharger le PDF',      anchor: 'fact-pdf'      },
    ],
  },
  {
    label: 'Proformas & Devis', anchor: 'proformas',
    sub: [
      { label: 'Quand utiliser',         anchor: 'pro-quand'     },
      { label: 'Cycle de vie',           anchor: 'pro-cycle'     },
      { label: 'Créer et envoyer',       anchor: 'pro-creer'     },
      { label: 'Convertir en facture',   anchor: 'pro-convertir' },
    ],
  },
  {
    label: 'Factures récurrentes', anchor: 'recurrence',
    sub: [
      { label: 'Comment ça marche',  anchor: 'rec-fonctionnement' },
      { label: 'Créer un gabarit',   anchor: 'rec-creer'          },
      { label: 'Gérer les gabarits', anchor: 'rec-gerer'          },
    ],
  },
  {
    label: 'Clients', anchor: 'clients',
    sub: [
      { label: 'Informations client', anchor: 'cli-infos'   },
      { label: 'Fiche client',        anchor: 'cli-fiche'   },
      { label: 'Ajouter un client',   anchor: 'cli-ajouter' },
    ],
  },
  {
    label: 'Produits & Services', anchor: 'produits',
    sub: [
      { label: "Types d'articles",       anchor: 'prod-types'        },
      { label: 'Ajouter un article',     anchor: 'prod-ajouter'      },
      { label: 'Catégories',             anchor: 'prod-categories'   },
      { label: 'Créer depuis une facture', anchor: 'prod-quickcreate' },
    ],
  },
  {
    label: 'Tableau de bord', anchor: 'rapports',
    sub: [
      { label: 'Indicateurs en direct', anchor: 'dash-indicateurs' },
      { label: 'Graphiques',            anchor: 'dash-graphiques'  },
      { label: 'Rapports détaillés',    anchor: 'dash-rapports'    },
    ],
  },
  { label: 'Notifications', anchor: 'notifications' },
  {
    label: 'Assistant BTS', anchor: 'assistant',
    sub: [
      { label: 'Exemples de questions', anchor: 'ast-exemples'  },
      { label: 'Comment utiliser',      anchor: 'ast-utiliser'  },
      { label: 'Limites et conseils',   anchor: 'ast-limites'   },
    ],
  },
  {
    label: 'Sécurité', anchor: 'securite',
    sub: [
      { label: 'Double vérification',  anchor: 'sec-2fa'      },
      { label: 'Sessions actives',     anchor: 'sec-sessions' },
      { label: 'Mot de passe',         anchor: 'sec-mdp'      },
    ],
  },
  { label: 'Historique des actions', anchor: 'audit' },
  {
    label: 'Paramètres', anchor: 'parametres',
    sub: [
      { label: 'Informations entreprise', anchor: 'set-entreprise'    },
      { label: 'Facturation & bureaux',   anchor: 'set-facturation'   },
      { label: 'Sécurité du compte',      anchor: 'set-securite'      },
      { label: 'Notifications & rappels', anchor: 'set-notifications' },
      { label: 'Sauvegardes',             anchor: 'set-sauvegardes'   },
    ],
  },
]

// All anchors for IntersectionObserver
const ALL_ANCHORS = TOC.flatMap(t => [t.anchor, ...(t.sub?.map(s => s.anchor) ?? [])])

// Which top-level section owns an anchor
function parentAnchor(anchor: string): string {
  const found = TOC.find(t => t.anchor === anchor || t.sub?.some(s => s.anchor === anchor))
  return found?.anchor ?? anchor
}

// ─── UI Components ─────────────────────────────────────────────────────────────

function Badge({ children, color = '#2D7DD2' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
      border: `1px solid ${color}30`, background: `${color}10`, color,
      fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

type CalloutType = 'info' | 'tip' | 'warning'
const CALLOUT_STYLES = {
  info:    { bg: 'rgba(45,125,210,0.06)',  border: '#2D7DD2', label: 'À savoir'        },
  tip:     { bg: 'rgba(5,150,105,0.06)',   border: '#059669', label: 'Conseil pratique' },
  warning: { bg: 'rgba(217,119,6,0.07)',   border: '#d97706', label: 'Important'        },
}

function Callout({ type, children }: { type: CalloutType; children: React.ReactNode }) {
  const s = CALLOUT_STYLES[type]
  return (
    <div style={{
      padding: '12px 16px', margin: '20px 0',
      background: s.bg, borderLeft: `3px solid ${s.border}`, borderRadius: '0 8px 8px 0',
    }}>
      <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
        <strong style={{ color: s.border, display: 'block', marginBottom: 3, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {s.label}
        </strong>
        {children}
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, margin: '12px 0' }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: '#0f2d4a', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
      }}>
        {n}
      </div>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px', fontFamily: 'var(--font-display)' }}>
          {title}
        </p>
        {children && (
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>
            {children}
          </p>
        )}
      </div>
    </div>
  )
}

function FeatureList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span aria-hidden="true" style={{ color: '#059669', fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1, lineHeight: 1.5 }}>—</span>
          <span style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SubSection({ id, title }: { id: string; title: string }) {
  return (
    <h3
      id={id}
      style={{
        fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
        fontFamily: 'var(--font-display)', margin: '28px 0 8px',
        letterSpacing: '-0.01em', scrollMarginTop: 24, lineHeight: 1.3,
        paddingLeft: 10, borderLeft: '3px solid rgba(45,125,210,0.35)',
      }}
    >
      {title}
    </h3>
  )
}

function QuickFaq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
          Questions fréquentes
        </span>
      </div>
      {items.map(({ q, a }, i) => (
        <div key={i} style={{
          padding: '14px 16px',
          borderTop: i > 0 ? '1px solid var(--border)' : undefined,
          background: 'var(--surface)',
        }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 5px', fontFamily: 'var(--font-display)' }}>
            {q}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>
            {a}
          </p>
        </div>
      ))}
    </div>
  )
}

function ScreenshotPlaceholder({ label, caption }: { label: string; caption: string }) {
  return (
    <figure style={{ margin: '24px 0', border: '1.5px dashed var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        height: 160, background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
          {label}
        </span>
      </div>
      <figcaption style={{
        padding: '8px 14px', background: 'var(--surface)', borderTop: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5,
      }}>
        {caption}
      </figcaption>
    </figure>
  )
}

function SectionDivider() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '52px 0' }} />
}

function SectionHeading({ id, color, badge, title, subtitle }: {
  id: string; color: string; badge: string; title: string; subtitle?: string
}) {
  return (
    <div id={id} style={{ scrollMarginTop: 24, paddingTop: 8, marginBottom: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <Badge color={color}>{badge}</Badge>
      </div>
      <h2 style={{
        fontSize: 23, fontWeight: 800, color: 'var(--text-1)',
        fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
        margin: '0 0 6px', lineHeight: 1.2,
      }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 14.5, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function OpenModuleLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', marginTop: 12,
        fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
        fontFamily: 'var(--font-display)', padding: '8px 16px',
        border: '1.5px solid rgba(45,125,210,0.3)', borderRadius: 8, transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45,125,210,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </Link>
  )
}

const Txt = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 14px', ...style }}>
    {children}
  </p>
)

// ─── Status badges for invoice/proforma ────────────────────────────────────────

const STATUS_DEFS = [
  { key: 'draft',          label: 'Brouillon',       color: '#64748b', desc: 'La facture est en cours de rédaction. Elle n\'a pas encore de numéro officiel et peut être modifiée ou supprimée librement.' },
  { key: 'issued',         label: 'Émise',            color: '#2D7DD2', desc: 'La facture est officielle. Elle a reçu un numéro définitif et le client doit maintenant la régler. Vous ne pouvez plus la modifier.' },
  { key: 'partially_paid', label: 'Partiellement payée', color: '#d97706', desc: 'Le client a effectué un paiement partiel. Le solde restant à payer est calculé automatiquement.' },
  { key: 'paid',           label: 'Payée',            color: '#059669', desc: 'Le paiement total a été reçu et enregistré. La facture est soldée.' },
  { key: 'overdue',        label: 'En retard',        color: '#dc2626', desc: 'La date d\'échéance est dépassée et la facture n\'est pas encore réglée. InvoiceHub vous envoie une alerte et relance automatiquement.' },
  { key: 'cancelled',      label: 'Annulée',          color: '#94a3b8', desc: 'La facture a été annulée. Une note de crédit (avoir) a été générée automatiquement pour effacer la dette.' },
]

// ─── Sidebar ───────────────────────────────────────────────────────────────────

function DocsSidebar({ activeAnchor }: { activeAnchor: string }) {
  const currentParent = parentAnchor(activeAnchor)
  return (
    <aside
      aria-label="Navigation de la documentation"
      style={{
        width: 220, flexShrink: 0, position: 'sticky', top: 24,
        maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
        paddingRight: 8, scrollbarWidth: 'none',
      }}
    >
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Guide utilisateur
        </span>
      </div>
      <nav>
        {NAV.map((group) => (
          <div key={group.title} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px' }}>
              {group.title}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.items.map((item) => {
                const isActive = currentParent === item.anchor
                return (
                  <li key={item.anchor}>
                    <a
                      href={`#${item.anchor}`}
                      style={{
                        display: 'block', padding: '6px 10px', borderRadius: 6,
                        fontSize: 13.5, fontFamily: 'var(--font-body)', fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--primary)' : 'var(--text-2)',
                        background: isActive ? 'rgba(45,125,210,0.08)' : 'transparent',
                        textDecoration: 'none', transition: 'all 0.12s', cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)' } }}
                      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)' } }}
                    >
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// ─── Right TOC (two-level) ──────────────────────────────────────────────────────

function OnThisPage({ activeAnchor }: { activeAnchor: string }) {
  const currentParent = parentAnchor(activeAnchor)
  return (
    <nav aria-label="Sur cette page" className="docs-toc" style={{
      width: 200, flexShrink: 0, position: 'sticky', top: 24,
      maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', scrollbarWidth: 'none',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>
        Sur cette page
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {TOC.map((item) => {
          const isParentActive = activeAnchor === item.anchor
          const hasActiveSub   = item.sub?.some(s => s.anchor === activeAnchor) ?? false
          const isHighlighted  = isParentActive || hasActiveSub
          const showSubs       = item.sub && (currentParent === item.anchor)
          return (
            <li key={item.anchor}>
              <a
                href={`#${item.anchor}`}
                style={{
                  display: 'block', padding: '4px 8px', fontSize: 12.5,
                  color: isHighlighted ? 'var(--primary)' : 'var(--text-3)',
                  fontWeight: isHighlighted ? 600 : 400, textDecoration: 'none',
                  borderLeft: `2px solid ${isHighlighted ? 'var(--primary)' : 'transparent'}`,
                  transition: 'all 0.12s', lineHeight: 1.4,
                }}
                onMouseEnter={(e) => { if (!isHighlighted) e.currentTarget.style.color = 'var(--text-2)' }}
                onMouseLeave={(e) => { if (!isHighlighted) e.currentTarget.style.color = 'var(--text-3)' }}
              >
                {item.label}
              </a>
              {showSubs && (
                <ul style={{ listStyle: 'none', padding: '0 0 0 10px', margin: '0 0 2px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {item.sub!.map((sub) => {
                    const isSubActive = activeAnchor === sub.anchor
                    return (
                      <li key={sub.anchor}>
                        <a
                          href={`#${sub.anchor}`}
                          style={{
                            display: 'block', padding: '3px 8px', fontSize: 12,
                            color: isSubActive ? 'var(--primary)' : 'var(--text-3)',
                            fontWeight: isSubActive ? 600 : 400, textDecoration: 'none',
                            borderLeft: `2px solid ${isSubActive ? 'var(--primary)' : 'rgba(45,125,210,0.15)'}`,
                            transition: 'all 0.12s', lineHeight: 1.4,
                          }}
                          onMouseEnter={(e) => { if (!isSubActive) e.currentTarget.style.color = 'var(--text-2)' }}
                          onMouseLeave={(e) => { if (!isSubActive) e.currentTarget.style.color = 'var(--text-3)' }}
                        >
                          {sub.label}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [activeAnchor, setActiveAnchor] = useState('overview')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => { for (const e of entries) { if (e.isIntersecting) setActiveAnchor(e.target.id) } },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )
    ALL_ANCHORS.forEach((anchor) => {
      const el = document.getElementById(anchor)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <>
      <style>{`
        html { scroll-behavior: smooth; }
        .docs-toc { display: none; }
        @media (min-width: 1280px) { .docs-toc { display: block; } }
        @media (max-width: 900px)  { .docs-sidebar { display: none !important; } }
      `}</style>

      <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div className="docs-sidebar"><DocsSidebar activeAnchor={activeAnchor} /></div>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>

          {/* ══════════════════════════════ VUE D'ENSEMBLE */}
          <section id="overview" style={{ scrollMarginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Badge color="#0f2d4a">v2.0</Badge>
              <Badge color="#2D7DD2">Bridge Technologies Solutions</Badge>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0f2d4a', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', margin: '0 0 16px', lineHeight: 1.15 }}>
              Guide InvoiceHub
            </h1>
            <Txt>
              Bienvenue dans InvoiceHub, la plateforme de facturation de Bridge Technologies Solutions.
              Ce guide vous explique comment utiliser chaque partie de l'application, étape par étape, sans jargon technique.
            </Txt>
            <Txt>
              Que vous souhaitiez créer une facture, envoyer un devis, suivre vos paiements ou consulter vos revenus du mois, vous trouverez ici tout ce dont vous avez besoin.
            </Txt>
            <Callout type="info">
              Utilisez le menu à gauche pour naviguer directement vers la section qui vous intéresse, ou cliquez sur l'un des modules ci-dessous.
            </Callout>

            {/* Module shortcuts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, margin: '24px 0' }}>
              {[
                { label: 'Factures',              anchor: 'facturation',   color: '#2D7DD2', desc: 'Créer et gérer vos factures' },
                { label: 'Proformas & Devis',     anchor: 'proformas',     color: '#0f2d4a', desc: 'Envoyer des devis clients' },
                { label: 'Factures récurrentes',  anchor: 'recurrence',    color: '#7c3aed', desc: 'Automatiser la facturation' },
                { label: 'Clients',               anchor: 'clients',       color: '#059669', desc: 'Votre carnet clients' },
                { label: 'Produits & Services',   anchor: 'produits',      color: '#d97706', desc: 'Votre catalogue tarifaire' },
                { label: 'Tableau de bord',       anchor: 'rapports',      color: '#2D7DD2', desc: 'Revenus et impayés en direct' },
                { label: 'Notifications',         anchor: 'notifications', color: '#059669', desc: 'Alertes et rappels' },
                { label: 'Assistant BTS',         anchor: 'assistant',     color: '#7c3aed', desc: 'Posez des questions en français' },
                { label: 'Sécurité',              anchor: 'securite',      color: '#dc2626', desc: 'Protéger votre compte' },
              ].map(({ label, anchor, color, desc }) => (
                <a key={anchor} href={`#${anchor}`} style={{
                  display: 'block', padding: '12px 14px',
                  border: '1.5px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0',
                  textDecoration: 'none', background: 'var(--surface)',
                  transition: 'border-color 0.15s, background 0.15s', cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${color}06` }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{desc}</div>
                </a>
              ))}
            </div>
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ FACTURES */}
          <section id="facturation" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="facturation" color="#2D7DD2" badge="Documents"
              title="Factures"
              subtitle="Le document officiel qui demande le paiement à votre client."
            />
            <Txt>
              Une facture est le document que vous émettez pour demander le règlement d'une vente ou d'une prestation réalisée.
              InvoiceHub vous permet de créer plusieurs types de factures selon votre situation, et de suivre leur état jusqu'au paiement complet.
            </Txt>

            <SubSection id="fact-types" title="Types de factures" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 0 20px' }}>
              {[
                { title: 'Facture classique',    desc: 'La facture habituelle : vous vendez un produit ou réalisez une prestation et vous facturez la totalité du montant en une seule fois.', color: '#2D7DD2' },
                { title: "Facture d'acompte",    desc: 'Votre client paie une partie du montant à l\'avance — par exemple 30% au démarrage d\'un projet. Cette facture correspond uniquement à ce premier versement.', color: '#7c3aed' },
                { title: 'Facture de solde',     desc: 'Une fois l\'acompte reçu, vous facturez le reste dû. InvoiceHub calcule automatiquement combien il reste à payer en déduisant l\'acompte déjà versé.', color: '#059669' },
                { title: 'Note de crédit (Avoir)', desc: 'Si vous annulez une facture déjà émise et envoyée au client, le système génère automatiquement une note de crédit pour annuler la dette. Vous n\'avez rien à faire manuellement.', color: '#dc2626' },
              ].map(({ title, desc, color }) => (
                <div key={title} style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>{title}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SubSection id="fact-statuts" title="Que signifient les statuts ?" />
            <Txt>Chaque facture affiche un badge de couleur qui indique son état actuel. Voici ce que signifie chaque statut :</Txt>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: '10px 0 20px', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
              {STATUS_DEFS.map(({ label, color, desc }, i) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 16px',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  background: 'var(--surface)',
                }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100,
                    background: `${color}12`, color, fontFamily: 'var(--font-display)',
                    flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}
            </div>

            <SubSection id="fact-creer" title="Créer une facture" />
            <Step n={1} title="Cliquez sur « + Nouvelle facture »">
              Depuis la liste des factures, cliquez sur le bouton bleu en haut à droite.
            </Step>
            <Step n={2} title="Choisissez votre client">
              Tapez le nom du client dans le champ prévu. S'il existe déjà dans votre carnet, ses informations se remplissent automatiquement. Sinon, vous pouvez l'ajouter directement depuis le formulaire.
            </Step>
            <Step n={3} title="Ajoutez vos produits ou prestations">
              Cliquez sur <strong>Ajouter une ligne</strong>, puis tapez le nom du produit. Vos articles du catalogue apparaissent en suggestion. Si le produit n'existe pas encore, cliquez sur <strong>Créer « … »</strong> pour le créer sans quitter le formulaire — il sera immédiatement ajouté à la ligne.
            </Step>
            <Step n={4} title="Appliquez des remises si besoin">
              Sur chaque ligne, vous pouvez saisir une remise en pourcentage (%) ou en montant fixe (XAF — le Franc CFA utilisé au Cameroun). Vous pouvez aussi appliquer une remise globale sur l'ensemble de la facture.
            </Step>
            <Step n={5} title="Vérifiez les montants">
              Les totaux se calculent automatiquement : montant <strong>HT</strong> (Hors Taxe = avant TVA), montant de la <strong>TVA</strong> (Taxe sur la Valeur Ajoutée, 19,25% au Cameroun par défaut), et montant <strong>TTC</strong> (Toutes Taxes Comprises = montant final à payer).
            </Step>
            <Step n={6} title="Enregistrez ou émettez la facture">
              <strong>Brouillon</strong> sauvegarde sans numéro — vous pouvez encore modifier. <strong>Émettre</strong> attribue un numéro officiel définitif et verrouille la facture. À partir de ce moment, elle est officielle et ne peut plus être modifiée.
            </Step>
            <Callout type="tip">
              <strong>Facturer un client en deux fois ?</strong> Créez d'abord une facture d'acompte (exemple : 30%), enregistrez le paiement correspondant. Ouvrez ensuite cette facture et cliquez sur <strong>Créer la facture de solde</strong> — le montant restant est calculé automatiquement pour vous.
            </Callout>

            <SubSection id="fact-paiement" title="Enregistrer un paiement reçu" />
            <Txt>
              Quand votre client vous règle (par virement, chèque, espèces ou Mobile Money), vous devez l'enregistrer dans InvoiceHub pour que la facture passe au statut « Payée ».
            </Txt>
            <Step n={1} title="Ouvrez la facture concernée">
              Depuis la liste des factures, cliquez sur la facture pour l'ouvrir, ou utilisez le menu d'actions (les trois points) et sélectionnez <strong>Enregistrer un paiement</strong>.
            </Step>
            <Step n={2} title="Renseignez les informations du paiement">
              Entrez le montant reçu, la date du paiement et le mode de règlement utilisé : virement bancaire, espèces, chèque ou Mobile Money (Orange Money, MTN MoMo, etc.).
            </Step>
            <Step n={3} title="Validez le paiement">
              Cliquez sur <strong>Enregistrer</strong>. Le statut de la facture se met à jour automatiquement : si le montant est partiel, elle passe à « Partiellement payée » ; si le montant total est atteint, elle passe à « Payée ».
            </Step>
            <Callout type="info">
              Si un client règle en plusieurs versements, enregistrez chaque paiement séparément. InvoiceHub cumule les montants et affiche toujours le solde restant à payer.
            </Callout>

            <SubSection id="fact-pdf" title="Télécharger ou partager la facture" />
            <Txt>
              Toute facture peut être exportée en PDF et envoyée à votre client par e-mail ou imprimée.
              Le PDF est généré avec le logo de BTS, toutes les informations légales, le détail des lignes, les montants HT, TVA et TTC.
            </Txt>
            <FeatureList items={[
              <>Ouvrez la facture et cliquez sur <strong>Télécharger PDF</strong> — le fichier est prêt immédiatement.</>,
              <>Vous pouvez aussi accéder au PDF depuis le menu d'actions (les trois points) de la liste des factures.</>,
              <>Le PDF inclut automatiquement le numéro de facture, la date d'échéance, les coordonnées du client et les informations de BTS.</>,
            ]} />

            <ScreenshotPlaceholder
              label="Page des factures"
              caption="Capturer : /invoices — liste avec colonnes Numéro, Client, Date, Statut (badges de couleur), Montant total et boutons d'action"
            />
            <OpenModuleLink href={ROUTES.INVOICES} label="Aller aux factures" />

            <QuickFaq items={[
              {
                q: "Puis-je modifier une facture après l'avoir émise ?",
                a: "Non. Une facture émise est officielle et ne peut plus être modifiée, car elle a reçu un numéro comptable définitif. Si vous devez corriger une erreur, annulez la facture (une note de crédit est créée automatiquement) et recréez-en une nouvelle avec les informations correctes.",
              },
              {
                q: "Comment voir uniquement mes factures impayées ?",
                a: "Dans la liste des factures, utilisez le filtre « Statut » pour sélectionner « Émise », « Partiellement payée » ou « En retard ». Vous verrez d'un seul coup d'œil tous les montants encore à encaisser.",
              },
              {
                q: "Que se passe-t-il si je duplique une facture ?",
                a: "Une copie brouillon est créée avec les mêmes lignes, produits et client. Elle n'a pas encore de numéro. Vous pouvez la modifier librement avant de l'émettre. C'est très utile pour refacturer le même client chaque mois sans tout ressaisir.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ PROFORMAS */}
          <section id="proformas" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="proformas" color="#0f2d4a" badge="Documents"
              title="Proformas & Devis"
              subtitle="Obtenez l'accord du client avant d'émettre une facture officielle."
            />

            <SubSection id="pro-quand" title="À quoi sert une proforma ?" />
            <Txt>
              Une proforma (aussi appelée devis) est un document que vous envoyez au client <strong>avant</strong> de commencer le travail.
              Il indique exactement ce que vous allez lui facturer : prestations, quantités et prix.
              Le client peut l'approuver ou demander des modifications. Aucun paiement n'est dû tant que la proforma n'est pas convertie en facture officielle.
            </Txt>
            <FeatureList items={[
              "Quand vous souhaitez obtenir l'accord du client avant de commencer un travail",
              "Quand le client doit faire valider la dépense en interne avant de passer commande",
              "Quand les prix ou les quantités peuvent encore évoluer selon les besoins",
              "Pour les appels d'offres ou réponses à des demandes de cotation",
            ]} />

            <SubSection id="pro-cycle" title="Le cycle de vie d'une proforma" />
            <Txt>Une proforma passe par plusieurs étapes depuis sa création jusqu'à la facturation :</Txt>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '12px 0 20px', padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 9, border: '1px solid var(--border)' }}>
              {[
                { label: 'Brouillon',          color: '#64748b' },
                { label: '→',                  color: 'var(--text-3)', plain: true },
                { label: 'Envoyé au client',   color: '#2D7DD2' },
                { label: '→',                  color: 'var(--text-3)', plain: true },
                { label: 'Accepté',            color: '#059669' },
                { label: '/',                  color: 'var(--text-3)', plain: true },
                { label: 'Refusé',             color: '#dc2626' },
                { label: '→',                  color: 'var(--text-3)', plain: true },
                { label: 'Facture émise',      color: '#0f2d4a' },
              ].map((s, i) => (
                s.plain ? (
                  <span key={i} style={{ color: s.color, fontSize: 13 }}>{s.label}</span>
                ) : (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: `${s.color}12`, border: `1px solid ${s.color}30`, color: s.color }}>
                    {s.label}
                  </span>
                )
              ))}
            </div>
            <Txt>Une proforma sans réponse dans les 30 jours passe automatiquement au statut <strong>Expiré</strong>. Vous pouvez définir une date de validité différente dans le formulaire.</Txt>

            <SubSection id="pro-creer" title="Créer et envoyer une proforma" />
            <Step n={1} title="Créez votre proforma">
              Cliquez sur <strong>+ Nouvelle proforma</strong>. Remplissez le formulaire exactement comme pour une facture : client, produits, quantités, remises.
            </Step>
            <Step n={2} title="Enregistrez en brouillon puis relisez">
              Vous pouvez d'abord l'enregistrer pour relire ou corriger. La proforma n'a pas encore de numéro et vous pouvez la modifier librement.
            </Step>
            <Step n={3} title="Envoyez-le au client">
              Quand il est prêt, cliquez sur <strong>Envoyer</strong>. Son statut passe à « Envoyé au client » et un PDF est généré automatiquement.
            </Step>
            <Step n={4} title="Marquez la réponse du client">
              Quand le client vous répond, ouvrez la proforma et cliquez sur <strong>Accepté</strong> ou <strong>Refusé</strong> selon sa décision.
            </Step>

            <SubSection id="pro-convertir" title="Convertir une proforma acceptée en facture" />
            <Txt>
              C'est l'étape la plus pratique : si le client accepte, vous n'avez pas à ressaisir toutes les lignes dans une nouvelle facture.
            </Txt>
            <Step n={1} title="Ouvrez la proforma acceptée">
              Trouvez la proforma dans la liste avec le badge vert « Accepté ».
            </Step>
            <Step n={2} title="Cliquez sur « Convertir en facture »">
              Toutes les lignes, quantités, prix et remises sont automatiquement reportés dans une nouvelle facture en brouillon.
            </Step>
            <Step n={3} title="Vérifiez et émettez la facture">
              Vous pouvez encore ajuster la facture si besoin, puis cliquez sur <strong>Émettre</strong> pour la rendre officielle.
            </Step>
            <Callout type="warning">
              Une proforma n'est <strong>pas</strong> une facture. Elle ne compte pas dans vos revenus et ne génère aucune obligation de paiement. La facture officielle est créée seulement après la conversion.
            </Callout>

            <ScreenshotPlaceholder
              label="Formulaire de proforma"
              caption="Capturer : /proformas/new — formulaire avec lignes de produits, remises et récapitulatif HT / TVA / Total"
            />
            <OpenModuleLink href={ROUTES.PROFORMAS} label="Aller aux proformas" />

            <QuickFaq items={[
              {
                q: "Quelle est la différence entre une proforma et une facture ?",
                a: "La proforma est un document préparatoire, sans valeur comptable ni obligation de paiement. La facture est le document officiel qui crée une dette légale. En résumé : la proforma permet au client de valider avant de payer, la facture officialise la transaction.",
              },
              {
                q: "Mon client a accepté verbalement. Dois-je quand même changer le statut ?",
                a: "Oui, c'est fortement recommandé. Marquer la proforma comme « Acceptée » garde une trace claire de l'accord et permet de la convertir en facture d'un seul clic. Sans ce changement de statut, vous ne pouvez pas utiliser la conversion automatique.",
              },
              {
                q: "Peut-on modifier une proforma déjà envoyée ?",
                a: "Une proforma au statut « Envoyé » ne peut plus être modifiée directement. Si le client demande des changements, vous pouvez la dupliquer, modifier la copie et renvoyer une nouvelle proforma corrigée.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ RÉCURRENCE */}
          <section id="recurrence" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="recurrence" color="#7c3aed" badge="Automatisation"
              title="Factures récurrentes"
              subtitle="Configurez une fois, InvoiceHub facture automatiquement chaque mois."
            />

            <SubSection id="rec-fonctionnement" title="Comment ça marche ?" />
            <Txt>
              Vous avez des clients à qui vous facturez la même chose chaque mois — une maintenance, un abonnement, un loyer ?
              Avec les factures récurrentes, vous créez un <strong>gabarit</strong> (un modèle de facture) une seule fois.
              InvoiceHub vérifie automatiquement chaque nuit s'il y a des factures à générer et les crée à votre place.
            </Txt>
            <Txt>
              Le lendemain matin, vous recevez une notification vous informant des nouvelles factures créées.
              Ces factures restent en <strong>brouillon</strong> jusqu'à ce que vous les vérifiez et les emettiez — vous gardez le contrôle total avant qu'elles soient officielles.
            </Txt>
            <FeatureList items={[
              'Contrats de maintenance mensuelle (ex : maintenance informatique à 150 000 XAF/mois)',
              "Abonnements à des logiciels ou services que vous revendez",
              "Locations de matériel ou d'espace de bureau à loyer fixe",
              "Formations ou accompagnements avec des séances régulières au même tarif",
            ]} />

            <SubSection id="rec-creer" title="Créer un gabarit de facturation récurrente" />
            <Step n={1} title="Ouvrez « Factures récurrentes »">
              Cliquez sur <strong>Récurrence</strong> dans le menu de gauche, puis sur <strong>+ Nouveau gabarit</strong>.
            </Step>
            <Step n={2} title="Remplissez le modèle de facture">
              Choisissez le client, ajoutez les produits ou prestations avec leurs montants. Ce modèle sera copié à chaque échéance.
            </Step>
            <Step n={3} title="Choisissez la fréquence">
              Indiquez à quelle fréquence la facture doit être créée : chaque semaine, chaque mois, chaque trimestre (3 mois), chaque semestre (6 mois) ou chaque année.
            </Step>
            <Step n={4} title="Définissez les dates">
              Indiquez la date de début de la facturation. Si le contrat a une date de fin prévue, renseignez-la. Sinon, laissez la date de fin vide — la facturation continue jusqu'à ce que vous arrêtiez le gabarit manuellement.
            </Step>
            <Step n={5} title="Activez le gabarit">
              Cliquez sur <strong>Activer</strong>. À partir de la prochaine échéance, les factures seront créées automatiquement.
            </Step>
            <Callout type="tip">
              Si vous avez plusieurs clients avec la même prestation mensuelle, créez le gabarit pour le premier client puis utilisez le bouton <strong>Dupliquer</strong>. Sur la copie, changez uniquement le client — toutes les lignes de facturation sont déjà en place.
            </Callout>

            <SubSection id="rec-gerer" title="Gérer vos gabarits actifs" />
            <FeatureList items={[
              <><strong>Suspendre un gabarit :</strong> si un contrat est temporairement en pause, désactivez le gabarit. Aucune facture ne sera générée pendant cette période. Réactivez-le quand le contrat reprend.</>,
              <><strong>Arrêter définitivement :</strong> si le contrat est terminé, désactivez le gabarit. Les factures déjà générées ne sont pas affectées.</>,
              <><strong>Modifier le gabarit :</strong> si les prix ou les prestations changent, modifiez le gabarit. Les modifications s'appliquent aux prochaines factures générées, pas aux précédentes déjà créées.</>,
              <><strong>Vérifier les factures créées :</strong> dans la liste des factures, filtrez par type « Récurrente » pour voir toutes les factures générées automatiquement et leur état.</>,
            ]} />

            <ScreenshotPlaceholder
              label="Liste des gabarits récurrents"
              caption="Capturer : /recurring — liste des gabarits actifs avec Client, Fréquence, Prochaine échéance et Statut"
            />
            <OpenModuleLink href={ROUTES.RECURRING} label="Aller aux factures récurrentes" />

            <QuickFaq items={[
              {
                q: "Si j'oublie d'activer un gabarit, vais-je rater des factures ?",
                a: "Les gabarits désactivés ne génèrent aucune facture. Dès que vous les réactivez, la facturation reprend à la prochaine échéance planifiée. Les périodes passées pendant la désactivation ne sont pas rattrapées automatiquement — vous devrez créer manuellement les factures manquantes si nécessaire.",
              },
              {
                q: "Peut-on modifier une facture générée automatiquement avant de l'envoyer ?",
                a: "Oui. Les factures générées automatiquement restent en brouillon. Vous pouvez les modifier librement (ajouter une ligne, changer une quantité) avant de cliquer sur « Émettre ».",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ CLIENTS */}
          <section id="clients" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="clients" color="#059669" badge="Gestion"
              title="Clients"
              subtitle="Votre carnet clients avec l'historique complet de chaque relation."
            />

            <SubSection id="cli-infos" title="Informations à enregistrer" />
            <Txt>
              Une fiche client bien renseignée permet à InvoiceHub de remplir automatiquement vos factures et de les rendre conformes aux exigences légales camerounaises.
              Voici les informations importantes à saisir pour chaque client :
            </Txt>
            <FeatureList items={[
              <><strong>Nom de l'entreprise ou du particulier</strong> — tel qu'il doit apparaître sur les factures officielles.</>,
              <><strong>Adresse complète</strong> — quartier, ville. Obligatoire sur les factures.</>,
              <><strong>Téléphone et e-mail</strong> — pour vous permettre de le contacter facilement depuis sa fiche.</>,
              <><strong>Numéro fiscal (NIU)</strong> — le numéro d'identification de l'entreprise attribué par les impôts camerounais. Il doit figurer sur toutes les factures entre entreprises.</>,
              <><strong>Registre du Commerce (RCCM)</strong> — le numéro d'immatriculation de la société auprès du tribunal de commerce. Obligatoire pour les entreprises formellement constituées.</>,
              <><strong>Délai de paiement par défaut</strong> — combien de jours le client a pour payer après réception de la facture (exemple : 15 jours, 30 jours). Ce délai est automatiquement appliqué à chaque nouvelle facture créée pour ce client.</>,
            ]} />

            <SubSection id="cli-fiche" title="Ce que vous voyez sur la fiche d'un client" />
            <Txt>
              La fiche client est un tableau de bord dédié à chaque client. Elle regroupe tout son historique avec BTS :
            </Txt>
            <FeatureList items={[
              "Le montant total que ce client vous doit en ce moment, mis à jour en temps réel à chaque paiement",
              "Toutes les factures émises pour ce client avec leur statut et le montant restant à payer",
              "Tous les proformas envoyés et leur état (accepté, refusé, expiré, en attente de réponse)",
              "L'historique de tous les paiements reçus de ce client, avec les dates et les montants",
            ]} />

            <SubSection id="cli-ajouter" title="Ajouter un client" />
            <Step n={1} title="Ouvrez la section « Clients »">
              Cliquez sur <strong>Clients</strong> dans le menu de gauche.
            </Step>
            <Step n={2} title="Cliquez sur « + Nouveau client »">
              Le formulaire d'ajout s'ouvre avec tous les champs à remplir.
            </Step>
            <Step n={3} title="Renseignez les informations">
              Remplissez au minimum le nom et l'adresse. Pour les entreprises, le NIU est important car il doit apparaître sur vos factures officielles.
            </Step>
            <Step n={4} title="Enregistrez">
              Cliquez sur <strong>Créer le client</strong>. Il est maintenant disponible dans tous vos formulaires de facturation.
            </Step>
            <Callout type="info">
              Si vous n'avez plus de travail avec un client, vous pouvez l'<strong>archiver</strong> plutôt que de le supprimer. Il disparaît de votre liste active mais tout son historique est conservé. Vous pouvez le réactiver à tout moment.
            </Callout>

            <ScreenshotPlaceholder
              label="Liste des clients"
              caption="Capturer : /clients — liste avec le montant impayé de chaque client, la date du dernier document et les actions disponibles"
            />
            <OpenModuleLink href={ROUTES.CLIENTS} label="Aller aux clients" />

            <QuickFaq items={[
              {
                q: "Puis-je supprimer définitivement un client ?",
                a: "Non, il n'est pas possible de supprimer un client qui a des factures dans le système, pour des raisons comptables. Vous pouvez en revanche l'archiver : il disparaît de votre liste active mais toutes ses données et son historique sont conservés. Un client archivé peut être réactivé à tout moment.",
              },
              {
                q: "Que faire si un client change d'adresse ou de numéro de téléphone ?",
                a: "Allez sur sa fiche et cliquez sur « Modifier ». Les modifications s'appliquent immédiatement à sa fiche, mais n'affectent pas les factures déjà émises — celles-ci conservent les informations d'origine pour garantir leur conformité.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ PRODUITS */}
          <section id="produits" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="produits" color="#d97706" badge="Gestion"
              title="Produits & Services"
              subtitle="Votre catalogue tarifaire pour ne jamais resaisir un prix deux fois."
            />
            <Txt>
              Le catalogue regroupe tous vos produits et prestations avec leurs prix et taux de taxe.
              Au lieu de retaper le nom, le prix et la TVA à chaque facture, vous enregistrez ces informations une fois dans le catalogue
              et vous les sélectionnez ensuite en un clic lors de la création de vos documents.
            </Txt>

            <SubSection id="prod-types" title="Deux types d'articles" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0 20px' }}>
              {[
                { title: 'Produit physique', desc: 'Tout article que vous vendez et qui existe physiquement : équipement informatique, matériel réseau, fournitures, câbles, etc.', color: '#d97706' },
                { title: 'Prestation / Service', desc: 'Tout travail ou service que vous rendez : installation, maintenance, formation, conseil, développement, support technique, etc.', color: '#2D7DD2' },
              ].map(({ title, desc, color }) => (
                <div key={title} style={{ padding: '14px 16px', background: 'var(--surface)', border: `1.5px solid ${color}25`, borderRadius: 9 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color, margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>{title}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}
            </div>

            <SubSection id="prod-ajouter" title="Ajouter un produit ou service" />
            <Step n={1} title="Ouvrez « Produits & Services » puis cliquez sur « + Nouveau produit »" />
            <Step n={2} title="Choisissez le type : Prestation ou Produit physique" />
            <Step n={3} title="Entrez le nom du produit">
              Tel qu'il apparaîtra sur vos factures et proformas. Soyez précis — exemple : « Installation réseau Wi-Fi entreprise » plutôt que juste « Installation ».
            </Step>
            <Step n={4} title="Entrez le prix HT et la TVA">
              Le <strong>prix HT</strong> (Hors Taxe) est le prix avant ajout de la taxe. La <strong>TVA</strong> (Taxe sur la Valeur Ajoutée) est préréglée à 19,25% (taux camerounais standard). InvoiceHub calcule automatiquement le prix <strong>TTC</strong> (Toutes Taxes Comprises) que vous voyez s'afficher en temps réel. Si votre activité est exonérée de TVA, mettez 0%.
            </Step>
            <Step n={5} title="Choisissez l'unité de facturation">
              Comment facturez-vous cet article ? À <strong>l'heure</strong> pour les prestations horaires, à la <strong>journée</strong>, au <strong>forfait</strong> pour un prix fixe global, à <strong>l'unité</strong> pour les produits vendus à la pièce, etc.
            </Step>
            <Step n={6} title="Enregistrez">
              Cliquez sur <strong>Créer le produit</strong>. Il est maintenant disponible dans vos formulaires de facturation.
            </Step>

            <SubSection id="prod-categories" title="Organiser avec des catégories" />
            <Txt>
              Si votre catalogue contient beaucoup d'articles, les catégories vous aident à les organiser par famille.
              Par exemple : « Réseaux », « Formation », « Matériel », « Maintenance ».
            </Txt>
            <FeatureList items={[
              <>Pour créer des catégories, allez dans <strong>Paramètres → Catégories de produits</strong>.</>,
              "Une fois les catégories créées, associez-les à vos produits via le champ « Catégorie » dans le formulaire produit.",
              "Depuis la liste des produits, vous pouvez filtrer par catégorie pour trouver rapidement un article.",
              "Les catégories s'affichent aussi dans les suggestions lors de la saisie de lignes dans vos factures.",
            ]} />

            <SubSection id="prod-quickcreate" title="Créer un produit directement depuis une facture" />
            <Txt>
              Vous êtes en train de remplir une facture et vous tapez un produit qui n'existe pas encore dans votre catalogue ?
              Vous n'avez pas besoin de quitter le formulaire.
            </Txt>
            <Step n={1} title="Tapez le nom du produit dans la zone de saisie de ligne">
              La liste de suggestions apparaît. Si aucun résultat ne correspond, un bouton <strong>Créer « … »</strong> s'affiche en bas.
            </Step>
            <Step n={2} title="Cliquez sur « Créer « … » »">
              Un formulaire de création s'ouvre directement dans la page, sans vous faire perdre votre facture en cours.
            </Step>
            <Step n={3} title="Remplissez le nom, le prix et la TVA">
              Entrez les informations du nouveau produit et cliquez sur <strong>Créer le produit</strong>.
            </Step>
            <Step n={4} title="Le produit est automatiquement ajouté à la ligne">
              Il est maintenant enregistré dans votre catalogue ET déjà sélectionné dans votre facture. Il vous suffit d'ajuster la quantité.
            </Step>
            <Callout type="info">
              <strong>Vos anciens documents sont protégés.</strong> Si vous modifiez le prix d'un produit dans le catalogue, toutes les factures et proformas déjà créés conservent les prix d'origine. Seuls les nouveaux documents utiliseront le nouveau prix.
            </Callout>

            <ScreenshotPlaceholder
              label="Catalogue produits"
              caption="Capturer : /products — vue grille avec filtres par catégorie, prix affiché et badge Produit / Service"
            />
            <OpenModuleLink href={ROUTES.PRODUCTS} label="Aller au catalogue" />

            <QuickFaq items={[
              {
                q: "Si je change le prix d'un produit dans le catalogue, mes anciennes factures sont-elles modifiées ?",
                a: "Non, jamais. Toutes les factures et proformas déjà créés gardent les prix de l'époque où ils ont été créés. La modification du catalogue n'affecte que les nouveaux documents créés après la modification.",
              },
              {
                q: "Comment désactiver un produit que je ne vends plus ?",
                a: "Ouvrez la fiche du produit et décochez la case « Produit actif ». Le produit disparaît des suggestions lors de la création de nouveaux documents, mais reste visible dans vos anciens documents et dans votre catalogue avec le badge « Inactif ».",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ RAPPORTS */}
          <section id="rapports" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="rapports" color="#2D7DD2" badge="Analyse"
              title="Tableau de bord & Rapports"
              subtitle="La santé financière de BTS en un coup d'œil, mise à jour en temps réel."
            />
            <Txt>
              Le tableau de bord est votre vue d'ensemble sur l'activité financière de BTS.
              En un seul regard, vous voyez combien vous avez facturé, combien a été payé, qui vous doit de l'argent et depuis combien de temps.
              Les chiffres se mettent à jour automatiquement dès qu'un paiement est enregistré ou qu'une facture est émise.
            </Txt>

            <SubSection id="dash-indicateurs" title="Les indicateurs en temps réel" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 0 20px' }}>
              {[
                {
                  label: "Chiffre d'affaires du mois",
                  desc: "Le total de toutes vos factures émises ce mois-ci, en Francs CFA (XAF). Un graphique montre l'évolution sur les 12 derniers mois pour visualiser si votre activité progresse ou ralentit.",
                  color: '#2D7DD2',
                },
                {
                  label: "Taux d'encaissement",
                  desc: "La proportion de ce que vous avez facturé qui a réellement été payé. Un taux de 100% signifie que tous vos clients ont payé. Un taux bas signale des impayés à relancer.",
                  color: '#059669',
                },
                {
                  label: "Impayés par ancienneté",
                  desc: "Ce tableau classe les sommes dues selon leur ancienneté : 0–30 jours (récentes), 31–60 jours (à relancer), 61–90 jours (urgentes), plus de 90 jours (très en retard). Plus c'est rouge, plus c'est urgent.",
                  color: '#d97706',
                },
                {
                  label: "Répartition des factures",
                  desc: "Un graphique circulaire qui montre la proportion de vos factures payées, en attente, partiellement payées ou en retard. Utile pour évaluer d'un coup d'œil l'état général de votre facturation.",
                  color: '#7c3aed',
                },
                {
                  label: "Meilleurs clients",
                  desc: "La liste de vos 5 clients qui vous ont rapporté le plus de chiffre d'affaires sur la période. Utile pour savoir sur qui concentrer vos efforts de fidélisation et de développement commercial.",
                  color: '#0f2d4a',
                },
              ].map(({ label, desc, color }) => (
                <div key={label} style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>{label}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SubSection id="dash-graphiques" title="Lire les graphiques" />
            <FeatureList items={[
              <><strong>Graphique des revenus (barres mensuelles) :</strong> chaque barre représente le total facturé un mois donné. Survolez une barre pour voir le montant précis. Cliquez sur un mois pour filtrer les factures de cette période.</>,
              <><strong>Graphique en anneau (répartition) :</strong> chaque portion correspond à un statut de facture. Cliquez sur une portion pour voir la liste des factures concernées.</>,
              <><strong>Tableau des impayés par ancienneté :</strong> si une colonne affiche un montant en rouge, ce sont des factures très en retard — priorité aux relances pour ces clients.</>,
            ]} />

            <SubSection id="dash-rapports" title="Les rapports détaillés" />
            <Txt>
              En plus du tableau de bord, la section Rapports vous permet d'exporter des tableaux détaillés pour une période de votre choix.
            </Txt>
            <FeatureList items={[
              <><strong>Rapport de facturation :</strong> toutes les factures sur une période avec le détail des montants HT (avant TVA), TVA et TTC (total à payer).</>,
              <><strong>Rapport d'encaissement :</strong> tout ce qui a été encaissé, trié par mode de paiement (virement bancaire, espèces, chèque, Mobile Money).</>,
              <><strong>Rapport des impayés :</strong> liste complète des clients avec des factures non réglées, le montant dû et le nombre de jours de retard.</>,
            ]} />
            <Callout type="tip">
              Consultez le tableau de bord chaque matin pour avoir une vision claire de l'état de votre activité. Si des factures sont en retard depuis plus de 30 jours, c'est le bon moment pour appeler le client.
            </Callout>

            <ScreenshotPlaceholder
              label="Tableau de bord principal"
              caption="Capturer : /dashboard — les 4 cartes indicateurs en haut, le graphique des revenus sur 12 mois et le graphique de répartition des factures"
            />
            <OpenModuleLink href={ROUTES.REPORTS} label="Aller aux rapports" />

            <QuickFaq items={[
              {
                q: "Sur combien de temps puis-je voir mes données ?",
                a: "Le graphique des revenus affiche les 12 derniers mois. Les rapports détaillés vous permettent de choisir n'importe quelle période personnalisée depuis le début de votre utilisation d'InvoiceHub.",
              },
              {
                q: "Puis-je télécharger les rapports ?",
                a: "Oui. Dans la section Rapports, utilisez le bouton « Exporter » pour télécharger chaque tableau au format PDF. Vous pouvez ensuite l'imprimer ou l'archiver.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ NOTIFICATIONS */}
          <section id="notifications" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="notifications" color="#059669" badge="Alertes"
              title="Notifications"
              subtitle="InvoiceHub vous alerte automatiquement sur les événements importants."
            />
            <Txt>
              InvoiceHub vous tient informé en temps réel des événements qui nécessitent votre attention.
              Vous n'avez pas besoin de vérifier constamment l'application — une alerte apparaît dans la cloche en haut de l'écran dès que quelque chose se passe.
            </Txt>

            <SubSection id="notif-types" title="Quels types d'alertes recevez-vous ?" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: '10px 0 20px', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
              {[
                { label: 'Facture en retard de paiement', desc: "Un client a dépassé la date d'échéance sans avoir payé. Une alerte apparaît pour que vous puissiez le relancer rapidement.", color: '#dc2626' },
                { label: 'Paiement enregistré', desc: "Un paiement vient d'être enregistré sur une facture. Utile pour suivre les encaissements en temps réel, surtout si plusieurs personnes utilisent InvoiceHub.", color: '#059669' },
                { label: 'Facture récurrente générée', desc: "Une nouvelle facture a été créée automatiquement par un gabarit récurrent. Elle attend votre vérification avant d'être émise.", color: '#7c3aed' },
                { label: 'Proforma acceptée ou refusée', desc: "Le statut d'une proforma a changé. C'est le moment de convertir en facture ou de relancer le client selon sa réponse.", color: '#2D7DD2' },
                { label: 'Rappel de relance', desc: "InvoiceHub envoie des rappels progressifs pour les factures en retard : après 7 jours, 15 jours, puis 30 jours. Cela vous aide à ne rien oublier.", color: '#d97706' },
              ].map(({ label, color, desc }, i) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 16px',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  background: 'var(--surface)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 6 }} />
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px', fontFamily: 'var(--font-display)' }}>{label}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SubSection id="notif-lire" title="Consulter et gérer vos notifications" />
            <Step n={1} title="Cliquez sur la cloche dans la barre du haut">
              Un panneau s'ouvre avec toutes les notifications récentes, les plus récentes en premier.
            </Step>
            <Step n={2} title="Cliquez sur une notification pour accéder au document concerné">
              Chaque notification est liée directement à la facture, à la proforma ou au client concerné. Un clic vous y amène directement.
            </Step>
            <Step n={3} title="Marquez comme lu">
              Une fois traitée, marquez la notification comme lue. Vous pouvez aussi marquer toutes les notifications d'un coup avec « Tout marquer comme lu ».
            </Step>

            <SubSection id="notif-config" title="Configurer vos préférences de notification" />
            <Txt>
              Vous pouvez choisir quels types d'alertes vous souhaitez recevoir et de quelle façon (dans l'application uniquement, ou aussi par e-mail).
            </Txt>
            <FeatureList items={[
              <>Allez dans <strong>Paramètres → Notifications</strong> pour accéder aux préférences.</>,
              "Activez ou désactivez chaque type de notification selon vos besoins.",
              "Configurez votre adresse e-mail pour recevoir certaines alertes par e-mail en plus des alertes dans l'application.",
            ]} />

            <OpenModuleLink href={ROUTES.NOTIFICATIONS} label="Voir les notifications" />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ ASSISTANT */}
          <section id="assistant" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="assistant" color="#7c3aed" badge="Intelligence artificielle"
              title="Assistant BTS"
              subtitle="Posez des questions sur vos données en français et obtenez des réponses immédiates."
            />
            <Txt>
              L'assistant BTS vous permet de poser des questions sur votre activité en français, comme si vous parliez à un collègue.
              Au lieu de naviguer dans des menus et des rapports, tapez simplement votre question — l'assistant lit vos factures, vos paiements et vos clients, et vous répond avec des chiffres précis.
            </Txt>

            <SubSection id="ast-exemples" title="Exemples de questions que vous pouvez poser" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 20px' }}>
              {[
                "Quels clients n'ont pas payé ce mois-ci ?",
                "Quel est mon chiffre d'affaires depuis le début de l'année ?",
                "Quelle est la facture la plus ancienne qui n'a pas encore été réglée ?",
                "Quel est mon client le plus important ce trimestre ?",
                "Combien de factures sont actuellement en retard de paiement ?",
                "Quel produit ai-je le plus facturé ce mois ?",
                "Quel est le montant total des impayés en ce moment ?",
                "Quels clients ont des factures qui dépassent 60 jours de retard ?",
              ].map((q) => (
                <div key={q} style={{
                  padding: '10px 14px',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid #7c3aed', borderRadius: '0 8px 8px 0',
                }}>
                  <span style={{ fontSize: 13.5, color: 'var(--text-2)', fontStyle: 'italic' }}>« {q} »</span>
                </div>
              ))}
            </div>

            <SubSection id="ast-utiliser" title="Comment utiliser l'assistant ?" />
            <Step n={1} title="Ouvrez l'assistant">
              Cliquez sur <strong>Assistant BTS</strong> dans le menu de gauche.
            </Step>
            <Step n={2} title="Tapez votre question en français">
              Écrivez dans la zone de texte, en langage naturel. Pas besoin de formule particulière — l'assistant comprend les questions du quotidien.
            </Step>
            <Step n={3} title="Lisez la réponse">
              L'assistant analyse vos données et répond avec des chiffres précis tirés directement de vos factures et paiements en temps réel.
            </Step>
            <Step n={4} title="Continuez la conversation si besoin">
              Posez des questions complémentaires dans la même conversation. L'assistant se souvient du contexte de la conversation en cours.
            </Step>

            <SubSection id="ast-limites" title="Bonnes pratiques et limites" />
            <FeatureList items={[
              "L'assistant peut uniquement lire vos données — il ne peut pas créer de factures, envoyer des e-mails ou modifier quoi que ce soit.",
              "Il accède uniquement aux données de votre compte InvoiceHub, pas à Internet ou à d'autres sources externes.",
              "Plus vos données sont complètes (paiements enregistrés, clients bien renseignés), plus les réponses seront précises.",
              "Si l'assistant ne peut pas répondre à une question, il vous le dit clairement plutôt que d'inventer une réponse.",
            ]} />
            <Callout type="tip">
              Utilisez l'assistant le matin pour avoir un résumé rapide de l'état de votre activité, ou avant une réunion avec un client pour consulter son historique en quelques secondes.
            </Callout>

            <ScreenshotPlaceholder
              label="Interface de l'assistant"
              caption="Capturer : /assistant — une conversation avec une question (ex : « Quels clients n'ont pas payé ce mois ? ») et la réponse affichée"
            />
            <OpenModuleLink href={ROUTES.ASSISTANT} label="Ouvrir l'assistant" />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ SÉCURITÉ */}
          <section id="securite" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="securite" color="#dc2626" badge="Mon compte"
              title="Sécurité de votre compte"
              subtitle="Protégez l'accès à vos données de facturation."
            />
            <Txt>
              Cette section vous permet de renforcer la protection de votre compte InvoiceHub.
              Vos données de facturation sont confidentielles — il est important de s'assurer que seules les personnes autorisées y ont accès.
            </Txt>

            <SubSection id="sec-2fa" title="La double vérification à la connexion (recommandée)" />
            <Txt>
              La double vérification (abrégée « 2FA ») ajoute une deuxième couche de protection par-dessus votre mot de passe.
              En plus de votre mot de passe habituel, vous devrez entrer un <strong>code à 6 chiffres</strong> affiché sur votre téléphone.
              Ce code change toutes les 30 secondes, donc même si quelqu'un connaît votre mot de passe, il ne peut pas se connecter sans avoir votre téléphone en main.
            </Txt>
            <Callout type="warning">
              Exemple concret : si un collègue quitte l'entreprise et que vous n'avez pas encore changé votre mot de passe, il ne peut pas accéder à InvoiceHub s'il n'a pas aussi votre téléphone.
            </Callout>

            <SubSection id="sec-activer" title="Activer la double vérification" />
            <Step n={1} title="Téléchargez une application d'authentification gratuite">
              Installez sur votre téléphone <strong>Google Authenticator</strong> ou <strong>Authy</strong> (disponibles sur Android et iPhone, totalement gratuits).
            </Step>
            <Step n={2} title="Allez dans Paramètres → Sécurité">
              Dans InvoiceHub, cliquez sur <strong>Paramètres</strong> dans le menu de gauche, puis sur l'onglet <strong>Sécurité</strong>.
            </Step>
            <Step n={3} title="Scannez le QR code avec votre téléphone">
              Ouvrez Google Authenticator, appuyez sur <strong>+</strong> puis <strong>Scanner un code QR</strong>. Pointez votre téléphone vers le carré affiché à l'écran.
            </Step>
            <Step n={4} title="Entrez le code de confirmation">
              Votre application affiche maintenant un code à 6 chiffres. Saisissez-le dans InvoiceHub pour confirmer que la liaison est établie.
            </Step>
            <Step n={5} title="Sauvegardez vos codes de secours">
              InvoiceHub génère 8 codes de secours à usage unique. <strong>Notez-les sur papier ou dans un endroit sûr autre que votre téléphone.</strong> Si vous perdez votre téléphone, ces codes vous permettront de vous reconnecter.
            </Step>

            <SubSection id="sec-sessions" title="Gérer les appareils connectés" />
            <Txt>
              La section « Sessions actives » liste tous les appareils actuellement connectés à votre compte (ordinateur du bureau, téléphone personnel, tablette…) avec la date et l'heure de la dernière activité.
            </Txt>
            <FeatureList items={[
              "Si vous voyez un appareil que vous ne reconnaissez pas, cliquez sur « Déconnecter » pour le fermer immédiatement.",
              "Vous pouvez déconnecter tous les autres appareils d'un coup avec le bouton « Déconnecter tout ».",
              "Après une déconnexion, l'appareil devra se reconnecter avec le mot de passe et le code de double vérification.",
            ]} />

            <SubSection id="sec-mdp" title="Changer votre mot de passe" />
            <Step n={1} title="Allez dans Paramètres → Sécurité">
              Trouvez la section <strong>Modifier mon mot de passe</strong>.
            </Step>
            <Step n={2} title="Entrez votre mot de passe actuel">
              Pour vérifier que c'est bien vous qui effectuez le changement.
            </Step>
            <Step n={3} title="Entrez votre nouveau mot de passe deux fois">
              Choisissez un mot de passe long et unique — au moins 12 caractères avec des lettres, chiffres et symboles.
            </Step>
            <Step n={4} title="Confirmez">
              Cliquez sur <strong>Changer le mot de passe</strong>. Toutes vos sessions actives sur d'autres appareils seront déconnectées par mesure de sécurité.
            </Step>
            <Callout type="warning">
              Si vous perdez votre téléphone et que vous n'avez plus vos codes de secours, vous ne pourrez plus vous connecter seul. Dans ce cas, contactez immédiatement un administrateur de votre compte pour réinitialiser votre accès.
            </Callout>

            <ScreenshotPlaceholder
              label="Paramètres de sécurité"
              caption="Capturer : /settings/security — section Double vérification avec badge vert « Activée » et liste des sessions actives avec les appareils"
            />
            <OpenModuleLink href={ROUTES.SETTINGS_SECURITY} label="Aller aux paramètres de sécurité" />

            <QuickFaq items={[
              {
                q: "J'ai oublié mon mot de passe. Comment le réinitialiser ?",
                a: "Sur la page de connexion, cliquez sur « Mot de passe oublié ». Entrez votre adresse e-mail et vous recevrez un lien de réinitialisation. Ce lien est valable 24 heures.",
              },
              {
                q: "Qui peut accéder à InvoiceHub dans mon entreprise ?",
                a: "Seules les personnes qui ont un compte créé par un administrateur. Chaque utilisateur a un rôle qui détermine ses droits : les administrateurs ont accès à tout, les commerciaux peuvent créer et gérer des documents, les employés ont un accès limité en lecture.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ AUDIT */}
          <section id="audit" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="audit" color="#64748b" badge="Mon compte"
              title="Historique des actions"
              subtitle="Un journal complet et inaltérable de tout ce qui s'est passé dans InvoiceHub."
            />
            <Txt>
              L'historique des actions enregistre automatiquement chaque opération effectuée dans InvoiceHub :
              création d'une facture, modification d'un client, enregistrement d'un paiement, connexion d'un utilisateur…
              Chaque entrée indique <strong>qui</strong> a fait l'action, <strong>quand</strong> (date et heure exactes) et sur <strong>quel document</strong>.
            </Txt>

            <SubSection id="audit-utilite" title="À quoi ça sert concrètement ?" />
            <FeatureList items={[
              "Si une facture a été modifiée ou supprimée par erreur, vous pouvez voir exactement quand et par qui.",
              "En cas de contrôle comptable ou fiscal, vous pouvez prouver que chaque document est authentique et n'a pas été altéré.",
              "Si plusieurs personnes utilisent InvoiceHub, vous pouvez savoir qui a fait quoi et quand.",
              "En cas de litige avec un client, vous disposez d'une trace précise et datée de toutes les actions liées à ses factures.",
            ]} />

            <SubSection id="audit-lire" title="Comment lire l'historique ?" />
            <Step n={1} title="Ouvrez la section « Audit »">
              Cliquez sur <strong>Audit</strong> dans le menu de gauche.
            </Step>
            <Step n={2} title="Filtrez selon vos besoins">
              Filtrez par type d'action (facture créée, paiement enregistré, connexion…), par utilisateur ou par période pour trouver rapidement ce que vous cherchez.
            </Step>
            <Step n={3} title="Cliquez sur une ligne pour voir le détail">
              Chaque entrée peut être développée pour voir l'état du document avant et après la modification. Très utile pour comprendre exactement ce qui a changé.
            </Step>
            <Callout type="info">
              Les entrées de l'historique ne peuvent <strong>jamais</strong> être modifiées ni supprimées, même par un administrateur. C'est une garantie d'intégrité totale pour votre comptabilité.
            </Callout>

            <ScreenshotPlaceholder
              label="Journal d'audit"
              caption="Capturer : /audit — liste des événements avec colonnes Action, Document concerné, Utilisateur et Date/heure"
            />
            <OpenModuleLink href={ROUTES.AUDIT} label="Voir l'historique des actions" />

            <QuickFaq items={[
              {
                q: "Qui peut voir l'historique des actions ?",
                a: "Par défaut, seuls les administrateurs ont accès à l'historique complet. Les commerciaux et employés ne voient pas cet onglet dans leur menu.",
              },
              {
                q: "Les entrées de l'historique peuvent-elles être supprimées ?",
                a: "Non, jamais. Même un administrateur ne peut pas supprimer ou modifier les entrées de l'historique. Cette protection garantit que vos données sont fiables en cas de contrôle ou de litige.",
              },
            ]} />
          </section>

          <SectionDivider />

          {/* ══════════════════════════════ PARAMÈTRES */}
          <section id="parametres" style={{ scrollMarginTop: 24 }}>
            <SectionHeading id="parametres" color="#7c3aed" badge="Administration"
              title="Paramètres"
              subtitle="Configuration globale de votre espace InvoiceHub : entreprise, facturation, sécurité, notifications et sauvegardes."
            />
            <Callout type="warning">
              L'accès aux paramètres est réservé aux <strong>administrateurs</strong>. Les commerciaux et les employés ne voient pas cet onglet dans leur menu.
            </Callout>
            <Txt>
              La page Paramètres regroupe cinq onglets thématiques. Chaque onglet couvre un périmètre précis
              et les modifications sont enregistrées immédiatement après validation du formulaire.
            </Txt>

            {/* ── Entreprise ── */}
            <SubSection id="set-entreprise" title="Informations entreprise" />
            <Txt>
              L'onglet <strong>Entreprise</strong> contient les données officielles de Bridge Technologies Solutions.
              Ces informations apparaissent automatiquement dans l'en-tête de vos factures et proformas PDF.
            </Txt>
            <FeatureList items={[
              <><strong>Raison sociale, adresse, téléphone, e-mail</strong> — coordonnées imprimées sur tous vos documents.</>,
              <><strong>Logo de l'entreprise</strong> — glissez-déposez votre logo (PNG ou SVG recommandé, fond transparent). Il s'affiche en haut à gauche de chaque PDF.</>,
              <><strong>Signature / tampon</strong> — image de signature apposée en bas du document pour donner un aspect officiel.</>,
              <><strong>NIU (Numéro d'Identification Unique)</strong> — identifiant fiscal obligatoire pour la conformité SYSCOHADA.</>,
              <><strong>RCCM</strong> — numéro d'immatriculation au Registre du Commerce et du Crédit Mobilier.</>,
            ]} />
            <Callout type="tip">
              Après avoir changé le logo ou la signature, générez une facture de test en PDF pour vérifier le rendu avant d'envoyer à un client.
            </Callout>
            <OpenModuleLink href={ROUTES.SETTINGS_COMPANY} label="Ouvrir l'onglet Entreprise" />

            {/* ── Facturation ── */}
            <SubSection id="set-facturation" title="Facturation & bureaux" />
            <Txt>
              L'onglet <strong>Facturation</strong> gère les taux de TVA applicables à vos produits et services,
              ainsi que les bureaux ou agences de BTS dont dépend chaque document.
            </Txt>
            <FeatureList items={[
              <><strong>Taux de TVA</strong> — créez autant de taux que nécessaire (ex. 19,25 % standard, 0 % exonéré). Désignez un taux par défaut appliqué automatiquement aux nouveaux articles.</>,
              <><strong>Modifier / supprimer un taux</strong> — un taux déjà utilisé dans une facture ne peut pas être supprimé afin de préserver l'intégrité des documents existants.</>,
              <><strong>Bureaux & agences</strong> — chaque bureau (ex. « DC - Douala Centre ») possède son propre code inclus dans la numérotation des documents : <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>BTS/DC/2026/01/FAC001</code>.</>,
              <><strong>Ajouter / renommer un bureau</strong> — utile si BTS ouvre de nouvelles agences ou filiales régionales.</>,
            ]} />
            <Callout type="info">
              Le taux de TVA par défaut est présélectionné lors de l'ajout d'une ligne produit dans une facture ou proforma. Vous pouvez toujours le changer ligne par ligne.
            </Callout>
            <OpenModuleLink href={ROUTES.SETTINGS_BILLING} label="Ouvrir l'onglet Facturation" />

            {/* ── Sécurité ── */}
            <SubSection id="set-securite" title="Sécurité du compte" />
            <Txt>
              L'onglet <strong>Sécurité</strong> vous permet de renforcer la protection de l'accès à InvoiceHub
              pour l'ensemble des utilisateurs.
            </Txt>
            <FeatureList items={[
              <><strong>Politique de mot de passe</strong> — définissez la longueur minimale et les règles de complexité (majuscules, chiffres, caractères spéciaux) applicables à tous les comptes.</>,
              <><strong>Durée de session</strong> — choisissez la durée d'inactivité après laquelle un utilisateur est automatiquement déconnecté.</>,
              <><strong>Double authentification (2FA)</strong> — activez l'obligation du code 2FA pour tous les utilisateurs ou seulement pour les administrateurs.</>,
              <><strong>Historique de connexion</strong> — consultez les dernières connexions (adresse IP, navigateur, date) pour détecter tout accès suspect.</>,
            ]} />
            <Callout type="warning">
              Si vous activez la 2FA obligatoire, chaque utilisateur devra scanner le QR code avec une application d'authentification (Google Authenticator, Authy…) à sa prochaine connexion.
            </Callout>
            <OpenModuleLink href={ROUTES.SETTINGS_SECURITY} label="Ouvrir l'onglet Sécurité" />

            {/* ── Notifications ── */}
            <SubSection id="set-notifications" title="Notifications & rappels" />
            <Txt>
              L'onglet <strong>Notifications</strong> contrôle quels événements déclenchent une alerte
              et comment les rappels de paiement sont échelonnés.
            </Txt>
            <FeatureList items={[
              <><strong>Canaux de notification</strong> — activez ou désactivez les notifications en application (cloche en haut à droite) et/ou les e-mails pour chaque type d'événement (facture émise, paiement reçu, proforma acceptée…).</>,
              <><strong>Modèles d'e-mail</strong> — personnalisez le contenu des e-mails automatiques envoyés à votre équipe BTS (objet, corps du message, signature).</>,
              <><strong>Rappels de paiement escaladés</strong> — configurez jusqu'à 4 niveaux de rappel envoyés à votre équipe commerciale quand une facture reste impayée :</>,
            ]} />
            <div style={{
              margin: '12px 0 16px', padding: '14px 16px',
              background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', margin: '0 0 10px', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                Niveaux de rappel configurables
              </p>
              {[
                { lvl: 'Niveau 1', delay: 'J+0',  desc: 'Rappel immédiat dès que la facture passe en retard.' },
                { lvl: 'Niveau 2', delay: 'J+7',  desc: "Relance une semaine après la date d'échéance." },
                { lvl: 'Niveau 3', delay: 'J+15', desc: 'Deuxième relance après 15 jours sans paiement.' },
                { lvl: 'Niveau 4', delay: 'J+30', desc: 'Alerte critique — intervention urgente requise.' },
              ].map(({ lvl, delay, desc }) => (
                <div key={lvl} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontFamily: 'var(--font-display)',
                  }}>{delay}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-1)' }}>{lvl}</strong> — {desc}
                  </span>
                </div>
              ))}
            </div>
            <Callout type="tip">
              Les rappels sont envoyés à l'équipe BTS uniquement — jamais directement au client. C'est à votre équipe de décider comment relancer le client selon son niveau d'escalade.
            </Callout>
            <OpenModuleLink href={ROUTES.SETTINGS_NOTIFICATIONS} label="Ouvrir l'onglet Notifications" />

            {/* ── Sauvegardes ── */}
            <SubSection id="set-sauvegardes" title="Sauvegardes" />
            <Txt>
              L'onglet <strong>Sauvegardes</strong> vous permet de créer et de télécharger des instantanés complets
              de la base de données InvoiceHub à tout moment.
            </Txt>
            <FeatureList items={[
              <><strong>Créer une sauvegarde</strong> — déclenchez manuellement une sauvegarde complète (factures, clients, produits, paramètres). L'opération prend quelques secondes.</>,
              <><strong>Télécharger</strong> — récupérez le fichier de sauvegarde (format SQL/JSON) pour l'archiver sur vos propres systèmes ou un stockage externe sécurisé.</>,
              <><strong>Supprimer</strong> — supprimez les anciennes sauvegardes pour libérer de l'espace. Un avertissement de confirmation est affiché avant suppression.</>,
              <><strong>Statut de chaque sauvegarde</strong> — chaque entrée affiche un badge de statut pour un suivi visuel immédiat.</>,
            ]} />
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0 16px',
            }}>
              {[
                { label: 'Réussi',      bg: 'rgba(5,150,105,0.1)',   color: '#059669' },
                { label: 'En cours',    bg: 'rgba(45,125,210,0.1)',  color: '#2D7DD2' },
                { label: 'En attente',  bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
                { label: 'Échoué',      bg: 'rgba(220,38,38,0.1)',   color: '#dc2626' },
              ].map(({ label, bg, color }) => (
                <span key={label} style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
                  background: bg, color, fontFamily: 'var(--font-display)',
                }}>{label}</span>
              ))}
            </div>
            <Callout type="warning">
              Il est recommandé de créer une sauvegarde avant toute opération importante : migration, mise à jour du logiciel, ou fin de mois comptable.
            </Callout>
            <OpenModuleLink href={ROUTES.SETTINGS_BACKUPS} label="Ouvrir l'onglet Sauvegardes" />

            <QuickFaq items={[
              {
                q: "Qui peut accéder aux paramètres ?",
                a: "Uniquement les administrateurs. Les commerciaux et les employés n'ont pas accès à cette section — elle n'apparaît pas dans leur menu.",
              },
              {
                q: "Si je modifie le taux de TVA par défaut, est-ce que mes anciennes factures sont mises à jour ?",
                a: "Non. Les factures existantes gardent le taux qui était en vigueur à leur création. Seuls les nouveaux documents utiliseront le nouveau taux par défaut.",
              },
              {
                q: "À quelle fréquence dois-je créer des sauvegardes ?",
                a: "Idéalement une fois par semaine et avant chaque opération importante. Conservez au moins les 4 dernières sauvegardes, de préférence sur un stockage externe ou cloud.",
              },
              {
                q: "Les rappels de paiement sont-ils envoyés automatiquement ?",
                a: "Oui. Une tâche planifiée vérifie chaque nuit les factures en retard et envoie les notifications à l'équipe BTS selon le niveau d'escalade configuré.",
              },
            ]} />
          </section>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0', marginTop: 24, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              InvoiceHub v2.0 · Bridge Technologies Solutions · Douala, Cameroun
            </p>
            <Link href={ROUTES.DASHBOARD} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
              Retour au tableau de bord →
            </Link>
          </div>

        </main>

        {/* Right TOC */}
        <OnThisPage activeAnchor={activeAnchor} />

      </div>
    </>
  )
}
