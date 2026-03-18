export default function NotificationsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-pulse">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ height: 14, width: 200, background: 'var(--border)', borderRadius: 5 }} />
        <div style={{ height: 36, width: 140, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ height: 34, width: 80, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
        <div style={{ height: 34, width: 100, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
      </div>
      {/* Items */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card" style={{ display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 9, width: '40%', background: 'var(--border)', borderRadius: 4 }} />
          </div>
          <div style={{ height: 9, width: 60, background: 'var(--border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
