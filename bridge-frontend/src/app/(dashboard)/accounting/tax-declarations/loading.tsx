export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 280, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ height: 36, width: 160, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px', borderLeft: '3px solid var(--border)', height: 86, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card" style={{ height: 180, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 44, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {Array.from({ length: 6 }).map((__, j) => (
              <div key={j} style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: j === 0 ? '0 0 80px' : 1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
