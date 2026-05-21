export default function ReconciliationWorkspaceLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)', overflow: 'hidden' }}>
      {/* Sticky header skeleton */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ height: 34, width: 34, borderRadius: 'var(--radius-sm)', background: 'var(--border)' }} className="animate-pulse" />
          <div>
            <div style={{ height: 16, width: 220, borderRadius: 4, background: 'var(--border)', marginBottom: 6 }} className="animate-pulse" />
            <div style={{ height: 11, width: 160, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ height: 34, width: 110, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ height: 34, width: 90, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
        </div>
      </div>

      {/* Balance bar skeleton */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        {[140, 140, 100, 200].map((w, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 10, width: w * 0.5, borderRadius: 3, background: 'var(--border)' }} className="animate-pulse" />
            <div style={{ height: 18, width: w, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
          </div>
        ))}
      </div>

      {/* Split workspace skeleton */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{ borderRight: '1px solid var(--border)' }}>
          <div style={{ height: 40, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
          <div style={{ padding: 4 }}>
            {[...Array(10)].map((_, i) => (
              <div key={i} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, width: `${55 + (i % 3) * 10}%`, borderRadius: 4, background: 'var(--border)', marginBottom: 5 }} className="animate-pulse" />
                  <div style={{ height: 10, width: '35%', borderRadius: 3, background: 'var(--border)' }} className="animate-pulse" />
                </div>
                <div style={{ height: 12, width: 80, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ height: 14, width: 180, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
          <div style={{ height: 11, width: 240, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
        </div>
      </div>
    </div>
  )
}
