import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * AppShell — layout principal de l'application
 * Desktop : Sidebar fixe + Topbar + contenu scrollable
 * Mobile  : Sidebar en overlay (drawer) + Topbar avec hamburger
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, height: '100vh' }}>
        <Topbar />
        <main
          className="page-enter"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 'clamp(12px, 2.5vw, 24px)',
            background: 'var(--bg)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
