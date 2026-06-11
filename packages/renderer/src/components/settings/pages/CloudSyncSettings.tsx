import { useTranslation } from 'react-i18next'
import './CloudSyncSettings.css'

export function CloudSyncSettings() {
  const { t } = useTranslation()

  return (
    <div className="cloud-sync-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.cloudSync.title')}</h2>
          <p>{t('settings.cloudSync.description')}</p>
        </div>

        <div className="sync-status">
          <div className="status-card">
            <div className="status-icon">☁️</div>
            <div className="status-info">
              <h3>{t('settings.cloudSync.notConfigured')}</h3>
              <p>{t('settings.cloudSync.notConfiguredDesc')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
