export default function WebhooksLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="animate-pulse" style={{ height: 28, width: 140, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 8 }} />
          <div className="animate-pulse" style={{ height: 16, width: 360, borderRadius: 4, background: 'var(--surface-2)' }} />
        </div>
        <div className="animate-pulse" style={{ height: 44, width: 160, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      </div>
      <div className="animate-pulse" style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card animate-pulse" style={{ height: 120 }} />
      ))}
    </div>
  )
}
