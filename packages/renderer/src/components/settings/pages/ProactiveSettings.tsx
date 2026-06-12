import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProactiveConfig } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { SettingsLoadingState } from '../SettingsLoadingState'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Switch } from '../../ui/switch'
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group'
import './ProactiveSettings.css'

const AVAILABLE_CATEGORIES = [
  { id: 'note-suggestions', label: '笔记建议', labelEn: 'Note Suggestions' },
  { id: 'link-recommendations', label: '链接推荐', labelEn: 'Link Recommendations' },
  { id: 'tag-suggestions', label: '标签建议', labelEn: 'Tag Suggestions' },
  { id: 'content-insights', label: '内容洞察', labelEn: 'Content Insights' },
  { id: 'knowledge-gaps', label: '知识空缺', labelEn: 'Knowledge Gaps' },
]

export function ProactiveSettings() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<ProactiveConfig>({
    enabled: false,
    frequency: 'medium',
    categories: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const result = await window.api.invoke('settings:get-proactive-config', undefined)
      setConfig(result)
    } catch (error) {
      console.error('Failed to load proactive config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      await window.api.invoke('settings:save-proactive-config', config)
      toast(t('settings.proactive.saved'), 'success')
    } catch (error) {
      toast(t('settings.proactive.saveFailed'), 'error')
    }
  }

  const toggleCategory = (categoryId: string) => {
    setConfig({
      ...config,
      categories: config.categories.includes(categoryId)
        ? config.categories.filter((c) => c !== categoryId)
        : [...config.categories, categoryId],
    })
  }

  if (loading) {
    return <SettingsLoadingState className="proactive-settings" label={t('settings.loading')} />
  }

  return (
    <div className="proactive-settings">
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.proactive.title')}</h2>
          <p>{t('settings.proactive.description')}</p>
        </div>

        <div className="settings-form">
          <div className="form-item">
            <div className="form-toggle">
              <Switch
                id="proactive-enabled"
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
              />
              <label htmlFor="proactive-enabled">{t('settings.proactive.enabled')}</label>
            </div>
            <p className="form-hint">{t('settings.proactive.enabledHint')}</p>
          </div>

          {config.enabled && (
            <>
              <div className="form-item">
                <label className="form-label">{t('settings.proactive.frequency')}</label>
                <ToggleGroup
                  type="single"
                  value={config.frequency}
                  onValueChange={(value) => {
                    if (value) setConfig({ ...config, frequency: value as ProactiveConfig['frequency'] })
                  }}
                  className="frequency-options"
                >
                  <ToggleGroupItem value="low" className="frequency-btn">
                    {t('settings.proactive.frequencyLow')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="medium" className="frequency-btn">
                    {t('settings.proactive.frequencyMedium')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="high" className="frequency-btn">
                    {t('settings.proactive.frequencyHigh')}
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="form-hint">{t('settings.proactive.frequencyHint')}</p>
              </div>

              <div className="form-item">
                <label className="form-label">{t('settings.proactive.categories')}</label>
                <div className="category-list">
                  {AVAILABLE_CATEGORIES.map((category) => {
                    const checked = config.categories.includes(category.id)
                    const label = i18n.language.startsWith('zh') ? category.label : category.labelEn
                    const id = `proactive-category-${category.id}`
                    return (
                      <div key={category.id} className="category-item">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={() => toggleCategory(category.id)}
                          aria-label={label}
                        />
                        <label htmlFor={id}>{label}</label>
                      </div>
                    )
                  })}
                </div>
                <p className="form-hint">{t('settings.proactive.categoriesHint')}</p>
              </div>
            </>
          )}

          <div className="form-actions">
            <Button type="button" size="sm" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
