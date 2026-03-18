import { SettingsTabs } from './SettingsTabs'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginBottom: 20 }}>Paramètres</h1>
      <SettingsTabs />
      {children}
    </div>
  )
}
