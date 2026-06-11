import { useTranslation } from 'react-i18next'
import './SettingsSidebar.css'

export type SettingsTab = 'appearance' | 'ai' | 'cloud' | 'plugins' | 'keys' | 'proactive' | 'long-context'

interface SettingsSidebarProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

const tabIcons: Record<SettingsTab, React.ReactNode> = {
  appearance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  ai: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  cloud: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>,
  plugins: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>,
  keys: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  proactive: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  'long-context': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  const { t } = useTranslation()

  const tabs: SettingsTab[] = ['appearance', 'ai', 'cloud', 'plugins', 'keys', 'proactive', 'long-context']

  return (
    <aside className="settings-sidebar">
      <nav className="settings-sidebar__nav">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`settings-sidebar__item ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            <span className="settings-sidebar__icon">{tabIcons[tab]}</span>
            <span className="settings-sidebar__label">{t(`settings.tabs.${tab}`)}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
