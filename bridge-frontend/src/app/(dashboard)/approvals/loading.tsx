export default function ApprovalsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 22, width: 160, background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 14, width: 260, background: 'var(--border)', borderRadius: 4 }} />
        </div>
        <div className="animate-pulse" style={{ height: 36, width: 160, background: 'var(--border)', borderRadius: 10 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[60, 90, 100, 90, 80].map((w, i) => (
          <div key={i} className="animate-pulse" style={{ height: 32, width: w, background: 'var(--border)', borderRadius: 100 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 20px', borderLeft: '3px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: 14, width: '65%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 11, width: '40%', background: 'var(--border)', borderRadius: 4 }} />
              </div>
              <div style={{ height: 20, width: 120, background: 'var(--border)', borderRadius: 4 }} />
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 14 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
