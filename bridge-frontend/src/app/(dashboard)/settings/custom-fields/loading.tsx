export default function CustomFieldsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 28, width: 240, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 16, width: 380, borderRadius: 4, background: 'var(--surface-2)' }} />
        </div>
        <div className="animate-pulse" style={{ height: 44, width: 160, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      </div>
      <div className="animate-pulse" style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[100, 80, 120, 100, 90, 110].map((w, i) => (
          <div key={i} className="animate-pulse" style={{ height: 38, width: w, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
        ))}
      </div>
      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ height: 36, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 140px 120px 80px 80px',
            gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)', marginBottom: 4, width: '60%' }} />
              <div className="animate-pulse" style={{ height: 12, borderRadius: 4, background: 'var(--surface-2)', width: '40%' }} />
            </div>
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
