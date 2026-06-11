import { useTranslation } from 'react-i18next'
import './LongContextSettings.css'

export function LongContextSettings() {
  const { t } = useTranslation()

  return (
    <div className="long-context-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.longContext.title')}</h2>
          <p>{t('settings.longContext.description')}</p>
        </div>

        <div className="long-context-empty">
          <span className="empty-icon">🕐</span>
          <p>{t('settings.longContext.comingSoon')}</p>
        </div>
      </section>
    </div>
  )
}
