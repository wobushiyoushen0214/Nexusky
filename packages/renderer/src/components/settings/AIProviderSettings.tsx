import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AIProviderConfig } from '@shared/types/ipc'
import { toast } from '../../stores/toast-store'
import './AIProviderSettings.css'

type ProviderType = AIProviderConfig['type']

const DEFAULT_BY_TYPE: Record<ProviderType, Pick<AIProviderConfig, 'baseUrl' | 'model'>> = {
  openai: { baseUrl: '', model: 'gpt-4.1-mini' },
  'openai-responses': { baseUrl: '', model: 'gpt-4.1-mini' },
  claude: { baseUrl: '', model: 'claude-sonnet-4-6' },
  custom: { baseUrl: '', model: 'gpt-4.1-mini' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  codex: { baseUrl: 'codex', model: 'gpt-5.4' }
}

const PROVIDER_TYPES: { label: string; value: ProviderType }[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI Responses', value: 'openai-responses' },
  { label: 'Claude', value: 'claude' },
  { label: 'OpenAI 兼容', value: 'custom' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Codex CLI', value: 'codex' }
]

const PROVIDER_PRESETS: { label: string; type: ProviderType; baseUrl: string; model: string }[] = [
  { label: 'OpenAI', type: 'openai', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'OpenAI Responses', type: 'openai-responses', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'Claude', type: 'claude', baseUrl: '', model: 'claude-sonnet-4-6' },
  { label: 'OpenAI 兼容', type: 'custom', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'DeepSeek', type: 'custom', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { label: 'Codex CLI', type: 'codex', baseUrl: 'codex', model: 'gpt-5.4' },
]

function providerRequiresApiKey(type: ProviderType): boolean {
  return type !== 'ollama' && type !== 'codex'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function AIProviderSettings() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AIProviderConfig | null>(null)
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      const [result, activeId] = await Promise.all([
        window.api.invoke('ai:get-providers', undefined),
        window.api.invoke('ai:get-active-provider', undefined),
      ])

      setProviders(result)
      setActiveProviderId(activeId)
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
        providerId: editing.id || undefined,
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
      const normalized: AIProviderConfig = {
        ...editing,
        name: editing.name.trim(),
        baseUrl: editing.type === 'codex' && !editing.baseUrl.trim() ? 'codex' : editing.baseUrl.trim(),
        apiKey: editing.apiKey.trim(),
        model: editing.model.trim(),
        enabled: editing.enabled !== false,
      }

      if (!normalized.name) {
        toast(t('settings.ai.nameRequired'), 'error')
        return
      }
      if (!normalized.model) {
        toast(t('settings.ai.modelRequired'), 'error')
        return
      }
      if (providerRequiresApiKey(normalized.type) && !normalized.apiKey && !editing.hasApiKey) {
        toast(t('settings.ai.apiKeyRequired'), 'error')
        return
      }
      if (normalized.type === 'custom' && !normalized.baseUrl) {
        toast(t('settings.ai.baseUrlRequired'), 'error')
        return
      }

      await window.api.invoke('ai:save-provider', { config: normalized })
      await loadProviders()
      setEditing(null)
      setAvailableModels([])
      toast(t('settings.ai.saved'), 'success')
    } catch (error) {
      toast(`${t('settings.ai.saveFailed')}: ${getErrorMessage(error, t('settings.ai.saveFailed'))}`, 'error')
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

  const handleSetActive = async (provider: AIProviderConfig) => {
    if (provider.id === activeProviderId) return
    try {
      setActiveProviderId(provider.id)
      setProviders((current) => current.map((item) => item.id === provider.id ? { ...item, enabled: true } : item))
      await window.api.invoke('ai:set-active', { providerId: provider.id })
      await loadProviders()
      toast(t('settings.ai.activeSet'), 'success')
    } catch (error) {
      await loadProviders()
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
        {providers.map((provider) => {
          const isActive = provider.id === activeProviderId
          return (
          <div key={provider.id} className={`provider-card ${isActive ? 'is-enabled' : provider.enabled ? '' : 'is-disabled'}`}>
            <div className="provider-card__info">
              <div className="provider-header">
                <button
                  className={`provider-radio ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleSetActive(provider)}
                  title={isActive ? t('settings.ai.active') : t('settings.ai.setActive')}
                  aria-label={isActive ? t('settings.ai.active') : t('settings.ai.setActive')}
                >
                  <span className="radio-dot"></span>
                </button>
                <div>
                  <div className="provider-title-row">
                    <h3>{provider.name}</h3>
                    <span className="provider-type">{provider.type}</span>
                    {isActive && <span className="provider-badge">{t('settings.ai.active')}</span>}
                  </div>
                  <p>{provider.model} · {provider.baseUrl || t('settings.ai.defaultEndpoint')}</p>
                </div>
              </div>
            </div>
            <div className="provider-card__actions">
              {!isActive && <button onClick={() => handleSetActive(provider)}>{t('settings.ai.setActive')}</button>}
              <button onClick={() => setEditing(provider)}>{t('common.edit')}</button>
              <button onClick={() => handleDelete(provider.id)}>{t('common.delete')}</button>
            </div>
          </div>
          )
        })}

        <button className="btn-add-provider" onClick={() => setEditing({
          id: '',
          name: 'New Provider',
          type: 'custom',
          apiKey: '',
          baseUrl: '',
          model: DEFAULT_BY_TYPE.custom.model,
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
                <label>{t('settings.ai.providerType')}</label>
                <select
                  value={editing.type}
                  onChange={(e) => {
                    const type = e.target.value as ProviderType
                    const defaults = DEFAULT_BY_TYPE[type]
                    setAvailableModels([])
                    setEditing({
                      ...editing,
                      type,
                      apiKey: providerRequiresApiKey(type) ? editing.apiKey : '',
                      baseUrl: defaults.baseUrl,
                      model: defaults.model,
                    })
                  }}
                >
                  {PROVIDER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {providerRequiresApiKey(editing.type) && (
              <div className="form-group">
                <label>{t('settings.ai.apiKey')}</label>
                <input
                  type="password"
                  value={editing.apiKey}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder={editing.hasApiKey ? t('settings.ai.savedApiKeyPlaceholder') : 'sk-...'}
                />
              </div>
              )}

              <div className="form-group">
                <label>{editing.type === 'codex' ? t('settings.ai.cliPath') : t('settings.ai.baseUrl')}</label>
                <input
                  type="text"
                  value={editing.baseUrl}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  placeholder={editing.type === 'codex' ? 'codex' : editing.type === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'}
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
                    disabled={
                      fetchingModels ||
                      editing.type === 'codex' ||
                      (providerRequiresApiKey(editing.type) && !editing.apiKey && !editing.hasApiKey)
                    }
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
                      onClick={() => {
                        setAvailableModels([])
                        setEditing({
                          ...editing,
                          name: preset.label,
                          type: preset.type,
                          apiKey: providerRequiresApiKey(preset.type) ? editing.apiKey : '',
                          baseUrl: preset.baseUrl,
                          model: preset.model,
                        })
                      }}
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
