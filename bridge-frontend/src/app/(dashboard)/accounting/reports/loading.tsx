export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 300, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ height: 36, width: 160, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 36, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: i === 0 ? '0 0 160px' : i === 2 ? '0 0 200px' : 1 }} />
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 36, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <div style={{ height: 13, width: 60, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
            <div style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: 2 }} />
            <div style={{ height: 13, width: 90, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
            <div style={{ height: 13, width: 90, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
            <div style={{ height: 13, width: 80, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
