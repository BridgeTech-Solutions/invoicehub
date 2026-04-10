'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { useAuthStore } from '@/features/auth/store'
import { useLogout } from '@/features/auth/hooks'
import { useMe } from '@/features/users/hooks'
import { useUnreadCount } from '@/features/notifications/hooks'
import { useSidebarStore } from '@/store/sidebar'
import {
  LayoutDashboard, Users, Package, FileText, Receipt, CreditCard,
  RefreshCw, BarChart3, Bell, UserCog, ClipboardList, Settings,
  ChevronLeft, ChevronRight, LogOut, User, KeyRound, ChevronUp,
  ChevronDown, Plus, Tag, Building2, ShieldCheck, BellRing, HardDrive, Sparkles, BookOpen,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
interface SubItem {
  label:  string
  href:   string
  icon:   React.ElementType
  roles?: string[]
}

interface NavItem {
  label:     string
  href:      string
  icon:      React.ElementType
  bell?:     boolean
  roles?:    string[]
  children?: SubItem[]
  external?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

// ─── Navigation config ────────────────────────────────────────
const NAV: NavSection[] = [
  {
    title: 'Ventes & Facturation',
    items: [
      {
        label: 'Proformas', href: ROUTES.PROFORMAS, icon: FileText,
        children: [{ label: 'Nouvelle proforma', href: '/proformas/new', icon: Plus }],
      },
      {
        label: 'Factures', href: ROUTES.INVOICES, icon: Receipt,
        children: [{ label: 'Nouvelle facture', href: '/invoices/new', icon: Plus }],
      },
      { label: 'Paiements',   href: ROUTES.PAYMENTS,  icon: CreditCard },
      { label: 'Récurrentes', href: ROUTES.RECURRING, icon: RefreshCw },
    ],
  },
  {
    title: 'Tiers & Stocks',
    items: [
      { label: 'Clients', href: ROUTES.CLIENTS, icon: Users },
      {
        label: 'Produits & Services', href: ROUTES.PRODUCTS, icon: Package,
        children: [{ label: 'Catégories', href: ROUTES.PRODUCT_CATEGORIES, icon: Tag }],
      },
    ],
  },
  {
    title: 'Gestion & Reporting',
    items: [
      { label: 'Tableau de bord', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
      { label: 'Rapports',        href: ROUTES.REPORTS,   icon: BarChart3 },
      { label: 'BTS Assistant',   href: ROUTES.ASSISTANT, icon: Sparkles },
      { label: 'Guide',           href: ROUTES.GUIDE,     icon: BookOpen, external: true },
    ],
  },
  {
    title: 'Système',
    items: [
      { label: 'Notifications', href: ROUTES.NOTIFICATIONS, icon: Bell, bell: true },
      { label: 'Utilisateurs',  href: ROUTES.USERS,         icon: UserCog, roles: ['admin'] },
      { label: "Audit",         href: ROUTES.AUDIT,         icon: ClipboardList, roles: ['admin'] },
      {
        label: 'Paramètres', href: ROUTES.SETTINGS, icon: Settings,
        children: [
          { label: 'Entreprise',    href: ROUTES.SETTINGS_COMPANY,       icon: Building2,   roles: ['admin'] },
          { label: 'Sécurité',      href: ROUTES.SETTINGS_SECURITY,      icon: ShieldCheck },
          { label: 'Notifications', href: ROUTES.SETTINGS_NOTIFICATIONS, icon: BellRing },
          { label: 'Sauvegardes',   href: ROUTES.SETTINGS_BACKUPS,       icon: HardDrive,   roles: ['admin'] },
        ],
      },
    ],
  },
]

// ─── Shared styles ────────────────────────────────────────────
const ASIDE_STYLE = (collapsed: boolean): React.CSSProperties => ({
  width:      collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
  background: 'var(--sidebar-bg)',
  transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
})

// ─── Sidebar component ────────────────────────────────────────
export function Sidebar() {
  const pathname   = usePathname()
  const user       = useAuthStore((s) => s.user)
  const { data: me } = useMe()
  const logoutMut  = useLogout()
  const notifCount = useUnreadCount()

  const { collapsed, mobileOpen, setCollapsed, setMobileOpen, toggle } = useSidebarStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Refs for user menu focus management (C5)
  const userTriggerRef = useRef<HTMLButtonElement>(null)
  const userMenuRef    = useRef<HTMLDivElement>(null)

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => pathname === c.href || pathname.startsWith(c.href)) ?? false

  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const section of NAV) {
      for (const item of section.items) {
        if (item.children) initial[item.href] = false
      }
    }
    return initial
  })

  // Auto-expand parent when navigating to a child route
  useEffect(() => {
    setOpenItems((prev) => {
      const next = { ...prev }
      for (const section of NAV) {
        for (const item of section.items) {
          if (item.children && isChildActive(item)) next[item.href] = true
        }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // État pour gérer les pôles (sections) dépliables
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    NAV.forEach(section => initial[section.title] = true)
    return initial
  })

  // Auto-collapse on ≤ 1024px screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    if (mq.matches) setCollapsed(true)
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setCollapsed])

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname, setMobileOpen])

  // C5 + C6: Escape closes user menu OR mobile sidebar
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (userMenuOpen) {
      setUserMenuOpen(false)
      userTriggerRef.current?.focus()
    } else if (mobileOpen) {
      setMobileOpen(false)
    }
  }, [userMenuOpen, mobileOpen, setMobileOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  // C5: focus first menu item when user menu opens
  useEffect(() => {
    if (userMenuOpen) {
      const first = userMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
      first?.focus()
    }
  }, [userMenuOpen])

  // C5: focus trap within user menu (Tab cycles through items)
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!userMenuRef.current) return
    const items = Array.from(userMenuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (!items.length) return
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(idx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(idx - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') {
      // Trap Tab within the menu
      if (e.shiftKey && idx === 0) { e.preventDefault(); items[items.length - 1]?.focus() }
      else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0]?.focus() }
    }
  }

  const closeUserMenu = () => {
    setUserMenuOpen(false)
    userTriggerRef.current?.focus()
  }

  const displayName = user ? `${user.firstName} ${user.lastName}` : '—'
  const initials    = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?'
  const isActive    = (href: string) =>
    href === ROUTES.DASHBOARD ? pathname === href : pathname.startsWith(href)

  // ─── Shared inner content ──────────────────────────────────
  const sidebarInner = (
    <>
      {/* Background */}
      <div className="sidebar-pattern" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(45,125,210,0.05) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)' }}
      />

      {/* Logo */}
      <div
        className="flex items-center px-4 flex-shrink-0"
        style={{ height: 'var(--topbar-h)', borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
          {collapsed ? (
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img
                src="/logos/logo-bts-white.png"
                alt="BTS"
                style={{ width: 36, height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
              />
            </div>
          ) : (
            <img
              src="/logos/logo-bts-white.png"
              alt="Bridge Technologies Solutions"
              className="sidebar-logo-text"
              style={{ height: 42, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', maxWidth: 180 }}
            />
          )}
        </div>
      </div>

      {/* C1: aria-label sur <nav> */}
      <nav
        aria-label="Navigation principale"
        className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {NAV.map((section) => (
          <div key={section.title} className="mb-0.5">
            {!collapsed && (
              <button
                onClick={() => setOpenSections(prev => ({ ...prev, [section.title]: !prev[section.title] }))}
                className="nav-section-title px-3 py-1 flex items-center justify-between w-full"
                style={{
                  fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--sidebar-section)', border: 'none', background: 'transparent', cursor: 'pointer',
                }}
              >
                <span>{section.title}</span>
                {openSections[section.title] ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
            )}
            {collapsed && <div style={{ height: 6 }} />}

            {(!collapsed ? openSections[section.title] : true) && section.items
              .filter((item) => !item.roles || item.roles.includes(user?.role ?? ''))
              .map((item) => {
                const active      = isActive(item.href)
                const childActive = isChildActive(item)
                const Icon        = item.icon
                const hasBadge    = item.bell && notifCount > 0
                const badgeLabel  = hasBadge ? ` — ${notifCount} notification${notifCount > 1 ? 's' : ''} non lue${notifCount > 1 ? 's' : ''}` : ''
                const visibleChildren = item.children?.filter((c) => !c.roles || c.roles.includes(user?.role ?? ''))
                const hasChildren     = !collapsed && !!visibleChildren && visibleChildren.length > 0
                const isOpen          = !collapsed && (openItems[item.href] || childActive)

                return (
                  <div key={item.href} className="nav-item px-1.5">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Link
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        // H1: aria-label au lieu de title (collapsed)
                        // H2: aria-current sur le lien actif
                        // C4: badge inclus dans aria-label en mode collapsed
                        aria-label={collapsed ? `${item.label}${badgeLabel}` : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-2 rounded-lg transition-all duration-150',
                          collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5',
                        )}
                        style={{
                          flex: 1,
                          color:          (active || childActive) ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                          background:     active ? 'var(--sidebar-active-bg)' : 'transparent',
                          fontFamily:     'var(--font-body)',
                          fontSize:       13,
                          fontWeight:     (active || childActive) ? 600 : 400,
                          textDecoration: 'none',
                          letterSpacing:  '0.01em',
                          minWidth:       0,
                          // H4: touch target ≥ 44px
                          minHeight:      44,
                          display:        'flex',
                          alignItems:     'center',
                        }}
                        onMouseEnter={(e) => {
                          if (!active) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                            e.currentTarget.style.color      = 'var(--sidebar-text-hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color      = (active || childActive) ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)'
                          }
                        }}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1.5 bottom-1.5 rounded-r-full"
                            style={{ width: 4, background: 'var(--primary)' }}
                            aria-hidden="true"
                          />
                        )}

                        {/* C3: aria-hidden sur toutes les icônes de nav */}
                        <span className="relative flex-shrink-0">
                          <Icon
                            size={15}
                            strokeWidth={(active || childActive) ? 2.2 : 1.8}
                            aria-hidden="true"
                            style={{ color: (active || childActive) ? 'var(--primary)' : 'inherit' }}
                          />
                          {/* C4: badge icône → aria-hidden (visuel seulement) */}
                          {hasBadge && (
                            <span
                              aria-hidden="true"
                              className="badge-pulse absolute flex items-center justify-center rounded-full text-white"
                              style={{ top: -5, right: -5, width: 15, height: 15, background: '#ef4444', fontSize: 9, fontWeight: 700 }}
                            >
                              {notifCount > 9 ? '9+' : notifCount}
                            </span>
                          )}
                        </span>

                        {/* M5: aria-hidden quand collapsed (label masqué visuellement et AT) */}
                        <span
                          className="sidebar-label flex-1 truncate"
                          aria-hidden={collapsed}
                          style={{
                            opacity:    collapsed ? 0 : 1,
                            width:      collapsed ? 0 : 'auto',
                            overflow:   'hidden',
                            whiteSpace: 'nowrap',
                            transition: 'opacity 0.2s, width 0.2s',
                          }}
                        >
                          {item.label}
                        </span>

                        {/* C4: badge inline en mode expanded — aria-hidden visuel + sr-only pour AT */}
                        {!collapsed && hasBadge && (
                          <>
                            <span
                              aria-hidden="true"
                              className="rounded-full text-white flex items-center justify-center"
                              style={{ background: '#ef4444', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px' }}
                            >
                              {notifCount}
                            </span>
                            <span className="sr-only">
                              {notifCount} notification{notifCount > 1 ? 's' : ''} non lue{notifCount > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </Link>

                      {/* Chevron toggle sous-items */}
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => setOpenItems((prev) => ({ ...prev, [item.href]: !prev[item.href] }))}
                          aria-label={isOpen ? `Fermer ${item.label}` : `Ouvrir ${item.label}`}
                          aria-expanded={isOpen}
                          style={{
                            flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: '4px 6px', color: 'var(--sidebar-text)', display: 'flex',
                            alignItems: 'center', borderRadius: 4, marginRight: 2,
                            minHeight: 44, minWidth: 32,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {/* C3: aria-hidden */}
                          <ChevronDown
                            size={11}
                            strokeWidth={2.5}
                            aria-hidden="true"
                            style={{
                              transition: 'transform 0.2s ease',
                              transform:  isOpen ? 'rotate(180deg)' : 'none',
                              color:      childActive ? 'var(--primary)' : 'inherit',
                            }}
                          />
                        </button>
                      )}
                    </div>

                    {/* Sous-items (H3: minHeight 44) */}
                    {hasChildren && isOpen && (
                      <div style={{ marginLeft: 20, marginTop: 2, marginBottom: 4, borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>
                        {item.children!
                          .filter((child) => !child.roles || child.roles.includes(user?.role ?? ''))
                          .map((child) => {
                            const childIsActive = pathname === child.href || pathname.startsWith(child.href + '/')
                            const ChildIcon = child.icon
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                // H2: aria-current sur sous-item actif
                                aria-current={childIsActive ? 'page' : undefined}
                                className="flex items-center gap-2 rounded-md transition-all duration-150"
                                style={{
                                  padding:        '4px 8px',
                                  fontSize:       12,
                                  color:          childIsActive ? 'var(--sidebar-active-text)' : 'rgba(255,255,255,0.72)',
                                  background:     childIsActive ? 'rgba(45,125,210,0.15)' : 'transparent',
                                  fontFamily:     'var(--font-body)',
                                  fontWeight:     childIsActive ? 500 : 400,
                                  textDecoration: 'none',
                                  display:        'flex',
                                  alignItems:     'center',
                                  // H3: touch target ≥ 44px
                                  minHeight:      44,
                                }}
                                onMouseEnter={(e) => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                                    e.currentTarget.style.color      = 'rgba(255,255,255,0.9)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color      = 'rgba(255,255,255,0.72)'
                                  }
                                }}
                              >
                                {/* C3: aria-hidden */}
                                <ChildIcon
                                  size={12}
                                  strokeWidth={childIsActive ? 2.2 : 1.8}
                                  aria-hidden="true"
                                  style={{ flexShrink: 0, color: childIsActive ? 'var(--primary)' : 'inherit' }}
                                />
                                <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                  {child.label}
                                </span>
                              </Link>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        ))}
      </nav>

      {/* Zone utilisateur */}
      <div className="relative flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <button
          ref={userTriggerRef}
          className="w-full flex items-center gap-3 transition-colors duration-150"
          style={{
            padding:        collapsed ? '10px 0' : '10px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background:     'transparent', border: 'none', cursor: 'pointer',
            // H5: touch target ≥ 44px
            minHeight:      44,
          }}
          aria-label={`Menu utilisateur — ${displayName}`}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
          onClick={() => !collapsed && setUserMenuOpen((o) => !o)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {/* M1: avatar avec role="img" et aria-label */}
          <span
            role="img"
            aria-label={`Avatar de ${displayName}`}
            className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg, var(--primary) 0%, #1a5fa8 100%)',
              fontSize: 11, fontFamily: 'var(--font-display)',
              boxShadow: '0 2px 8px rgba(45,125,210,0.4)', overflow: 'hidden', padding: 0,
            }}
          >
            {me?.avatarUrl
              // M2: aria-hidden sur l'img (le role="img" parent porte le label)
              ? <img src={me.avatarUrl} alt="" aria-hidden="true" style={{ width: 32, height: 32, objectFit: 'cover', display: 'block' }} />
              : <span aria-hidden="true">{initials}</span>
            }
          </span>

          <div
            className="sidebar-label flex flex-col text-left leading-tight min-w-0"
            aria-hidden={collapsed}
            style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s, width 0.2s' }}
          >
            <span className="user-name truncate" style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
              {displayName}
            </span>
            <span style={{ fontSize: 11, color: 'var(--sidebar-text)', textTransform: 'capitalize' }}>
              {user?.role ?? ''}
            </span>
          </div>

          {/* H8: ChevronUp décoratif → aria-hidden */}
          {!collapsed && (
            <ChevronUp
              size={14}
              aria-hidden="true"
              style={{
                color: 'var(--sidebar-text)', marginLeft: 'auto',
                transform:  userMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease', flexShrink: 0,
              }}
            />
          )}
        </button>

        {/* C5: role="menu" + focus trap + Escape (géré dans handleGlobalKeyDown) */}
        {userMenuOpen && !collapsed && (
          <div
            ref={userMenuRef}
            role="menu"
            aria-label={`Menu de ${displayName}`}
            onKeyDown={handleMenuKeyDown}
            className="absolute bottom-full left-2 right-2 mb-1 rounded-xl overflow-hidden"
            style={{ background: '#0f2d4a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 -8px 24px rgba(0,0,0,0.3)' }}
          >
            {[
              { icon: User,     label: 'Mon profil',           href: ROUTES.PROFILE },
              { icon: KeyRound, label: 'Changer mot de passe', href: `${ROUTES.PROFILE}#password` },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-3 px-4 transition-colors duration-100"
                style={{
                  fontSize: 14, color: 'var(--sidebar-text-hover)', textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                  // H5: touch target ≥ 44px
                  minHeight: 44, display: 'flex', alignItems: 'center',
                }}
                onClick={closeUserMenu}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* C3: aria-hidden */}
                <item.icon size={14} strokeWidth={1.8} aria-hidden="true" />
                {item.label}
              </Link>
            ))}

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

            <button
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 transition-colors duration-100"
              style={{
                fontSize: 14, color: '#f87171', background: 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
                // H5: touch target ≥ 44px
                minHeight: 44, display: 'flex', alignItems: 'center',
              }}
              onClick={() => { logoutMut.mutate(); closeUserMenu() }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* C3: aria-hidden */}
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <div
        className="relative hidden lg:block"
        style={{
          width:      collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
          flexShrink: 0,
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          height:     '100vh',
        }}
      >
        {/* C2: aria-label sur <aside> desktop */}
        <aside
          aria-label="Barre latérale"
          className={cn('relative flex flex-col overflow-hidden', collapsed && 'sidebar-collapsed')}
          style={{ background: 'var(--sidebar-bg)', width: '100%', height: '100%' }}
        >
          {sidebarInner}
        </aside>

        {/* C7: bouton collapse — zone de toucher 44×44px autour de l'icône 24px */}
        <button
          onClick={toggle}
          className="absolute z-50 flex items-center justify-center rounded-full text-white"
          style={{
            right:      -12,
            top:        'calc(var(--topbar-h) / 2)',
            transform:  'translateY(-50%)',
            background: 'var(--primary)',
            boxShadow:  '0 2px 8px rgba(45,125,210,0.5)',
            border:     'none', cursor: 'pointer',
            transition: 'box-shadow 0.15s, transform 0.15s',
            // C7: zone de toucher 44×44 autour du cercle visuel 24×24
            width:      44,
            height:     44,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,125,210,0.75)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,125,210,0.5)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
          }}
          aria-label={collapsed ? 'Étendre la barre latérale' : 'Réduire la barre latérale'}
          aria-expanded={!collapsed}
        >
          {/* C3: aria-hidden */}
          {collapsed
            ? <ChevronRight size={13} strokeWidth={2.5} aria-hidden="true" />
            : <ChevronLeft  size={13} strokeWidth={2.5} aria-hidden="true" />
          }
        </button>
      </div>

      {/* ── Mobile sidebar — overlay fixe ─────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop — H7: Escape géré dans handleGlobalKeyDown */}
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* C2 + C6: role="dialog" + aria-modal + aria-label */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            style={{ ...ASIDE_STYLE(false), width: 'var(--sidebar-w)' }}
            className="fixed left-0 top-0 h-screen flex flex-col overflow-hidden z-50 lg:hidden"
          >
            {sidebarInner}
          </aside>
        </>
      )}
    </>
  )
}
