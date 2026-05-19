export default function WorkflowRulesLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 22, width: 180, background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 14, width: 300, background: 'var(--border)', borderRadius: 4 }} />
        </div>
        <div className="animate-pulse" style={{ height: 36, width: 140, background: 'var(--border)', borderRadius: 10 }} />
      </div>

      {/* Info banner skeleton */}
      <div className="animate-pulse" style={{ height: 48, background: 'var(--border)', borderRadius: 10 }} />

      {/* Filter pills skeleton */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[80, 70, 85, 70, 75, 65, 60].map((w, i) => (
          <div key={i} className="animate-pulse" style={{ height: 32, width: w, background: 'var(--border)', borderRadius: 100 }} />
        ))}
      </div>

      {/* Cards skeleton — 2 col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 20px', borderLeft: '3px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 11, width: '80%', background: 'var(--border)', borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ height: 28, width: 64, borderRadius: 100, background: 'var(--border)' }} />
                <div style={{ height: 32, width: 32, borderRadius: 8, background: 'var(--border)' }} />
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ height: 10, width: 120, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ height: 22, width: 110, borderRadius: 100, background: 'var(--border)' }} />
                <div style={{ height: 22, width: 90, borderRadius: 100, background: 'var(--border)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
