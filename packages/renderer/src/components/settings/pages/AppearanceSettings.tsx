import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { THEME_IDS, useUIStore } from '../../../stores/ui-store'
import type { Theme } from '../../../stores/ui-store'
import './AppearanceSettings.css'

const ACCENT_PRESETS = ['#7c6ef5', '#4facfe', '#4ec9a0', '#f0a050', '#e8577a', '#ffd60a', '#88c0d0', '#268bd2']

export function AppearanceSettings() {
  const { t } = useTranslation()
  const { theme, accentColor, language, setTheme, setAccentColor, setLanguage } = useUIStore()
  const [customAccent, setCustomAccent] = useState(accentColor || '#7c6ef5')

  const handleAccentChange = (color: string) => {
    setCustomAccent(color)
    setAccentColor(color)
  }

  return (
    <div className="appearance-settings">
      <section className="settings-section">
        <h2>{t('settings.theme.title')}</h2>
        <p className="settings-description">{t('settings.theme.description')}</p>

        <div className="theme-grid">
          {THEME_IDS.map((themeId) => (
            <button
              key={themeId}
              className={`theme-card ${theme === themeId ? 'is-active' : ''}`}
              onClick={() => setTheme(themeId as Theme)}
            >
              <div className={`theme-preview theme-preview--${themeId}`} />
              <div className="theme-card__info">
                <h3>{t(`settings.theme.items.${themeId}.label`)}</h3>
                <p>{t(`settings.theme.items.${themeId}.detail`)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('settings.accent.title')}</h2>
        <p className="settings-description">{t('settings.accent.description')}</p>

        <div className="accent-grid">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              className={`accent-swatch ${accentColor === color ? 'is-active' : ''}`}
              style={{ background: color }}
              onClick={() => handleAccentChange(color)}
              aria-label={color}
            />
          ))}
        </div>

        <div className="custom-accent">
          <label>{t('settings.accent.custom')}</label>
          <div className="custom-accent__input">
            <input
              type="color"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
            />
            <input
              type="text"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              placeholder="#7c6ef5"
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('settings.language.title')}</h2>

        <div className="language-buttons">
          <button
            className={`language-btn ${language === 'zh-CN' ? 'is-active' : ''}`}
            onClick={() => setLanguage('zh-CN')}
          >
            {t('settings.language.zhCN')}
          </button>
          <button
            className={`language-btn ${language === 'en' ? 'is-active' : ''}`}
            onClick={() => setLanguage('en')}
          >
            {t('settings.language.en')}
          </button>
        </div>
      </section>
    </div>
  )
}
