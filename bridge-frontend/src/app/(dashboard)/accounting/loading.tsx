export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, height: 42, width: 240, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: '18px 20px', borderLeft: '3px solid var(--border)', height: 96, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div className="card" style={{ height: 280, animation: 'pulse 1.5s infinite' }} />
    </div>
  )
}
