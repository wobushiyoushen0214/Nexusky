import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AIProviderConfig } from '@shared/types/ipc'
import { toast } from '../../stores/toast-store'
import './AIProviderSettings.css'

const PROVIDER_PRESETS = [
  { label: 'OpenAI', type: 'openai' as const, baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'Claude', type: 'claude' as const, baseUrl: '', model: 'claude-sonnet-4-6' },
  { label: 'OpenAI 兼容', type: 'custom' as const, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4' },
  { label: 'Claude 兼容', type: 'openai-responses' as const, baseUrl: '', model: 'claude-sonnet-4-6' },
  { label: 'DeepSeek', type: 'custom' as const, baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'Ollama', type: 'ollama' as const, baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
]

export function AIProviderSettings() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [editing, setEditing] = useState<AIProviderConfig | null>(null)
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      const result = await window.api.invoke('ai:get-providers', undefined)

      // 修复多个启用的情况：只保留第一个启用的
      const enabledCount = result.filter((p: AIProviderConfig) => p.enabled).length
      if (enabledCount > 1) {
        const firstEnabled = result.find((p: AIProviderConfig) => p.enabled)
        for (const p of result) {
          if (p.enabled && p.id !== firstEnabled?.id) {
            await window.api.invoke('ai:save-provider', {
              config: { ...p, enabled: false },
            })
          }
        }
        // 重新加载修正后的数据
        const fixed = await window.api.invoke('ai:get-providers', undefined)
        setProviders(fixed)
      } else {
        setProviders(result)
      }
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  const handleFetchModels = async () => {
    if (!editing) return

    setFetchingModels(true)
    setAvailableModels([])
    try {
      const result = await window.api.invoke('ai:fetch-models', {
        type: editing.type,
        baseUrl: editing.baseUrl,
        apiKey: editing.apiKey,
      })

      if (result.ok) {
        setAvailableModels(result.models)
        toast(t('settings.ai.modelsFetched').replace('{{count}}', String(result.models.length)), 'success')
      } else {
        toast(result.error || t('settings.ai.fetchModelsFailed'), 'error')
      }
    } catch (error) {
      toast(t('settings.ai.fetchModelsFailed'), 'error')
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSave = async () => {
    if (!editing) return

    try {
      await window.api.invoke('ai:save-provider', { config: editing })
      await loadProviders()
      setEditing(null)
      toast(t('settings.ai.saved'), 'success')
    } catch (error) {
      toast(t('settings.ai.saveFailed'), 'error')
    }
  }

  const handleTest = async () => {
    if (!editing) return

    setTesting(true)
    try {
      const result = await window.api.invoke('ai:test-provider', { config: editing })
      if (result.ok) {
        toast(t('settings.ai.testSuccess'), 'success')
      } else {
        toast(result.text || t('settings.ai.testFailed'), 'error')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('settings.ai.testFailed')
      toast(errorMsg, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleToggleEnabled = async (provider: AIProviderConfig) => {
    try {
      // 如果要启用这个，先禁用所有其他的
      if (!provider.enabled) {
        for (const p of providers) {
          if (p.enabled && p.id !== provider.id) {
            await window.api.invoke('ai:save-provider', {
              config: { ...p, enabled: false },
            })
          }
        }
      }

      // 切换当前的
      await window.api.invoke('ai:save-provider', {
        config: { ...provider, enabled: !provider.enabled },
      })
      await loadProviders()
      toast(provider.enabled ? t('settings.ai.disabled') : t('settings.ai.enabled'), 'success')
    } catch (error) {
      toast(t('settings.ai.saveFailed'), 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.api.invoke('ai:delete-provider', { id })
      await loadProviders()
      toast(t('settings.ai.deleted'), 'success')
    } catch (error) {
      toast(t('settings.ai.deleteFailed'), 'error')
    }
  }

  return (
    <div className="ai-provider-settings">
      <header className="settings-header">
        <h2>{t('settings.ai.title')}</h2>
        <p className="settings-subtitle">{t('settings.ai.subtitle')}</p>
      </header>

      <div className="provider-list">
        {providers.map((provider) => (
          <div key={provider.id} className={`provider-card ${provider.enabled ? 'is-enabled' : 'is-disabled'}`}>
            <div className="provider-card__info">
              <div className="provider-header">
                <button
                  className={`provider-radio ${provider.enabled ? 'is-active' : ''}`}
                  onClick={() => handleToggleEnabled(provider)}
                  title={provider.enabled ? t('settings.ai.disable') : t('settings.ai.enable')}
                >
                  <span className="radio-dot"></span>
                </button>
                <div>
                  <h3>{provider.name}</h3>
                  <p>{provider.model}</p>
                </div>
              </div>
            </div>
            <div className="provider-card__actions">
              <button onClick={() => setEditing(provider)}>{t('common.edit')}</button>
              <button onClick={() => handleDelete(provider.id)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}

        <button className="btn-add-provider" onClick={() => setEditing({
          id: '',
          name: 'New Provider',
          type: 'custom',
          apiKey: '',
          baseUrl: '',
          model: '',
          enabled: true,
          hasApiKey: false,
        })}>
          + {t('settings.ai.addProvider')}
        </button>
      </div>

      {editing && (
        <div className="provider-editor-modal" onClick={() => setEditing(null)}>
          <div className="provider-editor" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{editing.id ? t('settings.ai.editProvider') : t('settings.ai.addProvider')}</h3>
              <button onClick={() => setEditing(null)}>×</button>
            </header>

            <div className="provider-editor__content">
              <div className="form-group">
                <label>{t('settings.ai.providerName')}</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="My Provider"
                />
              </div>

              <div className="form-group">
                <label>{t('settings.ai.apiKey')}</label>
                <input
                  type="password"
                  value={editing.apiKey}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>{t('settings.ai.baseUrl')}</label>
                <input
                  type="text"
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div className="form-group">
                <label>{t('settings.ai.model')}</label>
                <div className="model-input-group">
                  {availableModels.length > 0 ? (
                    <select
                      value={editing.model}
                      onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    >
                      <option value="">{t('settings.ai.selectModel')}</option>
                      {availableModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editing.model}
                      onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                      placeholder="gpt-4"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !editing.apiKey}
                    className="btn-fetch-models"
                  >
                    {fetchingModels ? t('settings.ai.fetching') : t('settings.ai.fetchModels')}
                  </button>
                </div>
              </div>

              <div className="provider-editor__presets">
                <p>{t('settings.ai.quickSetup')}</p>
                <div className="preset-buttons">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setEditing({
                        ...editing,
                        name: preset.label,
                        type: preset.type,
                        baseUrl: preset.baseUrl,
                        model: preset.model,
                      })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <footer className="provider-editor__footer">
              <button onClick={handleTest} disabled={testing}>
                {testing ? t('settings.ai.testing') : t('settings.ai.test')}
              </button>
              <button className="btn-primary" onClick={handleSave}>
                {t('common.save')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
