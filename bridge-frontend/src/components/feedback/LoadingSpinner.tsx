import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function LoadingSpinner({ size = 20, className, label }: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex items-center justify-center gap-3', className)}
      style={{ fontFamily: 'var(--font-body)', color: 'var(--text-3)', fontSize: 13 }}
    >
      <Loader2 size={size} className="animate-spin" style={{ color: 'var(--primary)' }} />
      {label && <span>{label}</span>}
    </div>
  )
}
