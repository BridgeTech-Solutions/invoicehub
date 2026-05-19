export default function StockAlertsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ height: 22, width: 180, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
      <div style={{ display: 'flex', gap: 12 }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '14px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)' }} className="animate-pulse" />
            <div>
              <div style={{ height: 20, width: 40, background: 'var(--border)', borderRadius: 4, marginBottom: 4 }} className="animate-pulse" />
              <div style={{ height: 12, width: 80, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {[180, 80, 80, 80, 60].map((w, j) => (
              <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
            <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
