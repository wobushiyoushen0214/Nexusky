import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../stores/toast-store'
import './PluginsSettings.css'

interface Plugin {
  id: string
  name: string
  version: string
  enabled: boolean
  description?: string
  author?: string
}

export function PluginsSettings() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = async () => {
    try {
      const result = await window.api.invoke('settings:get-installed-plugins', undefined)
      setPlugins(result)
    } catch (error) {
      console.error('Failed to load plugins:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (plugin: Plugin) => {
    try {
      await window.api.invoke('settings:toggle-plugin', {
        id: plugin.id,
        enabled: !plugin.enabled,
      })
      await loadPlugins()
      toast(
        plugin.enabled ? t('settings.plugins.disabled') : t('settings.plugins.enabled'),
        'success'
      )
    } catch (error) {
      toast(t('settings.plugins.toggleFailed'), 'error')
    }
  }

  if (loading) {
    return <div className="plugins-settings"><p>Loading...</p></div>
  }

  return (
    <div className="plugins-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.plugins.title')}</h2>
          <p>{t('settings.plugins.description')}</p>
        </div>

        {plugins.length === 0 ? (
          <div className="empty-state">
            <p>{t('settings.plugins.noPlugins')}</p>
            <p className="empty-hint">{t('settings.plugins.noPluginsHint')}</p>
          </div>
        ) : (
          <div className="plugins-list">
            {plugins.map((plugin) => (
              <div key={plugin.id} className={`plugin-card ${plugin.enabled ? 'enabled' : ''}`}>
                <div className="plugin-info">
                  <div className="plugin-header">
                    <h3>{plugin.name}</h3>
                    <span className="plugin-version">v{plugin.version}</span>
                  </div>
                  {plugin.description && <p className="plugin-description">{plugin.description}</p>}
                  {plugin.author && <p className="plugin-author">by {plugin.author}</p>}
                </div>
                <div className="plugin-actions">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={() => handleToggle(plugin)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
