export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 200, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ height: 40, flex: 1, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: 40, width: 160, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      </div>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', height: 44, background: 'var(--surface-2)' }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
            {Array.from({ length: 5 }).map((__, j) => (
              <div key={j} style={{ height: 13, borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.5s infinite', flex: j === 2 ? 2 : 1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
