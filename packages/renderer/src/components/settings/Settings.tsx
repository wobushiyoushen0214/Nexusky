import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSidebar, type SettingsTab } from './SettingsSidebar'
import { AppearanceSettings } from './pages/AppearanceSettings'
import { AIProviderSettings } from './AIProviderSettings'
import { CloudSyncSettings } from './pages/CloudSyncSettings'
import { PluginsSettings } from './pages/PluginsSettings'
import { KeysSettings } from './pages/KeysSettings'
import { ProactiveSettings } from './pages/ProactiveSettings'
import { LongContextSettings } from './pages/LongContextSettings'
import './Settings.css'

interface SettingsProps {
  open: boolean
  onClose: () => void
}

export function Settings({ open, onClose }: SettingsProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="settings-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <header className="settings-dialog__header">
          <h1 id="settings-title">{t('settings.title')}</h1>
          <button
            className="settings-dialog__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </header>

        <div className="settings-dialog__body">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <main className="settings-dialog__content">
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'ai' && <AIProviderSettings />}
            {activeTab === 'cloud' && <CloudSyncSettings />}
            {activeTab === 'plugins' && <PluginsSettings />}
            {activeTab === 'keys' && <KeysSettings />}
            {activeTab === 'proactive' && <ProactiveSettings />}
            {activeTab === 'long-context' && <LongContextSettings />}
          </main>
        </div>
      </div>
    </div>
  )
}
