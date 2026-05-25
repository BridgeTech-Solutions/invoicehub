export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Session + Login attempts — 2 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ height: 160 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        </div>
        <div className="card" style={{ height: 160 }}>
          <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
        </div>
      </div>
      {/* 2FA card */}
      <div className="card" style={{ height: 120 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
      {/* Active sessions card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 44, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 12 }} className="animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 66, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8 }} className="animate-pulse" />
        ))}
      </div>
    </div>
  )
}
