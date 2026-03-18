export default function SettingsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: '20px 22px' }}>
          <div style={{ height: 12, width: '30%', background: 'var(--border)', borderRadius: 5, marginBottom: 20 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j}>
                <div style={{ height: 9, width: '40%', background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 38, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
