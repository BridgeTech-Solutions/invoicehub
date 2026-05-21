export default function BankAccountsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ height: 22, width: 220, borderRadius: 6, background: 'var(--border)', marginBottom: 8 }} className="animate-pulse" />
          <div style={{ height: 13, width: 100, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
        </div>
        <div style={{ height: 38, width: 140, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
      </div>

      {/* KPI cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '16px 20px', height: 90 }}>
            <div style={{ height: 10, width: '55%', borderRadius: 4, background: 'var(--border)', marginBottom: 12 }} className="animate-pulse" />
            <div style={{ height: 24, width: '70%', borderRadius: 4, background: 'var(--border)', marginBottom: 8 }} className="animate-pulse" />
            <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
          </div>
        ))}
      </div>

      {/* Account cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 4, background: 'var(--border)' }} />
            <div style={{ padding: '16px 18px' }}>
              <div style={{ height: 13, width: '65%', borderRadius: 4, background: 'var(--border)', marginBottom: 10 }} className="animate-pulse" />
              <div style={{ height: 10, width: '45%', borderRadius: 4, background: 'var(--border)', marginBottom: 14 }} className="animate-pulse" />
              <div style={{ height: 20, width: '50%', borderRadius: 4, background: 'var(--border)', marginBottom: 12 }} className="animate-pulse" />
              <div style={{ height: 10, width: '35%', borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
            </div>
            <div style={{ height: 36, background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
