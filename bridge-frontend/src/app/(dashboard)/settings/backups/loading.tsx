export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info banner */}
      <div style={{ height: 64, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      {/* Header + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ height: 14, width: 160, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ height: 36, width: 110, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          <div style={{ height: 36, width: 200, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
        </div>
      </div>
      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ height: 40, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {[180, 100, 80, 100, 80].map((w, j) => (
              <div key={j} style={{ height: 11, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
