export default function RoleDetailLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto', width: '100%' }} aria-hidden="true">
      <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
          <div>
            <div style={{ height: 20, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 12, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ height: 14, width: 180, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} className="animate-pulse" />
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ height: 12, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            <div style={{ display: 'flex', gap: 6 }}>
              {[...Array(Math.ceil(Math.random() * 4))].map((_, j) => (
                <div key={j} style={{ height: 22, width: 70, background: 'var(--border)', borderRadius: 100 }} className="animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
