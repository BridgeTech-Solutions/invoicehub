export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 220, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ height: 320, animation: 'pulse 1.5s infinite' }} />
          <div className="card" style={{ height: 180, animation: 'pulse 1.5s infinite' }} />
        </div>
        <div className="card" style={{ height: 240, animation: 'pulse 1.5s infinite', position: 'sticky', top: 80 }} />
      </div>
    </div>
  )
}
