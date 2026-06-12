import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsPlugin } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { SettingsLoadingState } from '../SettingsLoadingState'
import { Badge } from '../../ui/badge'
import { Card } from '../../ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../../ui/empty'
import { Switch } from '../../ui/switch'
import { SettingsSection } from '../SettingsSection'
import './PluginsSettings.css'

export function PluginsSettings() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<SettingsPlugin[]>([])
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

  const handleToggle = async (plugin: SettingsPlugin) => {
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
    return <SettingsLoadingState className="plugins-settings" label={t('settings.loading')} />
  }

  return (
    <div className="plugins-settings">
      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.plugins.title')}</h2>
          <p>{t('settings.plugins.description')}</p>
        </div>

        {plugins.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('settings.plugins.noPlugins')}</EmptyTitle>
              <EmptyDescription>{t('settings.plugins.noPluginsHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="plugins-list">
            {plugins.map((plugin) => (
              <Card key={plugin.id} className={`plugin-card ${plugin.enabled ? 'enabled' : ''}`}>
                <div className="plugin-info">
                  <div className="plugin-header">
                    <h3>{plugin.name}</h3>
                    <Badge variant="outline" className="plugin-version">v{plugin.version}</Badge>
                  </div>
                  {plugin.description && <p className="plugin-description">{plugin.description}</p>}
                  {plugin.author && <p className="plugin-author">by {plugin.author}</p>}
                </div>
                <div className="plugin-actions">
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={() => handleToggle(plugin)}
                    aria-label={plugin.name}
                    className="plugin-switch"
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
