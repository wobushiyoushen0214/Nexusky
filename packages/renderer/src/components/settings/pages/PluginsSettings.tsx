import { useTranslation } from 'react-i18next'
import './PluginsSettings.css'

export function PluginsSettings() {
  const { t } = useTranslation()

  return (
    <div className="plugins-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.plugins.title')}</h2>
          <p>{t('settings.plugins.description')}</p>
        </div>

        <div className="plugins-empty">
          <span className="empty-icon">🧩</span>
          <p>{t('settings.plugins.noPlugins')}</p>
        </div>
      </section>
    </div>
  )
}
