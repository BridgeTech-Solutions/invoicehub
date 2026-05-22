export default function RolesLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} aria-hidden="true">
      {/* KPI strip skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 22, width: '50%', background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 11, width: '70%', background: 'var(--border)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      {/* Cards grid skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 11, width: '40%', background: 'var(--border)', borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 999 }} />
            <div style={{ height: 11, width: '50%', background: 'var(--border)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
