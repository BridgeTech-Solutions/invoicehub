export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Notification prefs card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 18, width: 220, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} className="animate-pulse" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 8px', alignItems: 'center' }}>
            <div style={{ flex: 1, height: 13, background: 'var(--border)', borderRadius: 4 }} className="animate-pulse" />
            <div style={{ width: 36, height: 20, background: 'var(--border)', borderRadius: 10 }} className="animate-pulse" />
            <div style={{ width: 140, height: 30, background: 'var(--border)', borderRadius: 8 }} className="animate-pulse" />
          </div>
        ))}
      </div>
      {/* Reminder days card */}
      <div className="card" style={{ height: 140 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
      {/* Escalation card */}
      <div className="card" style={{ height: 200 }}>
        <div style={{ height: '100%', background: 'var(--border)', borderRadius: 'var(--radius-md)' }} className="animate-pulse" />
      </div>
      {/* Email templates card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ height: 16, width: 180, background: 'var(--border)', borderRadius: 4, marginBottom: 14 }} className="animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 48, background: 'var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6 }} className="animate-pulse" />
        ))}
      </div>
    </div>
  )
}
