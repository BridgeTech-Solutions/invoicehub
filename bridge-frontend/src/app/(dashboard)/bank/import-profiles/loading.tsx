export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860, margin: '0 auto', width: '100%' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card skeleton" style={{ height: 80 }} />
      ))}
    </div>
  )
}
