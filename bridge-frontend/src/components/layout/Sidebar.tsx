'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/constants'
import { useAuthStore } from '@/features/auth/store'
import { useUnreadCount } from '@/features/notifications/hooks'
import { useApprovalPendingCount } from '@/features/approvals/hooks'
import { useSidebarStore } from '@/store/sidebar'
import {
  LayoutDashboard, Users, Package, FileText, Receipt, CreditCard,
  RefreshCw, BarChart3, Bell, UserCog, ClipboardList, Settings,
  PanelLeftClose, PanelLeftOpen,
  ChevronDown, Plus, Tag, ShieldCheck, Sparkles, BookOpen,
  ShoppingCart, FileInput, Wallet, ReceiptText, PieChart,
  Warehouse, ArrowLeftRight, BarChart2, AlertTriangle,
  Landmark, BookCheck, CheckSquare, Building2,
} from 'lucide-react'
import { OverlaySubNav } from './OverlaySubNav'

// ─── Types ────────────────────────────────────────────────────
interface SubItem {
  label:  string
  href:   string
  icon:   React.ElementType
  roles?: string[]
}

interface NavItem {
  label:          string
  href:           string
  icon:           React.ElementType
  bell?:          boolean
  approvalBadge?: boolean
  roles?:         string[]
  children?:      SubItem[]
  external?:      boolean
  overlay?:       string  // 'bank' | 'accounting' | 'roles' | 'settings'
}

interface NavSection {
  title: string
  items: NavItem[]
}

