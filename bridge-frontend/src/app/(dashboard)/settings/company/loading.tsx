export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header skeleton */}
      <div>
        <div style={{ height: 28, width: 220, background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} className="animate-pulse" />
        <div style={{ height: 14, width: 380, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      </div>
      {/* 2-column grid — identité + coordonnées */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ height: 280 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        </div>
        <div className="card" style={{ height: 280 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        </div>
      </div>
      {/* Finance card */}
      <div className="card" style={{ height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
    </div>
  )
}
