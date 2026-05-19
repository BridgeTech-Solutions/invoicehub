export default function StockLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ height: 22, width: 200, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
          <div style={{ height: 13, width: 280, background: 'var(--border)', borderRadius: 4, marginTop: 8 }} className="animate-pulse" />
        </div>
        <div style={{ height: 36, width: 140, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ height: 11, width: 120, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)' }} className="animate-pulse" />
            </div>
            <div style={{ height: 26, width: 160, background: 'var(--border)', borderRadius: 4, marginBottom: 10 }} className="animate-pulse" />
            <div style={{ height: 11, width: 90, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card" style={{ height: 320 }} />
        <div className="card" style={{ height: 320 }} />
      </div>
    </div>
  )
}
