interface BankAccountBadgeProps {
  name:    string
  color?:  string | null
  size?:   'sm' | 'md'
}

export function BankAccountBadge({ name, color, size = 'md' }: BankAccountBadgeProps) {
  const dotSize  = size === 'sm' ? 8  : 10
  const fontSize = size === 'sm' ? 12 : 13

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      maxWidth: 160,
    }}>
      <span style={{
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        background: color ?? 'var(--primary)',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize,
        color: 'var(--text-2)',
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
    </span>
  )
}
