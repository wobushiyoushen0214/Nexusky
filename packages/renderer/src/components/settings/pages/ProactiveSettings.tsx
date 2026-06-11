import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../stores/toast-store'
import './ProactiveSettings.css'

interface ProactiveConfig {
  enabled: boolean
  frequency: 'low' | 'medium' | 'high'
  categories: string[]
}

const AVAILABLE_CATEGORIES = [
  { id: 'note-suggestions', label: '笔记建议', labelEn: 'Note Suggestions' },
  { id: 'link-recommendations', label: '链接推荐', labelEn: 'Link Recommendations' },
  { id: 'tag-suggestions', label: '标签建议', labelEn: 'Tag Suggestions' },
  { id: 'content-insights', label: '内容洞察', labelEn: 'Content Insights' },
  { id: 'knowledge-gaps', label: '知识空缺', labelEn: 'Knowledge Gaps' },
]

export function ProactiveSettings() {
  const { t } = useTranslation()
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
    return <div className="proactive-settings"><p>Loading...</p></div>
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
            <label className="form-toggle">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span>{t('settings.proactive.enabled')}</span>
            </label>
            <p className="form-hint">{t('settings.proactive.enabledHint')}</p>
          </div>

          {config.enabled && (
            <>
              <div className="form-item">
                <label className="form-label">{t('settings.proactive.frequency')}</label>
                <div className="frequency-options">
                  <button
                    className={`frequency-btn ${config.frequency === 'low' ? 'active' : ''}`}
                    onClick={() => setConfig({ ...config, frequency: 'low' })}
                  >
                    {t('settings.proactive.frequencyLow')}
                  </button>
                  <button
                    className={`frequency-btn ${config.frequency === 'medium' ? 'active' : ''}`}
                    onClick={() => setConfig({ ...config, frequency: 'medium' })}
                  >
                    {t('settings.proactive.frequencyMedium')}
                  </button>
                  <button
                    className={`frequency-btn ${config.frequency === 'high' ? 'active' : ''}`}
                    onClick={() => setConfig({ ...config, frequency: 'high' })}
                  >
                    {t('settings.proactive.frequencyHigh')}
                  </button>
                </div>
                <p className="form-hint">{t('settings.proactive.frequencyHint')}</p>
              </div>

              <div className="form-item">
                <label className="form-label">{t('settings.proactive.categories')}</label>
                <div className="category-list">
                  {AVAILABLE_CATEGORIES.map((category) => (
                    <label key={category.id} className="category-item">
                      <input
                        type="checkbox"
                        checked={config.categories.includes(category.id)}
                        onChange={() => toggleCategory(category.id)}
                      />
                      <span>{t('common.language') === 'zh-CN' ? category.label : category.labelEn}</span>
                    </label>
                  ))}
                </div>
                <p className="form-hint">{t('settings.proactive.categoriesHint')}</p>
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
