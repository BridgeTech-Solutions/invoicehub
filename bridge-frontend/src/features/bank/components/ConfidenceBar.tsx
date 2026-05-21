interface ConfidenceBarProps {
  value: number   // 0–100
  showLabel?: boolean
}

export function ConfidenceBar({ value, showLabel = true }: ConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const color = clamped >= 90 ? '#16a34a' : clamped >= 70 ? '#d97706' : '#dc2626'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{
        flex: 1,
        height: 5,
        background: 'var(--border)',
        borderRadius: 99,
        overflow: 'hidden',
        minWidth: 48,
      }}>
        <div style={{
          height: '100%',
          width: `${clamped}%`,
          background: color,
          borderRadius: 99,
          transition: 'width 0.4s ease',
        }} />
      </div>
      {showLabel && (
        <span style={{
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          color,
          minWidth: 30,
          textAlign: 'right',
        }}>
          {clamped}%
        </span>
      )}
    </div>
  )
}
