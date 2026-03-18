import { cn } from '@/lib/utils'
import { STATUS_LABELS } from '@/lib/constants'

const STATUS_CLASS: Record<string, string> = {
  draft:          'badge-draft',
  sent:           'badge-sent',
  issued:         'badge-issued',
  accepted:       'badge-accepted',
  rejected:       'badge-rejected',
  paid:           'badge-paid',
  partially_paid: 'badge-partial',
  overdue:        'badge-overdue',
  cancelled:      'badge-cancelled',
  expired:        'badge-expired',
  active:         'badge-accepted',
  archived:       'badge-cancelled',
}

interface StatusBadgeProps {
  status: string
  dot?: boolean
  className?: string
}

export function StatusBadge({ status, dot = true, className }: StatusBadgeProps) {
  const cls = STATUS_CLASS[status] ?? 'badge-draft'
  const label = STATUS_LABELS[status] ?? status

  return (
    <span className={cn('badge', cls, className)}>
      {dot && <span className="badge-dot" style={{ background: 'currentColor' }} />}
      {label}
    </span>
  )
}
