export default function DashboardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI skeletons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '20px 22px', height: 110 }}>
            <div style={{ height: 10, width: '60%', borderRadius: 6, background: 'var(--border)', marginBottom: 16, animation: 'pulse 1.5s ease infinite' }} />
            <div style={{ height: 28, width: '80%', borderRadius: 6, background: 'var(--border)', marginBottom: 10, animation: 'pulse 1.5s ease infinite' }} />
            <div style={{ height: 10, width: '40%', borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 50, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: 52, borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ height: 10, width: '20%', borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s ease infinite' }} />
            <div style={{ height: 10, width: '25%', borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s ease infinite' }} />
            <div style={{ height: 10, width: '15%', borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s ease infinite' }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
