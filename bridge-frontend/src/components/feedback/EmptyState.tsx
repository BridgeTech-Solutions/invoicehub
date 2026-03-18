import { type LucideIcon, Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        gap: 12,
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <Icon size={22} strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
      </div>

      <p
        className="font-display"
        style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}
      >
        {title}
      </p>

      {description && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', maxWidth: 320 }}>
          {description}
        </p>
      )}

      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
