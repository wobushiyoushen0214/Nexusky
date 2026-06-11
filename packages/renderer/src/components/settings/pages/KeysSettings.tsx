import { useTranslation } from 'react-i18next'
import './KeysSettings.css'

export function KeysSettings() {
  const { t } = useTranslation()

  return (
    <div className="keys-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.keys.title')}</h2>
          <p>{t('settings.keys.description')}</p>
        </div>

        <div className="keys-empty">
          <span className="empty-icon">⌨️</span>
          <p>{t('settings.keys.comingSoon')}</p>
        </div>
      </section>
    </div>
  )
}
