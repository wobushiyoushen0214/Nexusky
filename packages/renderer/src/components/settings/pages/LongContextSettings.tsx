import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../stores/toast-store'
import './LongContextSettings.css'

interface MemoryConfig {
  enabled: boolean
  autoGenerate: boolean
  retentionDays: number
  maxTokens: number
}

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
    return <div className="long-context-settings"><p>Loading...</p></div>
  }

  return (
    <div className="long-context-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.longContext.title')}</h2>
          <p>{t('settings.longContext.description')}</p>
        </div>

        <div className="settings-form">
          <div className="form-item">
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span>{t('settings.longContext.enabled')}</span>
            </label>
            <p className="form-hint">{t('settings.longContext.enabledHint')}</p>
          </div>

          <div className="form-item">
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={config.autoGenerate}
                onChange={(e) => setConfig({ ...config, autoGenerate: e.target.checked })}
              />
              <span>{t('settings.longContext.autoGenerate')}</span>
            </label>
            <p className="form-hint">{t('settings.longContext.autoGenerateHint')}</p>
          </div>

          <div className="form-item">
            <label className="form-label">{t('settings.longContext.retentionDays')}</label>
            <input
              type="number"
              value={config.retentionDays}
              onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) })}
              min={7}
              max={365}
            />
            <p className="form-hint">{t('settings.longContext.retentionDaysHint')}</p>
          </div>

          <div className="form-item">
            <label className="form-label">{t('settings.longContext.maxTokens')}</label>
            <input
              type="number"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
              min={10000}
              max={1000000}
              step={10000}
            />
            <p className="form-hint">{t('settings.longContext.maxTokensHint')}</p>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
