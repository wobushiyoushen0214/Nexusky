import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { MemoryConfig } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { SettingsLoadingState } from '../SettingsLoadingState'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Switch } from '../../ui/switch'
import { SettingsSection } from '../SettingsSection'
import './LongContextSettings.css'

export function LongContextSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<MemoryConfig>({
    enabled: true,
    autoGenerate: false,
    retentionDays: 90,
    maxTokens: 100000,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const result = await window.api.invoke('settings:get-memory-config', undefined)
      setConfig(result)
    } catch (error) {
      console.error('Failed to load memory config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      await window.api.invoke('settings:save-memory-config', config)
      toast(t('settings.longContext.saved'), 'success')
    } catch (error) {
      toast(t('settings.longContext.saveFailed'), 'error')
    }
  }

  if (loading) {
    return <SettingsLoadingState className="long-context-settings" label={t('settings.loading')} />
  }

  return (
    <div className="long-context-settings">
      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.longContext.title')}</h2>
          <p>{t('settings.longContext.description')}</p>
        </div>

        <div className="settings-form">
          <div className="form-item">
            <div className="form-toggle">
              <Switch
                id="long-context-enabled"
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
              />
              <label htmlFor="long-context-enabled">{t('settings.longContext.enabled')}</label>
            </div>
            <p className="form-hint">{t('settings.longContext.enabledHint')}</p>
          </div>

          <div className="form-item">
            <div className="form-toggle">
              <Switch
                id="long-context-auto-generate"
                checked={config.autoGenerate}
                onCheckedChange={(checked) => setConfig({ ...config, autoGenerate: checked })}
              />
              <label htmlFor="long-context-auto-generate">{t('settings.longContext.autoGenerate')}</label>
            </div>
            <p className="form-hint">{t('settings.longContext.autoGenerateHint')}</p>
          </div>

          <div className="form-item">
            <label className="form-label">{t('settings.longContext.retentionDays')}</label>
            <div className="long-context-settings__number-field">
              <Input
                type="number"
                className="long-context-settings__number-input"
                value={config.retentionDays}
                onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) })}
                min={7}
                max={365}
              />
              <span className="long-context-settings__number-unit">{t('settings.longContext.daysUnit')}</span>
            </div>
            <p className="form-hint">{t('settings.longContext.retentionDaysHint')}</p>
          </div>

          <div className="form-item">
            <label className="form-label">{t('settings.longContext.maxTokens')}</label>
            <div className="long-context-settings__number-field">
              <Input
                type="number"
                className="long-context-settings__number-input"
                value={config.maxTokens}
                onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                min={10000}
                max={1000000}
                step={10000}
              />
              <span className="long-context-settings__number-unit">{t('settings.longContext.tokensUnit')}</span>
            </div>
            <p className="form-hint">{t('settings.longContext.maxTokensHint')}</p>
          </div>

          <div className="form-actions">
            <Button type="button" size="sm" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
