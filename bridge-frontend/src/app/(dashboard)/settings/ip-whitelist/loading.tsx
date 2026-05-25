export default function IpWhitelistLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 28, width: 160, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 16, width: 320, borderRadius: 4, background: 'var(--surface-2)' }} />
        </div>
        <div className="animate-pulse" style={{ height: 44, width: 150, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      </div>
      <div className="animate-pulse" style={{ height: 52, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="animate-pulse" style={{ height: 44, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }} />
        <div style={{ height: 36, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '200px 1fr 120px 100px',
            gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
