import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsSyncConfig, SettingsSyncStatus } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { Button } from '../../ui/button'
import { Spinner } from '../../ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import './CloudSyncSettings.css'

export function CloudSyncSettings() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SettingsSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [syncConfig, setSyncConfig] = useState<SettingsSyncConfig>({
    provider: 'webdav',
    config: {},
  })

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const result = await window.api.invoke('settings:get-sync-status', undefined)
      setStatus(result)
    } catch (error) {
      console.error('Failed to load sync status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfigure = async () => {
    try {
      await window.api.invoke('settings:configure-sync', syncConfig)
      await loadStatus()
      setConfiguring(false)
      toast(t('settings.cloudSync.configured'), 'success')
    } catch (error) {
      toast(t('settings.cloudSync.configureFailed'), 'error')
    }
  }

  if (loading) {
    return (
      <div className="cloud-sync-settings settings-loading">
        <Spinner aria-hidden="true" />
        <p>{t('settings.loading')}</p>
      </div>
    )
  }

  return (
    <div className="cloud-sync-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.cloudSync.title')}</h2>
          <p>{t('settings.cloudSync.description')}</p>
        </div>

        {!status?.configured ? (
          <div className="not-configured">
            <div className="info-card">
              <h3>{t('settings.cloudSync.notConfigured')}</h3>
              <p>{t('settings.cloudSync.notConfiguredDesc')}</p>
            </div>

            {configuring && (
              <div className="config-form">
                <div className="form-item">
                  <label className="form-label">{t('settings.cloudSync.provider')}</label>
                  <Select
                    value={syncConfig.provider}
                    onValueChange={(value) => setSyncConfig({
                      ...syncConfig,
                      provider: value as SettingsSyncConfig['provider'],
                    })}
                  >
                    <SelectTrigger className="cloud-sync-provider-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="webdav">WebDAV</SelectItem>
                      <SelectItem value="s3">Amazon S3</SelectItem>
                      <SelectItem value="supabase">Supabase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="form-actions">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfiguring(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="button" size="sm" onClick={handleConfigure}>
                    {t('settings.cloudSync.configure')}
                  </Button>
                </div>
              </div>
            )}

            {!configuring && (
              <Button type="button" size="sm" className="btn-configure" onClick={() => setConfiguring(true)}>
                {t('settings.cloudSync.startConfiguration')}
              </Button>
            )}
          </div>
        ) : (
          <div className="sync-status">
            <div className="status-card">
              <div className="status-row">
                <span>{t('settings.cloudSync.provider')}:</span>
                <strong>{status.provider}</strong>
              </div>
              <div className="status-row">
                <span>{t('settings.cloudSync.status')}:</span>
                <strong className={`status-${status.status}`}>
                  {t(`settings.cloudSync.status_${status.status}`)}
                </strong>
              </div>
              {status.lastSync && (
                <div className="status-row">
                  <span>{t('settings.cloudSync.lastSync')}:</span>
                  <strong>{new Date(status.lastSync).toLocaleString()}</strong>
                </div>
              )}
              {status.error && (
                <div className="status-error">
                  <p>{status.error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
