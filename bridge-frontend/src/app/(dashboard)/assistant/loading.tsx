export default function AssistantLoading() {
  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - var(--topbar-h) - clamp(12px, 2.5vw, 24px) * 2)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--border)',
    }}>
      {/* Sidebar skeleton */}
      <div style={{
        width: 220,
        background: 'linear-gradient(180deg, #0c2340 0%, #0f2d4a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        padding: 12,
      }}>
        <div style={{ width: '80%', height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />
        <div style={{ width: '100%', height: 32, borderRadius: 8, background: 'rgba(45,125,210,0.12)', marginBottom: 16 }} />
        {[0.7, 0.5, 0.6, 0.4].map((op, i) => (
          <div key={i} style={{ width: `${op * 100}%`, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.04)', marginBottom: 6 }} />
        ))}
      </div>
      {/* Chat skeleton */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #0f2d4a, #2D7DD2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff',
          }}>✦</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Chargement de BTS Assistant…</p>
        </div>
      </div>
    </div>
  )
}
