export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 260, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px', borderLeft: '3px solid var(--border)', height: 80, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 36, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: i === 0 ? 1 : '0 0 140px' }} />
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '9px 10px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {Array.from({ length: 7 }).map((__, j) => (
              <div key={j} style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: j === 3 ? 2 : 1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
