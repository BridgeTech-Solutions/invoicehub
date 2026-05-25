export default function ApiKeysLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 28, width: 160, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 16, width: 340, borderRadius: 4, background: 'var(--surface-2)' }} />
        </div>
        <div className="animate-pulse" style={{ height: 44, width: 140, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      </div>

      {/* Info banner */}
      <div className="animate-pulse" style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="animate-pulse" style={{ height: 44, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }} />
        <div style={{ height: 36, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 160px 130px 100px',
            gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)', marginBottom: 4, width: '60%' }} />
              <div className="animate-pulse" style={{ height: 12, borderRadius: 4, background: 'var(--surface-2)', width: '40%' }} />
            </div>
            <div className="animate-pulse" style={{ height: 24, width: 80, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 16, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 36, width: 90, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
