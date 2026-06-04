'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Search, Bell, ChevronRight, Menu, Loader2, Users, Package, FileText, Receipt, X,
  Plus, ShoppingCart, Wallet, Building2, ChevronDown, User, KeyRound, LogOut,
} from 'lucide-react'
import { ROUTES } from '@/lib/constants'
import { useUnreadCount } from '@/features/notifications/hooks'
import { useGlobalSearch } from '@/features/search/hooks'
import { useSidebarStore } from '@/store/sidebar'
import { useAuthStore } from '@/features/auth/store'
import { useLogout } from '@/features/auth/hooks'
import { useMe } from '@/features/users/hooks'
import type { SearchItem, SearchEntityType } from '@/features/search/types'

// ─── Breadcrumb map ───────────────────────────────────────────
const LABELS: Record<string, string> = {
  // ── Existants ────────────────────────────────────────────────
  dashboard:     'Tableau de bord',
  clients:       'Clients',
  products:      'Produits & Services',
  proformas:     'Proformas',
  invoices:      'Factures',
  payments:      'Paiements',
  recurring:     'Récurrentes',
  reports:       'Rapports',
  notifications: 'Notifications',
  users:         'Utilisateurs',
  audit:         "Journaux d'audit",
  profile:       'Mon profil',
  settings:      'Paramètres',
  company:       'Entreprise',
  billing:       'Facturation',
  security:      'Sécurité',
  backups:       'Sauvegardes',
  new:           'Nouveau',

  // ── Nouveaux ─────────────────────────────────────────────────
  suppliers:            'Fournisseurs',
  'purchase-orders':    'Bons de commande',
  'supplier-invoices':  'Factures fournisseurs',
  expenses:             'Dépenses & Frais',
  categories:           'Catégories',
  budgets:              'Budgets',
  stock:                'Stock',
  movements:            'Mouvements',
  levels:               'Niveaux de stock',
  alerts:               'Alertes',
  bank:                 'Banque',
  accounts:             'Comptes bancaires',
  import:               'Import relevé',
  transactions:         'Transactions',
  reconciliations:      'Rapprochements',
  'matching-rules':     'Règles de matching',
  accounting:           'Comptabilité',
  chart:                'Plan comptable',
  periods:              'Périodes fiscales',
  journals:             'Journaux',
  entries:              'Écritures',
  lettering:            'Lettrage',
  'tax-declarations':   'Déclarations TVA',
  roles:                'Rôles & Permissions',
  permissions:          'Permissions',
  approvals:            'Approbations',
  assistant:            'BTS Assistant',
  guide:                'Guide',
  offices:              'Bureaux',
  'tax-rates':          'Taux de TVA',
  'units':              'Unités de mesure',
  'email-templates':    'Templates email',
  webhooks:             'Webhooks',
  'api-keys':           'Clés API',
  'custom-fields':      'Champs personnalisés',
  'workflow-rules':     'Règles workflow',
  'ip-whitelist':       'Whitelist IP',
  exports:              'Exports',
  outlook:              'Microsoft Outlook',
  sage:                 'Export Sage',
}

function useBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((seg, i) => ({
    label:  LABELS[seg] ?? seg,
    href:   '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }))
}

// ─── Quick-create actions ─────────────────────────────────────
const CREATE_ACTIONS = [
  { label: 'Nouvelle facture',    href: '/invoices/new',        icon: Receipt,      color: '#10b981' },
  { label: 'Nouveau proforma',    href: '/proformas/new',       icon: FileText,     color: '#3b82f6' },
  { label: 'Bon de commande',     href: '/purchase-orders/new', icon: ShoppingCart, color: '#8b5cf6' },
  { label: 'Nouvelle dépense',    href: '/expenses/new',        icon: Wallet,       color: '#f59e0b' },
  { label: 'Nouveau client',      href: '/clients/new',         icon: Users,        color: '#6366f1' },
  { label: 'Nouveau fournisseur', href: '/suppliers/new',       icon: Building2,    color: '#64748b' },
]

// ─── Entity icon + color config ───────────────────────────────
const ENTITY_CFG: Record<SearchEntityType, { icon: React.ElementType; color: string; label: string }> = {
  client:   { icon: Users,    color: '#6366f1', label: 'Client' },
  invoice:  { icon: Receipt,  color: '#10b981', label: 'Facture' },
  proforma: { icon: FileText, color: '#3b82f6', label: 'Proforma' },
  product:  { icon: Package,  color: '#f59e0b', label: 'Produit' },
}

// ─── Status badge ─────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:          { bg: 'rgba(148,163,184,0.15)', color: '#64748b' },
  issued:         { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  paid:           { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  partially_paid: { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  overdue:        { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
  cancelled:      { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  sent:           { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  accepted:       { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
  rejected:       { bg: 'rgba(244,63,94,0.12)',   color: '#f43f5e' },
  expired:        { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
}

function StatusChip({ badge }: { badge: string }) {
  const c = STATUS_COLORS[badge] ?? { bg: 'rgba(148,163,184,0.15)', color: '#64748b' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
      padding: '1px 6px', borderRadius: 100, background: c.bg, color: c.color,
      letterSpacing: '0.03em', flexShrink: 0,
    }}>
      {badge}
    </span>
  )
}

// ─── Single result row ────────────────────────────────────────
function ResultRow({ item, highlighted, onClick }: {
  item: SearchItem
  highlighted: boolean
  onClick: () => void
}) {
  const cfg  = ENTITY_CFG[item.type]
  const Icon = cfg.icon

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: highlighted ? 'var(--surface-2)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = highlighted ? 'var(--surface-2)' : 'transparent' }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: cfg.color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} style={{ color: cfg.color }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.sub}
        </span>
      </span>
      {item.badge && <StatusChip badge={item.badge} />}
    </button>
  )
}

// ─── Search results dropdown ──────────────────────────────────
function SearchDropdown({ q, onClose }: { q: string; onClose: () => void }) {
  const router                      = useRouter()
  const { results, isLoading, active, hasResults } = useGlobalSearch(q)
  const [hi, setHi]                 = useState(-1)

  const flat: SearchItem[] = [
    ...(results.clients   ?? []),
    ...(results.invoices  ?? []),
    ...(results.proformas ?? []),
    ...(results.products  ?? []),
  ]

  const navigate = useCallback((item: SearchItem) => {
    router.push(item.href)
    onClose()
  }, [router, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, flat.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
      if (e.key === 'Enter' && hi >= 0 && flat[hi]) { navigate(flat[hi]) }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hi, flat, navigate, onClose])

  if (!active) return null

  const groups: { type: SearchEntityType; items: SearchItem[] }[] = ([
    { type: 'client'   as SearchEntityType, items: results.clients   ?? [] },
    { type: 'invoice'  as SearchEntityType, items: results.invoices  ?? [] },
    { type: 'proforma' as SearchEntityType, items: results.proformas ?? [] },
    { type: 'product'  as SearchEntityType, items: results.products  ?? [] },
  ]).filter((g) => g.items.length > 0)

  return (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        zIndex: 100, overflow: 'hidden', maxHeight: 420, overflowY: 'auto',
      }}
    >
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', color: 'var(--text-3)', fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
          Recherche en cours…
        </div>
      )}

      {!isLoading && !hasResults && (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 600, margin: '0 0 4px' }}>Aucun résultat</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Essayez un autre mot-clé — nom de client, numéro de document…
          </p>
        </div>
      )}

      {!isLoading && hasResults && groups.map((group, gi) => {
        const cfg = ENTITY_CFG[group.type]
        const Icon = cfg.icon
        const offset = groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0)

        return (
          <div key={group.type}>
            {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px 4px' }}>
              <Icon size={12} style={{ color: cfg.color }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {cfg.label}s
              </span>
            </div>
            {group.items.map((item, ii) => (
              <ResultRow
                key={item.id}
                item={item}
                highlighted={hi === offset + ii}
                onClick={() => navigate(item)}
              />
            ))}
          </div>
        )
      })}

      {!isLoading && hasResults && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {results.total} résultat{results.total > 1 ? 's' : ''} —{' '}
            <kbd style={{ fontSize: 10.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--font-mono)' }}>↑↓</kbd>{' '}
            naviguer,{' '}
            <kbd style={{ fontSize: 10.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--font-mono)' }}>↵</kbd>{' '}
            ouvrir,{' '}
            <kbd style={{ fontSize: 10.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--font-mono)' }}>Esc</kbd>{' '}
            fermer
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────
export function Topbar() {
  const breadcrumbs      = useBreadcrumbs()
  const notifCount       = useUnreadCount()
  const { toggleMobile } = useSidebarStore()
  const user             = useAuthStore((s) => s.user)
  const { data: me }     = useMe()
  const logoutMut        = useLogout()

  const [searchValue,   setSearchValue]   = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [showDropdown,  setShowDropdown]  = useState(false)
  const [createOpen,    setCreateOpen]    = useState(false)
  const [userOpen,      setUserOpen]      = useState(false)

  const searchRef      = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const createRef      = useRef<HTMLDivElement>(null)
  const userRef        = useRef<HTMLDivElement>(null)

  const hasQuery    = searchValue.trim().length >= 2
  const displayName = user ? `${user.firstName} ${user.lastName}` : '—'
  const initials    = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : '?'

  // Close search on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close create dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Shortcut / → focus search
  useEffect(() => {
    function handler() {
      searchInputRef.current?.focus()
      setSearchFocused(true)
    }
    document.addEventListener('shortcuts:open-search', handler)
    return () => document.removeEventListener('shortcuts:open-search', handler)
  }, [])

  function handleSearchFocus() {
    setSearchFocused(true)
    if (hasQuery) setShowDropdown(true)
  }

  function handleSearchChange(v: string) {
    setSearchValue(v)
    setShowDropdown(v.trim().length >= 2)
  }

  function closeSearch() {
    setShowDropdown(false)
    setSearchFocused(false)
    setSearchValue('')
  }

  return (
    <header
      style={{
        height:      'var(--topbar-h)',
        background:  'var(--topbar-bg)',
        boxShadow:   'var(--topbar-shadow)',
        position:    'sticky',
        top:         0,
        zIndex:      20,
        display:     'flex',
        alignItems:  'center',
        paddingLeft:  16,
        paddingRight: 16,
        gap:          10,
        flexShrink:   0,
      }}
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={toggleMobile}
        className="lg:hidden"
        style={{
          width: 44, height: 44, border: 'none', background: 'transparent',
          cursor: 'pointer', borderRadius: 8, display: 'none',
          alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)',
          flexShrink: 0,
        }}
        aria-label="Ouvrir le menu de navigation"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Fil d'Ariane" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <ChevronRight size={13} strokeWidth={2} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
            {crumb.isLast ? (
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                style={{ fontSize: 14, color: 'var(--text-3)', textDecoration: 'none', transition: 'color 0.15s', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Search */}
      <div ref={searchRef} style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: searchFocused ? 300 : 220,
            background: searchFocused ? 'var(--surface)' : 'var(--surface-2)',
            border: `1.5px solid ${searchFocused ? 'var(--primary)' : 'var(--border)'}`,
            boxShadow: searchFocused ? '0 0 0 3px var(--primary-light)' : 'none',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            transition: 'width 0.2s, border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <Search size={14} strokeWidth={2} style={{ color: searchFocused ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            ref={searchInputRef}
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleSearchFocus}
            placeholder="Rechercher un client, une facture…"
            aria-label="Recherche globale"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            role="combobox"
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', fontSize: 13,
              color: 'var(--text-1)', fontFamily: 'var(--font-body)',
              minWidth: 0,
            }}
          />
          {searchValue && (
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Effacer la recherche"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        {showDropdown && (
          <SearchDropdown q={searchValue} onClose={closeSearch} />
        )}
      </div>

      {/* [+] Créer rapide */}
      <div ref={createRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          aria-label="Créer un élément"
          aria-expanded={createOpen}
          aria-haspopup="menu"
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:          6,
            height:       36,
            padding:      '0 14px',
            background:  'var(--primary)',
            color:        '#fff',
            border:       'none',
            borderRadius: 'var(--radius-md)',
            cursor:       'pointer',
            fontSize:     13,
            fontWeight:   600,
            fontFamily:  'var(--font-display)',
            flexShrink:   0,
            boxShadow:   '0 2px 8px rgba(45,125,210,0.35)',
            transition:  'background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a65c0'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,125,210,0.5)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,125,210,0.35)' }}
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          <span className="hidden sm:inline">Créer</span>
        </button>

        {createOpen && (
          <div
            role="menu"
            style={{
              position:     'absolute',
              top:          'calc(100% + 8px)',
              right:         0,
              background:   'var(--surface)',
              border:       '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
              zIndex:        100,
              minWidth:      220,
              overflow:      'hidden',
              padding:       '6px',
            }}
          >
            <p style={{
              fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-display)',
              textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'var(--text-3)', padding: '6px 10px 4px', margin: 0,
            }}>
              Créer rapidement
            </p>
            {CREATE_ACTIONS.map((action) => {
              const ActionIcon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  role="menuitem"
                  onClick={() => setCreateOpen(false)}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:             10,
                    padding:        '8px 10px',
                    borderRadius:    8,
                    color:          'var(--text-1)',
                    textDecoration: 'none',
                    fontSize:        13,
                    fontFamily:     'var(--font-body)',
                    fontWeight:      500,
                    transition:     'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: action.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ActionIcon size={13} style={{ color: action.color }} aria-hidden="true" />
                  </span>
                  {action.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Notifications bell */}
      <Link
        href={ROUTES.NOTIFICATIONS}
        aria-label={notifCount > 0 ? `Notifications — ${notifCount} non lue${notifCount > 1 ? 's' : ''}` : 'Notifications'}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: 8, color: 'var(--text-2)',
          textDecoration: 'none', flexShrink: 0, transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.color      = 'var(--primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color      = 'var(--text-2)'
        }}
      >
        <Bell size={18} strokeWidth={1.8} />
        {notifCount > 0 && (
          <span
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 16, height: 16,
              background: '#ef4444',
              borderRadius: '50%',
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 2px var(--topbar-bg)',
            }}
          >
            {notifCount > 9 ? '9+' : notifCount}
          </span>
        )}
      </Link>

      {/* Avatar — user menu */}
      <div ref={userRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setUserOpen((o) => !o)}
          aria-label={`Menu utilisateur — ${displayName}`}
          aria-expanded={userOpen}
          aria-haspopup="menu"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:           8,
            height:        36,
            padding:      '0 10px 0 6px',
            background:    userOpen ? 'var(--surface-2)' : 'transparent',
            border:       '1.5px solid',
            borderColor:   userOpen ? 'var(--border)' : 'transparent',
            borderRadius: 'var(--radius-md)',
            cursor:        'pointer',
            transition:   'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background   = 'var(--surface-2)'
            e.currentTarget.style.borderColor  = 'var(--border)'
          }}
          onMouseLeave={(e) => {
            if (!userOpen) {
              e.currentTarget.style.background  = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
            }
          }}
        >
          {/* Avatar circle */}
          <span
            role="img"
            aria-label={`Avatar de ${displayName}`}
            style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--primary) 0%, #1a5fa8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
              color: '#fff', overflow: 'hidden',
            }}
          >
            {me?.avatarUrl
              ? <img src={me.avatarUrl} alt="" aria-hidden="true" style={{ width: 28, height: 28, objectFit: 'cover' }} />
              : <span aria-hidden="true">{initials}</span>
            }
          </span>

          {/* Name + role — hidden on mobile */}
          <span className="hidden md:flex" style={{ flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {user?.role ?? ''}
            </span>
          </span>

          <ChevronDown
            size={13}
            aria-hidden="true"
            className="hidden md:block"
            style={{ color: 'var(--text-3)', transition: 'transform 0.2s', transform: userOpen ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {/* User dropdown */}
        {userOpen && (
          <div
            role="menu"
            aria-label={`Menu de ${displayName}`}
            style={{
              position:     'absolute',
              top:          'calc(100% + 8px)',
              right:         0,
              background:   'var(--surface)',
              border:       '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    '0 16px 40px rgba(0,0,0,0.12)',
              zIndex:        100,
              minWidth:      210,
              overflow:      'hidden',
              padding:       '6px',
            }}
          >
            {/* User info header */}
            <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
                {displayName}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
                {user?.email ?? ''}
              </p>
            </div>

            {([
              { icon: User,     label: 'Mon profil',           href: ROUTES.PROFILE },
              { icon: KeyRound, label: 'Changer mot de passe', href: `${ROUTES.PROFILE}#password` },
            ] as const).map((item) => {
              const ItemIcon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setUserOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    color: 'var(--text-1)', textDecoration: 'none',
                    fontSize: 13, fontFamily: 'var(--font-body)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <ItemIcon size={14} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
                  {item.label}
                </Link>
              )
            })}

            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

            <button
              role="menuitem"
              onClick={() => { logoutMut.mutate(); setUserOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px', borderRadius: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 13, color: '#ef4444', fontFamily: 'var(--font-body)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
