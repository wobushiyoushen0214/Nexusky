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
        <div className="section-header">
          <h2>{t('settings.theme.title')}</h2>
          <p>{t('settings.theme.description')}</p>
        </div>

        <div className="theme-grid">
          {THEME_IDS.map((themeId) => (
            <button
              key={themeId}
              className={`theme-item ${theme === themeId ? 'is-active' : ''}`}
              onClick={() => setTheme(themeId as Theme)}
            >
              <div className={`theme-preview theme-preview--${themeId}`}>
                <div className="theme-preview__dots">
                  <span /><span /><span />
                </div>
              </div>
              <span className="theme-label">{t(`settings.theme.items.${themeId}.label`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.accent.title')}</h2>
          <p>{t('settings.accent.description')}</p>
        </div>

        <div className="accent-list">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              className={`accent-item ${accentColor === color ? 'is-active' : ''}`}
              onClick={() => handleAccentChange(color)}
            >
              <span className="accent-color" style={{ background: color }} />
              <span className="accent-check">✓</span>
            </button>
          ))}

          <div className="accent-custom">
            <input
              type="color"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="accent-picker"
            />
            <input
              type="text"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              placeholder="#7c6ef5"
              className="accent-text"
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.language.title')}</h2>
        </div>

        <div className="language-list">
          <button
            className={`language-item ${language === 'zh-CN' ? 'is-active' : ''}`}
            onClick={() => setLanguage('zh-CN')}
          >
            <span className="language-label">{t('settings.language.zhCN')}</span>
            <span className="language-check">✓</span>
          </button>
          <button
            className={`language-item ${language === 'en' ? 'is-active' : ''}`}
            onClick={() => setLanguage('en')}
          >
            <span className="language-label">{t('settings.language.en')}</span>
            <span className="language-check">✓</span>
          </button>
        </div>
      </section>
    </div>
  )
}
