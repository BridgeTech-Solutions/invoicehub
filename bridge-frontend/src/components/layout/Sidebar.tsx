'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { useAuthStore } from '@/features/auth/store'
import { useLogout } from '@/features/auth/hooks'
import { useMe } from '@/features/users/hooks'
import { useUnreadCount } from '@/features/notifications/hooks'
import { useSidebarStore } from '@/store/sidebar'
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  CreditCard,
  RefreshCw,
  BarChart3,
  Bell,
  UserCog,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  KeyRound,
  ChevronUp,
  ChevronDown,
  Plus,
  Tag,
  Building2,
  ShieldCheck,
  BellRing,
  HardDrive,
} from 'lucide-react'
import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────
interface SubItem {
  label: string
  href:  string
  icon:  React.ElementType
}

interface NavItem {
  label:    string
  href:     string
  icon:     React.ElementType
  bell?:    boolean
  roles?:   string[]
  children?: SubItem[]
}

interface NavSection {
  title: string
  items: NavItem[]
}

// ─── Navigation config ────────────────────────────────────────
const NAV: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Tableau de bord', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { label: 'Clients',             href: ROUTES.CLIENTS,   icon: Users },
      {
        label: 'Produits & Services', href: ROUTES.PRODUCTS,  icon: Package,
        children: [
          { label: 'Catégories', href: ROUTES.PRODUCT_CATEGORIES, icon: Tag },
        ],
      },
      {
        label: 'Proformas', href: ROUTES.PROFORMAS, icon: FileText,
        children: [
          { label: 'Nouveau proforma', href: '/proformas/new', icon: Plus },
        ],
      },
      {
        label: 'Factures', href: ROUTES.INVOICES, icon: Receipt,
        children: [
          { label: 'Nouvelle facture', href: '/invoices/new', icon: Plus },
        ],
      },
      { label: 'Paiements',   href: ROUTES.PAYMENTS,  icon: CreditCard },
      { label: 'Récurrentes', href: ROUTES.RECURRING,  icon: RefreshCw },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { label: 'Rapports', href: ROUTES.REPORTS, icon: BarChart3 },
    ],
  },
  {
    title: 'Système',
    items: [
      { label: 'Notifications',    href: ROUTES.NOTIFICATIONS, icon: Bell,          bell: true },
      { label: 'Utilisateurs',     href: ROUTES.USERS,         icon: UserCog,       roles: ['admin', 'commercial'] },
      { label: "Journaux d'audit", href: ROUTES.AUDIT,         icon: ClipboardList, roles: ['admin'] },
      {
        label: 'Paramètres', href: ROUTES.SETTINGS, icon: Settings,
        children: [
          { label: 'Entreprise',    href: ROUTES.SETTINGS_COMPANY,       icon: Building2   },
          { label: 'Sécurité',      href: ROUTES.SETTINGS_SECURITY,      icon: ShieldCheck },
          { label: 'Notifications', href: ROUTES.SETTINGS_NOTIFICATIONS, icon: BellRing    },
          { label: 'Sauvegardes',   href: ROUTES.SETTINGS_BACKUPS,       icon: HardDrive   },
        ],
      },
    ],
  },
]

// ─── Shared styles ────────────────────────────────────────────
const ASIDE_STYLE = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
  background: 'var(--sidebar-bg)',
  transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
})

