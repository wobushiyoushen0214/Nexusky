import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { THEME_IDS, useUIStore } from '../../../stores/ui-store'
import type { Theme } from '../../../stores/ui-store'
import { Input } from '../../ui/input'
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group'
import { SettingsSection } from '../SettingsSection'
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
      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.theme.title')}</h2>
          <p>{t('settings.theme.description')}</p>
        </div>

        <RadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
          className="theme-grid"
        >
          {THEME_IDS.map((themeId) => (
            <RadioGroupItem
              key={themeId}
              value={themeId}
              className="theme-item"
            >
              <div className={`theme-preview theme-preview--${themeId}`}>
                <div className="theme-preview__dots">
                  <span /><span /><span />
                </div>
              </div>
              <span className="theme-label">{t(`settings.theme.items.${themeId}.label`)}</span>
              <span className="theme-detail">{t(`settings.theme.items.${themeId}.detail`)}</span>
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </SettingsSection>

      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.accent.title')}</h2>
          <p>{t('settings.accent.description')}</p>
        </div>

        <RadioGroup
          value={accentColor}
          onValueChange={handleAccentChange}
          className="accent-list"
          aria-label={t('settings.accent.title')}
        >
          {ACCENT_PRESETS.map((color) => (
            <RadioGroupItem
              key={color}
              value={color}
              className="accent-item"
              aria-label={color}
            >
              <span className="accent-color" style={{ background: color }} />
              <span className="accent-check">✓</span>
            </RadioGroupItem>
          ))}

          <div className="accent-custom">
            <input
              type="color"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              className="accent-picker"
            />
            <Input
              type="text"
              value={customAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              placeholder="#7c6ef5"
              className="accent-text"
            />
          </div>
        </RadioGroup>
      </SettingsSection>

      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.language.title')}</h2>
        </div>

        <RadioGroup
          value={language}
          onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en')}
          className="language-list"
        >
          <RadioGroupItem value="zh-CN" className="language-item">
            <span className="language-label">{t('settings.language.zhCN')}</span>
            <span className="language-check">✓</span>
          </RadioGroupItem>
          <RadioGroupItem value="en" className="language-item">
            <span className="language-label">{t('settings.language.en')}</span>
            <span className="language-check">✓</span>
          </RadioGroupItem>
        </RadioGroup>
      </SettingsSection>
    </div>
  )
}
