import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AIProviderConfig } from '@shared/types/ipc'
import { toast } from '../../stores/toast-store'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
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

  const closeEditor = () => {
    setEditing(null)
    setAvailableModels([])
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
            <div key={provider.id} className={`provider-card ${isActive ? 'is-enabled' : 'is-inactive'}`}>
              <div className="provider-card__info">
                <div className="provider-header">
                  <div className="provider-copy">
                    <div className="provider-title-row">
                      <h3>{provider.name}</h3>
                      <Badge variant="outline" className="provider-type">{provider.type}</Badge>
                      {isActive && <Badge className="provider-badge">{t('settings.ai.active')}</Badge>}
                    </div>
                    <p>{provider.model} · {provider.baseUrl || t('settings.ai.defaultEndpoint')}</p>
                  </div>
                </div>
              </div>
              <div className="provider-card__actions" aria-label={`${provider.name} actions`}>
                {!isActive && (
                  <Button
                    type="button"
                    size="sm"
                    className="provider-action provider-action--primary"
                    onClick={() => handleSetActive(provider)}
                  >
                    {t('settings.ai.setActive')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="provider-action"
                  onClick={() => setEditing(provider)}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="provider-action provider-action--danger"
                  onClick={() => handleDelete(provider.id)}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          )
        })}

        <Button type="button" variant="outline" size="sm" className="btn-add-provider" onClick={() => setEditing({
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
        </Button>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(nextOpen) => !nextOpen && closeEditor()}>
        {editing && (
          <DialogContent
            className="provider-editor"
            overlayClassName="provider-editor-overlay"
            closeLabel={t('common.close')}
          >
            <DialogHeader className="provider-editor__header">
              <DialogTitle>{editing.id ? t('settings.ai.editProvider') : t('settings.ai.addProvider')}</DialogTitle>
            </DialogHeader>

            <ScrollArea className="provider-editor__content">
              <div className="provider-editor__scroll-content">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchModels}
                      disabled={
                        fetchingModels ||
                        editing.type === 'codex' ||
                        (providerRequiresApiKey(editing.type) && !editing.apiKey && !editing.hasApiKey)
                      }
                      className="btn-fetch-models"
                    >
                      {fetchingModels ? t('settings.ai.fetching') : t('settings.ai.fetchModels')}
                    </Button>
                  </div>
                </div>

                <div className="provider-editor__presets">
                  <p>{t('settings.ai.quickSetup')}</p>
                  <div className="preset-buttons">
                    {PROVIDER_PRESETS.map((preset) => (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
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
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <footer className="provider-editor__footer">
              <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? t('settings.ai.testing') : t('settings.ai.test')}
              </Button>
              <Button type="button" size="sm" onClick={handleSave}>
                {t('common.save')}
              </Button>
            </footer>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
