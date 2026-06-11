import { useTranslation } from 'react-i18next'
import './ProactiveSettings.css'

export function ProactiveSettings() {
  const { t } = useTranslation()

  return (
    <div className="proactive-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.proactive.title')}</h2>
          <p>{t('settings.proactive.description')}</p>
        </div>

        <div className="proactive-empty">
          <span className="empty-icon">⚡</span>
          <p>{t('settings.proactive.comingSoon')}</p>
        </div>
      </section>
    </div>
  )
}
