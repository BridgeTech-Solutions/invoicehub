export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header skeleton */}
      <div>
        <div style={{ height: 28, width: 240, background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} className="animate-pulse" />
        <div style={{ height: 14, width: 340, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      {/* Logo card */}
      <div className="card" style={{ height: 180 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
      {/* Header/footer card */}
      <div className="card" style={{ height: 280 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
      {/* Stamp/signature card */}
      <div className="card" style={{ height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
    </div>
  )
}
