export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 260, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 32, width: 80, borderRadius: 99, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', width: `${80 - i * 3}px`, flexShrink: 0 }} />
            <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