// ─── Navigation config ────────────────────────────────────────
const NAV: { title: string; sectionIcon: React.ElementType; items: NavItem[] }[] = [
  {
    title: 'VUE D\'ENSEMBLE',
    sectionIcon: LayoutDashboard,
    items: [
      { label: 'Tableau de bord', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
    ],
  },
  {
    title: 'TIERS',
    sectionIcon: Users,
    items: [
      { label: 'Clients',      href: ROUTES.CLIENTS,    icon: Users },
      { label: 'Fournisseurs', href: ROUTES.SUPPLIERS,  icon: Building2 },
    ],
  },
  {
    title: 'VENTES',
    sectionIcon: Receipt,
    items: [
      {
        label: 'Proformas', href: ROUTES.PROFORMAS, icon: FileText,
        children: [{ label: 'Nouveau proforma', href: '/proformas/new', icon: Plus }],
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
    title: 'ACHATS',
    sectionIcon: ShoppingCart,
    items: [
      { label: 'Bons de commande',      href: ROUTES.PURCHASE_ORDERS,   icon: ShoppingCart },
      { label: 'Factures fournisseurs', href: ROUTES.SUPPLIER_INVOICES, icon: FileInput },
      {
        label: 'Dépenses & Frais', href: ROUTES.EXPENSES, icon: Wallet,
        children: [
          { label: 'Notes de frais', href: ROUTES.EXPENSES,           icon: ReceiptText },
          { label: 'Catégories',     href: ROUTES.EXPENSE_CATEGORIES, icon: Tag },
          { label: 'Budgets',        href: ROUTES.EXPENSE_BUDGETS,    icon: PieChart },
        ],
      },
    ],
  },
  {
    title: 'STOCKS & PRODUITS',
    sectionIcon: Warehouse,
    items: [
      {
        label: 'Produits', href: ROUTES.PRODUCTS, icon: Package,
        children: [
          { label: 'Catégories', href: ROUTES.PRODUCT_CATEGORIES, icon: Tag },
        ],
      },
      {
        label: 'Stock', href: ROUTES.STOCK, icon: Warehouse,
        children: [
          { label: 'Mouvements', href: ROUTES.STOCK_MOVEMENTS, icon: ArrowLeftRight },
          { label: 'Niveaux',    href: ROUTES.STOCK_LEVELS,    icon: BarChart2 },
          { label: 'Alertes',    href: ROUTES.STOCK_ALERTS,    icon: AlertTriangle },
        ],
      },
    ],
  },
  {
    title: 'FINANCES',
    sectionIcon: Landmark,
    items: [
      { label: 'Rapports',        href: ROUTES.REPORTS,    icon: BarChart3 },
      { label: 'Banque',          href: ROUTES.BANK,       icon: Landmark,  overlay: 'bank' },
      { label: 'Comptabilité',    href: ROUTES.ACCOUNTING, icon: BookCheck, overlay: 'accounting' },
    ],
  },
  {
    title: 'ADMINISTRATION',
    sectionIcon: ShieldCheck,
    items: [
      { label: 'Utilisateurs',        href: ROUTES.USERS,         icon: UserCog,     roles: ['admin'] },
      { label: 'Rôles & Permissions', href: ROUTES.ROLES,         icon: ShieldCheck, overlay: 'roles', roles: ['admin'] },
      { label: 'Approbations',        href: ROUTES.APPROVALS,     icon: CheckSquare, approvalBadge: true, roles: ['admin'] },
      { label: 'Notifications',       href: ROUTES.NOTIFICATIONS, icon: Bell, bell: true },
      { label: "Journal d'audit",     href: ROUTES.AUDIT,         icon: ClipboardList, roles: ['admin'] },
    ],
  },
]

// Footer items (shown below nav, above the settings button)
const FOOTER_NAV: Pick<NavItem, 'label' | 'href' | 'icon' | 'external'>[] = [
  { label: 'Guide',         href: ROUTES.GUIDE,     icon: BookOpen, external: true },
]

// ─── Sidebar component ────────────────────────────────────────
export function Sidebar() {
  const pathname   = usePathname()
  const user       = useAuthStore((s) => s.user)
  const notifCount    = useUnreadCount()
  const { data: approvalCountData } = useApprovalPendingCount()
  const approvalCount = approvalCountData?.count ?? 0

  const { collapsed, mobileOpen, overlayPanel, setCollapsed, setMobileOpen, setOverlayPanel, toggle } = useSidebarStore()

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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    NAV.forEach((s) => { initial[s.title] = false })
    return initial
  })

  // Auto-expand parent items when navigating to a child route
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

  // Auto-open overlay panel when navigating to a sub-route of an overlay item
  useEffect(() => {
    for (const section of NAV) {
      for (const item of section.items) {
        if (item.overlay && pathname.startsWith(item.href)) {
          setOverlayPanel(item.overlay)
          return
        }
      }
    }
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
  useEffect(() => { setMobileOpen(false) }, [pathname, setMobileOpen])

  // ESC closes mobile sidebar
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (mobileOpen) setMobileOpen(false)
  }, [mobileOpen, setMobileOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  const isActive = (href: string) =>
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

      {/* Main nav */}
      <nav
        aria-label="Navigation principale"
        className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {NAV.map((section, sectionIdx) => (
          <div key={section.title} style={{ marginTop: sectionIdx === 0 ? 4 : 0 }}>
            {!collapsed && (
              <>
                {sectionIdx > 0 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 12px' }} />
                )}
                <button
                  onClick={() => setOpenSections((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
                  className="nav-section-title flex items-center justify-between w-full"
                  style={{
                    padding: '8px 12px 6px',
                    fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 800,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: 'rgba(150,190,230,0.9)', border: 'none', background: 'transparent', cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <section.sectionIcon size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {section.title}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, marginLeft: 4, color: 'rgba(120,170,210,0.5)' }}>
                    <ChevronDown
                      size={10}
                      aria-hidden="true"
                      style={{ transition: 'transform 0.2s', transform: openSections[section.title] ? 'rotate(180deg)' : 'none' }}
                    />
                  </span>
                </button>
              </>
            )}

            {collapsed && (
              <div style={{
                height: sectionIdx > 0 ? 8 : 2,
                borderTop: sectionIdx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                margin: sectionIdx > 0 ? '0 8px' : 0,
              }} />
            )}

            {(!collapsed ? openSections[section.title] : true) && section.items
              .filter((item) => !item.roles || item.roles.includes(user?.role ?? ''))
              .map((item) => {
                const isOverlayItem  = !!item.overlay
                const isOverlayActive = item.overlay ? overlayPanel === item.overlay : false
                const isPathActive    = isActive(item.href)
                const active          = isPathActive || isOverlayActive
                const childActive     = isChildActive(item)
                const Icon            = item.icon
                const badgeNum        = item.bell ? notifCount : item.approvalBadge ? approvalCount : 0
                const hasBadge        = badgeNum > 0
                const badgeLabel      = hasBadge ? ` — ${badgeNum}` : ''
                const visibleChildren = item.children?.filter((c) => !c.roles || c.roles.includes(user?.role ?? ''))
                const hasChildren     = !collapsed && !!visibleChildren && visibleChildren.length > 0
                const isOpen          = !collapsed && (openItems[item.href] || childActive)

                const itemStyles: React.CSSProperties = {
                  flex: 1,
                  color:          (active || childActive) ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                  background:     active ? 'var(--sidebar-active-bg)' : 'transparent',
                  fontFamily:     'var(--font-body)',
                  fontSize:       13,
                  fontWeight:     (active || childActive) ? 600 : 400,
                  textDecoration: 'none',
                  letterSpacing:  '0.01em',
                  minWidth:       0,
                  minHeight:      36,
                  display:        'flex',
                  alignItems:     'center',
                  gap:            8,
                  borderRadius:   8,
                  padding:        collapsed ? '0' : '0 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  position:       'relative',
                  border:         'none',
                  cursor:         'pointer',
                  width:          '100%',
                }

                const innerContent = (
                  <>
                    {active && !isOverlayItem && (
                      <span
                        className="absolute top-1 bottom-1 rounded-r-full"
                        style={{ left: -8, width: 3, background: 'var(--primary)' }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative flex-shrink-0">
                      <Icon
                        size={15}
                        strokeWidth={(active || childActive) ? 2.2 : 1.8}
                        aria-hidden="true"
                        style={{ color: (active || childActive) ? 'var(--primary)' : 'inherit' }}
                      />
                      {hasBadge && (
                        <span
                          aria-hidden="true"
                          className="badge-pulse absolute flex items-center justify-center rounded-full text-white"
                          style={{ top: -5, right: -5, width: 15, height: 15, background: '#ef4444', fontSize: 9, fontWeight: 700 }}
                        >
                          {badgeNum > 9 ? '9+' : badgeNum}
                        </span>
                      )}
                    </span>
                    <span
                      className="sidebar-label flex-1 truncate"
                      aria-hidden={collapsed}
                      style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s, width 0.2s' }}
                    >
                      {item.label}
                    </span>
                    {!collapsed && hasBadge && (
                      <>
                        <span
                          aria-hidden="true"
                          className="rounded-full text-white flex items-center justify-center"
                          style={{ background: '#ef4444', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px' }}
                        >
                          {badgeNum}
                        </span>
                        <span className="sr-only">{badgeNum}</span>
                      </>
                    )}
                  </>
                )

                const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.color      = 'var(--sidebar-text-hover)'
                  }
                }
                const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color      = (active || childActive) ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)'
                  }
                }

                return (
                  <div key={item.href} className="nav-item px-2">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {isOverlayItem ? (
                        <button
                          type="button"
                          aria-label={collapsed ? `${item.label}${badgeLabel}` : undefined}
                          aria-expanded={isOverlayActive}
                          aria-haspopup="true"
                          onClick={() => setOverlayPanel(overlayPanel === item.overlay ? null : item.overlay!)}
                          style={itemStyles}
                          onMouseEnter={handleMouseEnter}
                          onMouseLeave={handleMouseLeave}
                        >
                          {innerContent}
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          target={item.external ? '_blank' : undefined}
                          rel={item.external ? 'noopener noreferrer' : undefined}
                          aria-label={collapsed ? `${item.label}${badgeLabel}` : undefined}
                          aria-current={isPathActive ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-2 rounded-lg transition-all duration-150',
                            collapsed ? 'justify-center px-0 py-1' : 'px-2.5 py-1',
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
                            minHeight:      36,
                            display:        'flex',
                            alignItems:     'center',
                          }}
                          onMouseEnter={handleMouseEnter}
                          onMouseLeave={handleMouseLeave}
                        >
                          {innerContent}
                        </Link>
                      )}

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

                    {hasChildren && isOpen && (
                      <div style={{
                        marginLeft: 27, marginTop: 2, marginBottom: 6,
                        borderLeft: '1.5px solid rgba(45,125,210,0.35)',
                      }}>
                        {item.children!
                          .filter((child) => !child.roles || child.roles.includes(user?.role ?? ''))
                          .map((child) => {
                            const childIsActive = pathname === child.href || pathname.startsWith(child.href + '/')
                            const ChildIcon = child.icon
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                aria-current={childIsActive ? 'page' : undefined}
                                className="flex items-center gap-2 rounded-md transition-all duration-150"
                                style={{
                                  padding: '4px 8px 4px 14px', fontSize: 12.5,
                                  color:          childIsActive ? '#fff' : 'rgba(255,255,255,0.6)',
                                  background:     childIsActive ? 'rgba(45,125,210,0.18)' : 'transparent',
                                  fontFamily:     'var(--font-body)',
                                  fontWeight:     childIsActive ? 600 : 400,
                                  textDecoration: 'none', display: 'flex', alignItems: 'center',
                                  minHeight: 30, position: 'relative',
                                }}
                                onMouseEnter={(e) => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                                    e.currentTarget.style.color      = 'rgba(255,255,255,0.9)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!childIsActive) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color      = 'rgba(255,255,255,0.6)'
                                  }
                                }}
                              >
                                <span aria-hidden="true" style={{
                                  position: 'absolute', left: 0, top: '50%',
                                  width: 10, height: 1.5,
                                  background: childIsActive ? 'rgba(45,125,210,0.8)' : 'rgba(255,255,255,0.2)',
                                  transform: 'translateY(-50%)', flexShrink: 0,
                                }} />
                                <ChildIcon
                                  size={12} strokeWidth={childIsActive ? 2.2 : 1.8}
                                  aria-hidden="true"
                                  style={{ flexShrink: 0, color: childIsActive ? 'var(--primary)' : 'rgba(255,255,255,0.45)' }}
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

      {/* Footer nav — BTS Assistant, Guide, Paramètres */}
      <div
        style={{
          padding:   '4px 8px 8px',
          borderTop: '1px solid var(--sidebar-border)',
          flexShrink: 0,
        }}
      >
        {FOOTER_NAV.map((item) => {
          const active = isActive(item.href)
          const Icon   = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2 rounded-lg transition-all duration-150',
                collapsed ? 'justify-center px-0 py-1' : 'px-2.5 py-1',
              )}
              style={{
                color:          active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                background:     active ? 'var(--sidebar-active-bg)' : 'transparent',
                fontFamily:     'var(--font-body)',
                fontSize:       13,
                fontWeight:     active ? 600 : 400,
                textDecoration: 'none',
                minHeight:      36,
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
                  e.currentTarget.style.color      = 'var(--sidebar-text)'
                }
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true"
                style={{ color: active ? 'var(--primary)' : 'inherit', flexShrink: 0 }} />
              <span
                className="sidebar-label flex-1 truncate"
                aria-hidden={collapsed}
                style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s, width 0.2s' }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}

        {/* Paramètres → overlay */}
        <button
          type="button"
          onClick={() => setOverlayPanel(overlayPanel === 'settings' ? null : 'settings')}
          aria-expanded={overlayPanel === 'settings'}
          aria-haspopup="true"
          aria-label={collapsed ? 'Paramètres' : undefined}
          className={cn(
            'relative flex items-center gap-2 rounded-lg transition-all duration-150 w-full',
            collapsed ? 'justify-center px-0 py-1' : 'px-2.5 py-1',
          )}
          style={{
            color:          overlayPanel === 'settings' ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
            background:     overlayPanel === 'settings' ? 'var(--sidebar-active-bg)' : 'transparent',
            fontFamily:     'var(--font-body)',
            fontSize:       13,
            fontWeight:     overlayPanel === 'settings' ? 600 : 400,
            border:         'none',
            cursor:         'pointer',
            minHeight:      36,
          }}
          onMouseEnter={(e) => {
            if (overlayPanel !== 'settings') {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color      = 'var(--sidebar-text-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (overlayPanel !== 'settings') {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color      = 'var(--sidebar-text)'
            }
          }}
        >
          <Settings
            size={15}
            strokeWidth={overlayPanel === 'settings' ? 2.2 : 1.8}
            aria-hidden="true"
            style={{ color: overlayPanel === 'settings' ? 'var(--primary)' : 'inherit', flexShrink: 0 }}
          />
          <span
            className="sidebar-label flex-1 truncate text-left"
            aria-hidden={collapsed}
            style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s, width 0.2s' }}
          >
            Paramètres
          </span>
        </button>
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
        <aside
          aria-label="Barre latérale"
          className={cn('relative flex flex-col overflow-hidden', collapsed && 'sidebar-collapsed')}
          style={{ background: 'var(--sidebar-bg)', width: '100%', height: '100%' }}
        >
          {sidebarInner}
        </aside>

        {/* Collapse toggle button */}
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
          {collapsed
            ? <PanelLeftOpen  size={15} strokeWidth={2} aria-hidden="true" />
            : <PanelLeftClose size={15} strokeWidth={2} aria-hidden="true" />
          }
        </button>
      </div>

      {/* ── Mobile sidebar — overlay fixe ─────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            style={{ background: 'var(--sidebar-bg)', width: 'var(--sidebar-w)' }}
            className="fixed left-0 top-0 h-screen flex flex-col overflow-hidden z-50 lg:hidden"
          >
            {sidebarInner}
          </aside>
        </>
      )}

      {/* ── Overlay panel (Bank, Accounting, Roles, Settings) ─── */}
      {overlayPanel && (
        <OverlaySubNav
          panelId={overlayPanel}
          onClose={() => setOverlayPanel(null)}
        />
      )}
    </>
  )
}
