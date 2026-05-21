export default function BankImportLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ height: 22, width: 260, borderRadius: 6, background: 'var(--border)', marginBottom: 8 }} className="animate-pulse" />
          <div style={{ height: 13, width: 140, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
        </div>
      </div>

      {/* Step indicator */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)' }} className="animate-pulse" />
              <div style={{ height: 12, width: 80, borderRadius: 4, background: 'var(--border)' }} className="animate-pulse" />
              {i < 2 && <div style={{ width: 60, height: 2, background: 'var(--border)', marginLeft: 8, marginRight: 8 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="card" style={{ padding: '24px', height: 300 }}>
        <div style={{ height: 14, width: '40%', borderRadius: 4, background: 'var(--border)', marginBottom: 16 }} className="animate-pulse" />
        <div style={{ height: 140, borderRadius: 'var(--radius-md)', background: 'var(--border)', marginBottom: 16 }} className="animate-pulse" />
        <div style={{ height: 38, width: 160, borderRadius: 'var(--radius-md)', background: 'var(--border)' }} className="animate-pulse" />
      </div>
    </div>
  )
}
