/**
 * Skeleton réutilisable pour les pages tableau — list + filters + pagination
 * Utilisé dans les loading.tsx par route
 */
export function TablePageSkeleton({
  rows = 8,
  cols = 5,
  hasFilters = true,
  hasStats = false,
}: {
  rows?: number
  cols?: number
  hasFilters?: boolean
  hasStats?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      {hasStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse" style={{ height: 86, padding: '18px 20px' }}>
              <div style={{ height: 10, width: '55%', background: 'var(--border)', borderRadius: 5, marginBottom: 12 }} />
              <div style={{ height: 22, width: '75%', background: 'var(--border)', borderRadius: 5, marginBottom: 8 }} />
              <div style={{ height: 9, width: '40%', background: 'var(--border)', borderRadius: 5 }} />
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {hasFilters && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }} className="animate-pulse">
          <div style={{ height: 36, width: 240, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ height: 36, width: 130, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ height: 36, width: 110, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ flex: 1 }} />
          <div style={{ height: 36, width: 140, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
        </div>
      )}

      {/* Table */}
      <div className="card animate-pulse" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Header */}
        <div style={{ height: 42, background: 'var(--surface)', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 0 }}>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} style={{ flex: i === 0 ? 2 : 1, padding: '0 16px' }}>
              <div style={{ height: 9, width: '60%', background: 'var(--border)', borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'center', borderBottom: ri < rows - 1 ? '1px solid var(--border)' : 'none', minHeight: 54 }}>
            {Array.from({ length: cols }).map((_, ci) => (
              <div key={ci} style={{ flex: ci === 0 ? 2 : 1, padding: '0 16px' }}>
                <div style={{ height: 10, width: `${55 + ((ri + ci) * 13) % 35}%`, background: 'var(--border)', borderRadius: 4 }} />
                {ci === 0 && <div style={{ height: 8, width: '40%', background: 'var(--border)', borderRadius: 4, marginTop: 5 }} />}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }} className="animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ width: 32, height: 32, background: 'var(--border)', borderRadius: 'var(--radius-md)' }} />
        ))}
      </div>
    </div>
  )
}
