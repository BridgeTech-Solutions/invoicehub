export default function ProductHistoryLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 22, width: 260, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ height: 11, width: 80, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 18, width: 100, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {[100, 120, 80, 80, 100, 80].map((w, j) => (
              <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
