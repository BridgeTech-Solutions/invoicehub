export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, height: 42, width: 220, borderRadius: 8, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20, height: 180, animation: 'pulse 1.5s infinite' }} />
          <div className="card" style={{ padding: 20, height: 300, animation: 'pulse 1.5s infinite' }} />
        </div>
        <div className="card" style={{ height: 260, animation: 'pulse 1.5s infinite', position: 'sticky', top: 80 }} />
      </div>
    </div>
  )
}
