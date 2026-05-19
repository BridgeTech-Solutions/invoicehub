export default function StockLevelsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ height: 22, width: 180, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
          <div style={{ height: 13, width: 140, background: 'var(--border)', borderRadius: 4, marginTop: 8 }} className="animate-pulse" />
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          <div style={{ height: 36, flex: 1, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          <div style={{ height: 36, width: 200, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 40px', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {[180, 80, 80, 100, 70, 60].map((w, j) => (
              <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
            <div style={{ width: 24, height: 24, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
