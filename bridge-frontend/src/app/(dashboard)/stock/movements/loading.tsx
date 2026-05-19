export default function MovementsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ height: 22, width: 220, background: 'var(--border)', borderRadius: 6 }} className="animate-pulse" />
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          <div style={{ height: 36, width: 180, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          <div style={{ height: 36, width: 130, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          <div style={{ height: 36, width: 130, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {[140, 120, 80, 80, 100, 80].map((w, j) => (
              <div key={j} style={{ height: 13, width: w, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
