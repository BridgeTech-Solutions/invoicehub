'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuthStore } from '@/features/auth/store'
import { useSidebarStore } from '@/store/sidebar'
import { OVERLAY_PANELS } from './overlay-panels'

interface OverlaySubNavProps {
  panelId: string
  onClose: () => void
}

export function OverlaySubNav({ panelId, onClose }: OverlaySubNavProps) {
  const pathname  = usePathname()
  const user      = useAuthStore((s) => s.user)
  const collapsed = useSidebarStore((s) => s.collapsed)

  const panel = OVERLAY_PANELS[panelId]
  if (!panel) return null

  const PanelIcon = panel.icon

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <nav
        aria-label={panel.title}
        style={{
          position:      'fixed',
          top:           0,
          left:          collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
          height:        '100vh',
          width:         220,
          background:    'var(--surface)',
          borderRight:   '1px solid var(--border)',
          boxShadow:     '4px 0 24px rgba(0,0,0,0.10)',
          zIndex:        30,
          display:       'flex',
          flexDirection: 'column',
          animation:     'slideInLeft 0.22s cubic-bezier(0.4,0,0.2,1)',
          overflowY:     'auto',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            padding:        '0 16px',
            borderBottom:   '1px solid var(--border)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            height:         'var(--topbar-h)',
            flexShrink:     0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PanelIcon size={16} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <span style={{
              fontSize:   14,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color:      'var(--text-1)',
            }}>
              {panel.title}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le panneau"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
              color: 'var(--text-3)', transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {panel.sections.map((section, si) => {
            const visibleItems = section.items.filter(
              (item) => !item.roles || item.roles.includes(user?.role ?? ''),
            )
            if (!visibleItems.length) return null

            return (
              <div key={section.title}>
                <p style={{
                  padding:       '8px 16px 4px',
                  fontSize:      10.5,
                  fontWeight:    700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color:         'var(--text-3)',
                  fontFamily:    'var(--font-display)',
                  margin:        0,
                }}>
                  {section.title}
                </p>

                {visibleItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        gap:            10,
                        padding:        '7px 16px',
                        fontSize:       13,
                        fontFamily:     'var(--font-body)',
                        fontWeight:     active ? 600 : 400,
                        color:          active ? 'var(--primary)' : 'var(--text-2)',
                        background:     active ? 'var(--primary-light)' : 'transparent',
                        textDecoration: 'none',
                        borderRadius:   6,
                        margin:         '1px 8px',
                        transition:     'background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'var(--surface-2)'
                          e.currentTarget.style.color = 'var(--text-1)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-2)'
                        }
                      }}
                    >
                      <ItemIcon
                        size={14}
                        strokeWidth={active ? 2.2 : 1.8}
                        aria-hidden="true"
                        style={{ color: active ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }}
                      />
                      {item.label}
                    </Link>
                  )
                })}

                {si < panel.sections.length - 1 && (
                  <div style={{ height: 1, background: 'var(--border)', margin: '6px 16px' }} />
                )}
              </div>
            )
          })}
        </div>
      </nav>
    </>
  )
}
