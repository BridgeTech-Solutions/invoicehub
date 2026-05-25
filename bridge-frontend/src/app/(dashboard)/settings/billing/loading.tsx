export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Tax rates card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 16, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 32, width: 120, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 42, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          ))}
        </div>
      </div>
      {/* Offices card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 16, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          <div style={{ height: 32, width: 120, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ height: 42, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
          ))}
        </div>
      </div>
      {/* Sequences card */}
      <div className="card" style={{ height: 180 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
    </div>
  )
}
