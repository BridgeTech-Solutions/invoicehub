'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Entreprise',    href: '/settings/company' },
  { label: 'Facturation',   href: '/settings/billing' },
  { label: 'Sécurité',      href: '/settings/security' },
  { label: 'Notifications', href: '/settings/notifications' },
  { label: 'Sauvegardes',   href: '/settings/backups' },
]

export function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Navigation des paramètres">
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '8px 16px',
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 13.5,
                fontFamily: 'var(--font-body)',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--primary)' : 'var(--text-2)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
