import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TabsList, TabsTrigger } from '../ui/tabs'
import './SettingsSidebar.css'

export type SettingsTab = 'appearance' | 'ai' | 'keys'

const tabIcons: Record<SettingsTab, ReactNode> = {
  appearance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  ai: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  keys: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
}

export function SettingsSidebar() {
  const { t } = useTranslation()

  const tabs: SettingsTab[] = ['appearance', 'ai', 'keys']

  return (
    <aside className="settings-sidebar">
      <TabsList className="settings-sidebar__nav" aria-label={t('settings.title')}>
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="settings-sidebar__item"
          >
            <span className="settings-sidebar__icon">{tabIcons[tab]}</span>
            <span className="settings-sidebar__label">{t(`settings.tabs.${tab}`)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </aside>
  )
}
