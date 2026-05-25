export default function ExportsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div className="animate-pulse" style={{ height: 28, width: 220, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
        <div className="animate-pulse" style={{ height: 16, width: 380, borderRadius: 4, background: 'var(--surface-2)' }} />
      </div>

      {/* Info banner */}
      <div className="animate-pulse" style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />

      {/* Create form card */}
      <div className="card">
        <div className="animate-pulse" style={{ height: 20, width: 140, borderRadius: 4, background: 'var(--surface-2)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="animate-pulse" style={{ height: 14, width: 70, borderRadius: 4, background: 'var(--surface-2)', marginBottom: 6 }} />
              <div className="animate-pulse" style={{ height: 42, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
            </div>
          ))}
          <div className="animate-pulse" style={{ height: 44, width: 140, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', alignSelf: 'flex-end' }} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div className="animate-pulse" style={{ height: 40, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 110px 100px 120px 80px',
            gap: 12, padding: '12px 16px', alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
          }}>
            <div className="animate-pulse" style={{ height: 14, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 14, borderRadius: 4, background: 'var(--surface-2)', width: '70%' }} />
            <div className="animate-pulse" style={{ height: 22, width: 72, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 22, width: 80, borderRadius: 100, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 14, borderRadius: 4, background: 'var(--surface-2)' }} />
            <div className="animate-pulse" style={{ height: 36, width: 110, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