// ─── Sidebar component ────────────────────────────────────────
export function Sidebar() {
  const pathname      = usePathname()
  const user          = useAuthStore((s) => s.user)
  const { data: me }  = useMe()
  const logoutMut     = useLogout()
  const notifCount    = useUnreadCount()

  const { collapsed, mobileOpen, setCollapsed, setMobileOpen, toggle } = useSidebarStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Determine which parent items are expanded (auto-expand when child is active)
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
          if (item.children && isChildActive(item)) {
            next[item.href] = true
          }
        }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Auto-collapse on ≤ 1024px screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    if (mq.matches) setCollapsed(true)
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setCollapsed])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  const displayName = user ? `${user.firstName} ${user.lastName}` : '—'
  const initials    = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?'

  const isActive = (href: string) =>
    href === ROUTES.DASHBOARD ? pathname === href : pathname.startsWith(href)

  // ─── Inner content (shared between desktop + mobile) ──────
  const sidebarInner = (
    <>
      {/* Background pattern */}
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
            <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img
                src="/logos/logo-bts-white.png"
                alt="BTS"
                style={{ width: 28, height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
              />
            </div>
          ) : (
            <img
              src="/logos/logo-bts-white.png"
              alt="Bridge Technologies Solutions"
              className="sidebar-logo-text"
              style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', maxWidth: 160 }}
            />
          )}
        </div>
      </div>

      {/* Nav */}
      <nav
        className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {NAV.map((section) => (
          <div key={section.title} className="mb-0.5">
            {!collapsed && (
              <p
                className="nav-section-title px-3 py-1"
                style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--sidebar-section)',
                }}
              >
                {section.title}
              </p>
            )}
            {collapsed && <div style={{ height: 6 }} />}

            {section.items.map((item) => {
              const active      = isActive(item.href)
              const childActive = isChildActive(item)
              const Icon        = item.icon
              const hasBadge    = item.bell && notifCount > 0
              const hasChildren = !collapsed && item.children && item.children.length > 0
              const isOpen      = !collapsed && (openItems[item.href] || childActive)

              return (
                <div key={item.href} className="nav-item px-1.5">
                  {/* Parent row */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'relative flex items-center gap-2 rounded-lg transition-all duration-150',
                        collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5',
                      )}
                      style={{
                        flex: 1,
                        color:      (active || childActive) ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                        background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                        fontFamily: 'var(--font-body)',
                        fontSize:   12.5,
                        fontWeight: (active || childActive) ? 500 : 400,
                        textDecoration: 'none',
                        letterSpacing: '0.01em',
                        minWidth: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
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
                          style={{ width: 3, background: 'var(--primary)' }}
                        />
                      )}

                      <span className="relative flex-shrink-0">
                        <Icon
                          size={15}
                          strokeWidth={(active || childActive) ? 2.2 : 1.8}
                          style={{ color: (active || childActive) ? 'var(--primary)' : 'inherit' }}
                        />
                        {hasBadge && (
                          <span
                            className="badge-pulse absolute flex items-center justify-center rounded-full text-white"
                            style={{ top: -5, right: -5, width: 15, height: 15, background: '#ef4444', fontSize: 9, fontWeight: 700 }}
                          >
                            {notifCount > 9 ? '9+' : notifCount}
                          </span>
                        )}
                      </span>

                      <span
                        className="sidebar-label flex-1 truncate"
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

                      {!collapsed && hasBadge && (
                        <span
                          className="rounded-full text-white flex items-center justify-center"
                          style={{ background: '#ef4444', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px' }}
                        >
                          {notifCount}
                        </span>
                      )}
                    </Link>

                    {/* Toggle chevron for items with children */}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => setOpenItems((prev) => ({ ...prev, [item.href]: !prev[item.href] }))}
                        style={{
                          flexShrink: 0,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          color: 'var(--sidebar-text)',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: 4,
                          marginRight: 2,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <ChevronDown
                          size={11}
                          strokeWidth={2.5}
                          style={{
                            transition: 'transform 0.2s ease',
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                            color: childActive ? 'var(--primary)' : 'inherit',
                          }}
                        />
                      </button>
                    )}
                  </div>

                  {/* Sub-items */}
                  {hasChildren && isOpen && (
                    <div style={{ marginLeft: 20, marginTop: 1, marginBottom: 2, borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 6 }}>
                      {item.children!.map((child) => {
                        const childIsActive = pathname === child.href || pathname.startsWith(child.href + '/')
                        const ChildIcon = child.icon
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="flex items-center gap-2 rounded-md transition-all duration-150"
                            style={{
                              padding: '5px 8px',
                              fontSize: 12,
                              color: childIsActive ? 'var(--sidebar-active-text)' : 'rgba(255,255,255,0.5)',
                              background: childIsActive ? 'rgba(45,125,210,0.15)' : 'transparent',
                              fontFamily: 'var(--font-body)',
                              fontWeight: childIsActive ? 500 : 400,
                              textDecoration: 'none',
                              display: 'flex',
                            }}
                            onMouseEnter={(e) => {
                              if (!childIsActive) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                e.currentTarget.style.color      = 'rgba(255,255,255,0.8)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!childIsActive) {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color      = 'rgba(255,255,255,0.5)'
                              }
                            }}
                          >
                            <ChildIcon
                              size={12}
                              strokeWidth={childIsActive ? 2.2 : 1.8}
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

      {/* User area */}
      <div className="relative flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <button
          className="w-full flex items-center gap-3 transition-colors duration-150"
          style={{
            padding:        collapsed ? '10px 0' : '10px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent',
            border:     'none',
            cursor:     'pointer',
          }}
          onClick={() => !collapsed && setUserMenuOpen((o) => !o)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <span
            className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              width:      30,
              height:     30,
              background: 'linear-gradient(135deg, var(--primary) 0%, #1a5fa8 100%)',
              fontSize:   11,
              fontFamily: 'var(--font-display)',
              boxShadow:  '0 2px 8px rgba(45,125,210,0.4)',
              overflow:   'hidden',
              padding:    0,
            }}
          >
            {me?.avatarUrl
              ? <img src={me.avatarUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover', display: 'block' }} />
              : initials
            }
          </span>

          <div
            className="sidebar-label flex flex-col text-left leading-tight min-w-0"
            style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s, width 0.2s' }}
          >
            <span className="user-name truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
              {displayName}
            </span>
            <span style={{ fontSize: 10, color: 'var(--sidebar-text)', textTransform: 'capitalize' }}>
              {user?.role ?? ''}
            </span>
          </div>

          {!collapsed && (
            <ChevronUp
              size={14}
              style={{
                color:      'var(--sidebar-text)',
                marginLeft: 'auto',
                transform:  userMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
                flexShrink: 0,
              }}
            />
          )}
        </button>

        {userMenuOpen && !collapsed && (
          <div
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
                className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-100"
                style={{ fontSize: 13, color: 'var(--sidebar-text-hover)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
                onClick={() => setUserMenuOpen(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <item.icon size={14} strokeWidth={1.8} />
                {item.label}
              </Link>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-100"
              style={{ fontSize: 13, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              onClick={() => { logoutMut.mutate(); setUserMenuOpen(false) }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut size={14} strokeWidth={1.8} />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      {/*
        Wrapper = `hidden lg:block` (NOT lg:flex) pour éviter un flex container
        imbriqué dans AppShell. display:block → l'aside enfant hérite
        automatiquement de la largeur du wrapper.
        Le bouton collapse est positionné en absolute sur ce wrapper (hors
        aside overflow:hidden).
      */}
      <div
        className="relative hidden lg:block"
        style={{
          width:      collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
          flexShrink: 0,
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          height:     '100vh',        /* hauteur explicite = pas de dépendance au flex parent */
        }}
      >
        <aside
          className={cn(
            'relative flex flex-col overflow-hidden',
            collapsed && 'sidebar-collapsed',
          )}
          style={{
            background: 'var(--sidebar-bg)',
            width:      '100%',
            height:     '100%',       /* remplit exactement le wrapper */
          }}
        >
          {sidebarInner}
        </aside>

        {/* Collapse toggle — sibling de l'aside, jamais clipé */}
        <button
          onClick={toggle}
          className="absolute z-50 flex items-center justify-center w-6 h-6 rounded-full text-white"
          style={{
            right:      -12,
            top:        'calc(var(--topbar-h) / 2)',
            transform:  'translateY(-50%)',
            background: 'var(--primary)',
            boxShadow:  '0 2px 8px rgba(45,125,210,0.5)',
            border:     'none',
            cursor:     'pointer',
            transition: 'box-shadow 0.15s, transform 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,125,210,0.75)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,125,210,0.5)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
          }}
          title={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
        >
          {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>
      </div>

      {/* ── Mobile sidebar — fixed overlay, shown by JS ────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside
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
