import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../stores/toast-store'
import './CloudSyncSettings.css'

interface SyncStatus {
  configured: boolean
  provider?: 'supabase' | 'webdav' | 's3'
  lastSync?: number
  status?: 'idle' | 'syncing' | 'error'
  error?: string
}

interface SyncConfig {
  provider: 'supabase' | 'webdav' | 's3'
  config: Record<string, string>
}

export function CloudSyncSettings() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
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
    return <div className="cloud-sync-settings"><p>Loading...</p></div>
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
                  <select
                    value={syncConfig.provider}
                    onChange={(e) =>
                      setSyncConfig({ ...syncConfig, provider: e.target.value as any })
                    }
                  >
                    <option value="webdav">WebDAV</option>
                    <option value="s3">Amazon S3</option>
                    <option value="supabase">Supabase</option>
                  </select>
                </div>

                <div className="form-actions">
                  <button className="btn-secondary" onClick={() => setConfiguring(false)}>
                    {t('common.cancel')}
                  </button>
                  <button className="btn-primary" onClick={handleConfigure}>
                    {t('settings.cloudSync.configure')}
                  </button>
                </div>
              </div>
            )}

            {!configuring && (
              <button className="btn-configure" onClick={() => setConfiguring(true)}>
                {t('settings.cloudSync.startConfiguration')}
              </button>
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
