export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 240, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 20, height: 160, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    </div>
  )
}
