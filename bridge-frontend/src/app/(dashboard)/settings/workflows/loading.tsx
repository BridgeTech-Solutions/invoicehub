export default function WorkflowsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 22, width: 240, background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 14, width: 280, background: 'var(--border)', borderRadius: 4 }} />
        </div>
        <div className="animate-pulse" style={{ height: 36, width: 160, background: 'var(--border)', borderRadius: 10 }} />
      </div>
      <div className="animate-pulse" style={{ height: 48, background: 'var(--border)', borderRadius: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 11, width: '80%', background: 'var(--border)', borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ height: 10, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: 160, background: 'var(--border)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
