import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Boutons d'action à droite (ex: "+ Nouveau client") */
  actions?: React.ReactNode
  className?: string
}

/**
 * PageHeader — en-tête standard de page avec titre, description et actions
 * Utilisé sur toutes les pages liste et détail
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 mb-6', className)}
      style={{ flexWrap: 'wrap' }}
    >
      <div>
        <h1
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              marginTop: 4,
              fontSize: 13.5,
              color: 'var(--text-3)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
