import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { THEME_IDS, useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { useKeyBindingStore } from '../../stores/keybinding-store'
import { ConfirmModal } from '../ConfirmModal'
import { getErrorMessage } from '../../utils/errors'
import { classifyAiProviderError, formatAiProviderError, type AiProviderErrorKind } from '../../utils/ai-provider-errors'
import { safeGet, safeSet } from '../../utils/storage'
import { applyCssSnippets, CSS_SNIPPETS_UPDATED, getEnabledSnippetNames, loadCssSnippets, setEnabledSnippetNames } from '../../utils/css-snippets'
import { applyThemePackage, getActiveThemePackageId, loadThemePackages, setActiveThemePackageId, THEME_PACKAGES_UPDATED } from '../../utils/theme-packages'
import { ProactivePreferencesTab } from '../proactive/ProactivePreferences'
import { LongContextDebugPanel } from '../observability/LongContextDebugPanel'
import type { AICostBudget, AIProviderConfig, AIUsageSummary, CloudSyncConflict, CloudSyncHealth, CssSnippet, LocalPlugin, PluginLocalPackItem, ThemePackage } from '@shared/types/ipc'
import type { Theme } from '../../stores/ui-store'

type ProviderConfig = AIProviderConfig
type CloudConfig = { supabaseUrl: string; supabaseKey: string; serviceRoleKey: string; enabled: boolean; hasSupabaseKey: boolean; hasServiceRoleKey: boolean }
type CloudUser = { email: string } | null
type SnippetView = CssSnippet & { enabled: boolean }
type ThemePackageView = ThemePackage & { active: boolean }
type ProviderSetupErrorKind = AiProviderErrorKind
type ProviderTestResult = { ok: boolean; text: string; latencyMs?: number; model?: string; errorKind?: ProviderSetupErrorKind }

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini'],
  'openai-responses': ['gpt-5.5', 'gpt-5.4', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  ollama: ['llama3.1', 'qwen2.5', 'deepseek-r1', 'gemma2', 'mistral'],
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
  custom: []
}

const PRESET_MODELS: Record<string, string[]> = {
  'DeepSeek': ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  '通义千问': ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-max', 'qwen3-max-thinking'],
  '智谱 GLM': ['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.5', 'glm-4.5v'],
  'Moonshot': ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  '零一万物': ['yi-lightning', 'yi-large', 'yi-large-turbo', 'yi-medium', 'yi-spark'],
  '豆包': ['doubao-seed-2.0-pro', 'doubao-seed-2.0-lite', 'doubao-1.5-pro-32k', 'doubao-1.5-pro-256k', 'doubao-1.5-thinking-pro'],
}

function getModelsForEditing(editing: ProviderConfig): string[] {
  if (editing.type !== 'custom') return DEFAULT_MODELS[editing.type] || []
  const presetModels = PRESET_MODELS[editing.name]
  if (presetModels) return presetModels
  const allCustom = Object.values(PRESET_MODELS).flat()
  return allCustom
}

const PROVIDER_PRESETS: { label: string; type: ProviderConfig['type']; baseUrl: string; model: string }[] = [
  { label: 'OpenAI', type: 'openai', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'OpenAI Responses', type: 'openai-responses', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'OpenAI 兼容', type: 'custom', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'Codex CLI', type: 'codex', baseUrl: 'codex', model: 'gpt-5.4' },
  { label: 'Claude', type: 'claude', baseUrl: '', model: 'claude-sonnet-4-6' },
  { label: 'DeepSeek', type: 'custom', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { label: '通义千问', type: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', type: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.1' },
  { label: 'Moonshot', type: 'custom', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' },
  { label: '零一万物', type: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning' },
  { label: '豆包', type: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2.0-pro' },
  { label: 'Ollama (本地)', type: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
]

interface SettingsProps {
  open: boolean
  onClose: () => void
}

type Tab = 'appearance' | 'ai' | 'cloud' | 'plugins' | 'keys' | 'proactive' | 'long-context'
const ACCENT_PRESETS = ['#7c6ef5', '#4facfe', '#4ec9a0', '#f0a050', '#e8577a', '#ffd60a', '#88c0d0', '#268bd2']
const SETTINGS_DIALOG_TITLE_ID = 'settings-dialog-title'
const SETTINGS_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')
export const NO_AI_MODE_LOCAL_FEATURES = ['files', 'search', 'graph', 'vaultHealth', 'maintenance'] as const
export const NO_AI_MODE_PROVIDER_FEATURES = ['chat', 'edit', 'tools', 'memory'] as const

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 12px',
  fontSize: 13,
  background: 'var(--control-bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
  transition: 'border-color 150ms',
}

export const classifyProviderSetupError = classifyAiProviderError

function getProviderConfigIssue(config: ProviderConfig): 'name' | 'api_key' | 'base_url' | 'model' | null {
  if (!config.name.trim()) return 'name'
  if (!config.model.trim()) return 'model'
  if (!['ollama', 'codex'].includes(config.type) && !config.apiKey.trim() && !config.hasApiKey) return 'api_key'
  if (config.type === 'custom' && !config.baseUrl.trim()) return 'base_url'
  return null
}

function currentMonthSince(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
}

function parseOptionalCostRate(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2
  }).format(value)
}

export function getSettingsDialogFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(SETTINGS_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.tabIndex < 0) return false
    if (element.hasAttribute('hidden')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    return true
  })
}

export function getSettingsDialogTabTarget(
  container: HTMLElement,
  activeElement: Element | null,
  shiftKey: boolean
): HTMLElement | null {
  const focusable = getSettingsDialogFocusableElements(container)
  if (focusable.length === 0) return container

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeInside = !!activeElement && container.contains(activeElement)

  if (shiftKey) {
    return !activeInside || activeElement === first ? last : null
  }
  return !activeInside || activeElement === last ? first : null
}

export function Settings({ open, onClose }: SettingsProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('appearance')
  const settingsInitialTab = useUIStore((s) => s.settingsInitialTab)
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab)
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [testingProvider, setTestingProvider] = useState(false)
  const [probing, setProbing] = useState(false)
  const [validationResult, setValidationResult] = useState<ProviderTestResult | null>(null)
  const [probeResult, setProbeResult] = useState<ProviderTestResult | null>(null)
  const [aiUsageSummary, setAiUsageSummary] = useState<AIUsageSummary | null>(null)
  const [aiUsageLoading, setAiUsageLoading] = useState(false)
  const [aiCostBudget, setAiCostBudget] = useState<AICostBudget | null>(null)
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ supabaseUrl: '', supabaseKey: '', serviceRoleKey: '', enabled: false, hasSupabaseKey: false, hasServiceRoleKey: false })
  const [cloudUser, setCloudUser] = useState<CloudUser>(null)
  const [detectConfirm, setDetectConfirm] = useState(false)
  const overlayPointerDownRef = useRef(false)
  const providerOverlayPointerDownRef = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  const loadAiUsageSummary = async () => {
    setAiUsageLoading(true)
    try {
      const summary = await window.api.invoke('ai:get-usage-summary', { since: currentMonthSince() })
      setAiUsageSummary(summary)
    } catch {
      setAiUsageSummary(null)
    } finally {
      setAiUsageLoading(false)
    }
  }

  const loadAiCostBudget = async () => {
    try {
      const budget = await window.api.invoke('ai:get-cost-budget', undefined)
      setAiCostBudget(budget)
    } catch {
      setAiCostBudget(null)
    }
  }

  useEffect(() => {
    if (open && settingsInitialTab) {
      setTab(settingsInitialTab as Tab)
      setSettingsInitialTab(null)
    }
  }, [open, settingsInitialTab, setSettingsInitialTab])

  useEffect(() => {
    if (open) {
      window.api.invoke('ai:get-providers', undefined).then((ps) => {
        setProviders(ps)
        window.api.invoke('ai:get-active-provider', undefined).then((storedActiveId) => {
          if (storedActiveId && ps.find((p) => p.id === storedActiveId)) {
            setActiveProviderId(storedActiveId)
          } else {
            const active = ps.find((p) => p.enabled)
            setActiveProviderId(active?.id || ps[0]?.id || null)
          }
        }).catch(() => {
          const active = ps.find((p) => p.enabled)
          setActiveProviderId(active?.id || ps[0]?.id || null)
        })
      })
      window.api.invoke('cloud:get-config', undefined).then((config) => {
        setCloudConfig({ ...config, supabaseKey: '', serviceRoleKey: '' })
      })
      window.api.invoke('cloud:get-user', undefined).then(setCloudUser)
      loadAiUsageSummary()
      loadAiCostBudget()
    }
  }, [open])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const dialog = dialogRef.current
    if (!dialog) return

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = getSettingsDialogFocusableElements(dialog)[0]
      ;(firstFocusable || dialog).focus()
    }, 0)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const target = getSettingsDialogTabTarget(dialog, document.activeElement, e.shiftKey)
      if (!target) return
      e.preventDefault()
      target.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previousActiveElementRef.current
      if (previous && document.contains(previous)) previous.focus()
      previousActiveElementRef.current = null
    }
  }, [open, onClose])

  const saveProviders = async (updated: ProviderConfig[]) => {
    await window.api.invoke('ai:save-providers', { providers: updated })
    setProviders(updated.map((provider) => ({
      ...provider,
      apiKey: '',
      hasApiKey: !!provider.apiKey || !!provider.hasApiKey
    })))
  }

  const resetProviderTestState = () => {
    setValidationResult(null)
    setProbeResult(null)
  }

  const handleAdd = (preset?: typeof PROVIDER_PRESETS[0]) => {
    resetProviderTestState()
    setEditing({
      id: crypto.randomUUID(),
      name: preset?.label || '',
      type: preset?.type || 'openai',
      baseUrl: preset?.baseUrl || '',
      apiKey: '',
      model: preset?.model || 'gpt-4.1-mini',
      enabled: true
    })
  }

  const handleEditProvider = (provider: ProviderConfig) => {
    resetProviderTestState()
    setEditing(provider)
  }

  const handleSave = () => {
    if (!editing) return
    const normalized = {
      ...editing,
      name: editing.name.trim(),
      apiKey: editing.apiKey.trim(),
      baseUrl: editing.type === 'codex' && !editing.baseUrl.trim() ? 'codex' : editing.baseUrl.trim(),
      inputCostPer1MTokens: typeof editing.inputCostPer1MTokens === 'number' ? editing.inputCostPer1MTokens : undefined,
      outputCostPer1MTokens: typeof editing.outputCostPer1MTokens === 'number' ? editing.outputCostPer1MTokens : undefined
    }
    if (!normalized.name) {
      toast('请填写提供商名称', 'error')
      return
    }
    if (!['ollama', 'codex'].includes(normalized.type) && !normalized.apiKey && !editing.hasApiKey) {
      toast('请填写 API Key', 'error')
      return
    }
    if (normalized.type === 'custom' && !normalized.baseUrl) {
      toast('请填写 OpenAI 兼容接口的 Base URL', 'error')
      return
    }
    const exists = providers.find((p) => p.id === editing.id)
    const updated = exists
      ? providers.map((p) => p.id === editing.id ? normalized : p)
      : [...providers, normalized]
    saveProviders(updated)
    setEditing(null)
  }

  const handleDelete = (id: string) => {
    saveProviders(providers.filter((p) => p.id !== id))
  }

  const handleValidateEditing = async () => {
    if (!editing) return
    setTestingProvider(true)
    setValidationResult(null)
    try {
      const result = await window.api.invoke('ai:validate', { config: editing })
      const message = result.error || t('settings.providerTest.unknownError')
      const formattedMessage = formatAiProviderError(message, t)
      setValidationResult(result.ok
        ? { ok: true, text: t('settings.providerTest.connectionOk') }
        : {
          ok: false,
          text: formattedMessage,
          errorKind: classifyProviderSetupError(message)
        })
      toast(
        result.ok
          ? t('settings.providerTest.connectionToastOk')
          : t('settings.providerTest.connectionToastFailed', { message: formattedMessage }),
        result.ok ? 'success' : 'error'
      )
    } catch (e: unknown) {
      const message = getErrorMessage(e, t('settings.providerTest.unknownError'))
      const formattedMessage = formatAiProviderError(message, t)
      setValidationResult({ ok: false, text: formattedMessage, errorKind: classifyProviderSetupError(message) })
      toast(t('settings.providerTest.connectionToastFailed', { message: formattedMessage }), 'error')
    } finally {
      setTestingProvider(false)
    }
  }

  const handleProbeQuestion = async () => {
    if (!editing) return
    setProbing(true)
    setProbeResult(null)
    try {
      const result = await window.api.invoke('ai:probe-question', { config: editing })
      if (result.ok) {
        setProbeResult({ ok: true, text: result.answer, latencyMs: result.latencyMs, model: result.model })
      } else {
        const message = result.error || t('settings.providerTest.unknownError')
        setProbeResult({ ok: false, text: formatAiProviderError(message, t), errorKind: classifyProviderSetupError(message) })
      }
    } catch (e: unknown) {
      const message = getErrorMessage(e, t('settings.providerTest.unknownError'))
      setProbeResult({ ok: false, text: formatAiProviderError(message, t), errorKind: classifyProviderSetupError(message) })
    } finally {
      setProbing(false)
      loadAiUsageSummary()
    }
  }

  const handleSetActive = async (id: string) => {
    await window.api.invoke('ai:set-active', { providerId: id })
    setActiveProviderId(id)
    const provider = providers.find((p) => p.id === id)
    toast(`已激活: ${provider?.name || 'AI 提供商'}`, 'success')
  }

  const handleSaveAiCostBudget = async (budget: AICostBudget) => {
    try {
      const saved = await window.api.invoke('ai:set-cost-budget', budget)
      setAiCostBudget(saved)
      toast('AI 月预算已保存', 'success')
    } catch (error) {
      toast(`AI 月预算保存失败: ${getErrorMessage(error)}`, 'error')
    }
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)' } as React.CSSProperties}
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (overlayPointerDownRef.current && e.target === e.currentTarget) onClose()
        overlayPointerDownRef.current = false
      }}
    >
      <div
        ref={dialogRef}
        className="animate-scale-in glass-popover settings-dialog-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={SETTINGS_DIALOG_TITLE_ID}
        tabIndex={-1}
        style={{ width: 780, maxWidth: 'calc(100vw - 40px)', height: 620, maxHeight: 'calc(100vh - 40px)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="settings-dialog-header">
          <span id={SETTINGS_DIALOG_TITLE_ID} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.title')}</span>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-dialog-body">
          <nav className="settings-tab-bar" role="tablist" aria-orientation="vertical" aria-label={t('settings.title')}>
            {(['appearance', 'ai', 'cloud', 'plugins', 'keys', 'proactive', 'long-context'] as Tab[]).map((tabId) => {
              const active = tab === tabId
              return (
                <button
                  key={tabId}
                  role="tab"
                  aria-selected={active}
                  className={`settings-tab${active ? ' is-active' : ''}`}
                  onClick={() => setTab(tabId)}
                >
                  <span className="settings-tab-label">{t(`settings.tabs.${tabId}`)}</span>
                </button>
              )
            })}
          </nav>

          <div className="file-tree-scroll settings-tab-content" role="tabpanel" aria-label={t(`settings.tabs.${tab}`)}>
          {tab === 'appearance' && (
            <AppearanceTab />
          )}

          {tab === 'ai' && (<>
            {/* AI header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>已配置</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setDetectConfirm(true)}
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: 'pointer', padding: '3px 8px', borderRadius: 4 }}
                >
                  自动检测
                </button>
                <button
                  onClick={() => handleAdd()}
                  style={{ fontSize: 12, color: 'var(--accent-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                >
                  + 添加
                </button>
              </div>
            </div>

            <AIUsageSummaryPanel
              summary={aiUsageSummary}
              budget={aiCostBudget}
              loading={aiUsageLoading}
              onRefresh={loadAiUsageSummary}
              onSaveBudget={handleSaveAiCostBudget}
            />

            {providers.length === 0 && !editing && (
              <NoAiModePanel />
            )}

            {/* Quick presets */}
            {providers.length === 0 && !editing && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>快速添加</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleAdd(preset)}
                      style={{ height: 28, padding: '0 10px', fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer', transition: 'all 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {providers.map((p) => {
                const isActive = p.id === activeProviderId
                return (
                <div key={p.id} style={{ padding: '12px 14px', borderRadius: 10, border: isActive ? '1px solid color-mix(in srgb, var(--accent) 42%, var(--border-subtle))' : '1px solid var(--control-border)', background: isActive ? 'var(--accent-muted)' : 'var(--control-bg)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontWeight: 500 }}>{p.type}</span>
                      {isActive && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'var(--success-muted)', color: 'var(--success)', fontWeight: 500 }}>使用中</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!isActive && <button onClick={() => handleSetActive(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--text-on-accent)', background: 'var(--accent)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>激活</button>}
                      <button onClick={() => handleEditProvider(p)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>编辑</button>
                      <button onClick={() => handleDelete(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>删除</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{p.model} · {p.type === 'codex' ? (p.baseUrl || 'codex') : (p.baseUrl || '默认地址')}</p>
                </div>
                )
              })}
            </div>

            {/* Quick add presets (when providers exist) */}
            {providers.length > 0 && !editing && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>快速添加</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleAdd(preset)}
                      style={{ height: 24, padding: '0 8px', fontSize: 10, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', transition: 'all 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <InlineCompletionSection />

            {/* System Prompt */}
            <SystemPromptSection />
          </>)}

          {tab === 'cloud' && (
            <CloudTab
              cloudConfig={cloudConfig}
              setCloudConfig={setCloudConfig}
              cloudUser={cloudUser}
              setCloudUser={setCloudUser}
              inputStyle={inputStyle}
            />
          )}

          {tab === 'plugins' && <PluginsTab />}

          {tab === 'keys' && <KeyBindingsTab />}

          {tab === 'proactive' && <ProactivePreferencesTab />}

          {tab === 'long-context' && <LongContextDebugPanel />}
          </div>
        </div>
      </div>
      {/* Provider edit modal */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)' } as React.CSSProperties}
          onPointerDown={(e) => {
            providerOverlayPointerDownRef.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            if (providerOverlayPointerDownRef.current && e.target === e.currentTarget) setEditing(null)
            providerOverlayPointerDownRef.current = false
          }}
        >
          <div
            className="animate-scale-in glass-popover"
            style={{ width: 440, background: 'var(--bg-glass-dense, var(--bg-glass-solid))', borderRadius: 14, border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ height: 44, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb, var(--panel-bg-soft) 70%, transparent)', boxShadow: 'inset 0 -1px 0 var(--border-faint)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {providers.find((p) => p.id === editing.id) ? '编辑提供商' : '添加提供商'}
              </span>
              <button onClick={() => setEditing(null)} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ padding: '16px 18px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Preset selector */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 500 }}>选择厂商</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PROVIDER_PRESETS.map((preset) => {
                    const isSelected = editing.name === preset.label || (editing.baseUrl === preset.baseUrl && editing.type === preset.type && preset.baseUrl !== '')
                    return (
                      <button
                        key={preset.label}
                        onClick={() => setEditing({ ...editing, name: preset.label, type: preset.type, baseUrl: preset.baseUrl, model: preset.model })}
                        style={{
                          height: 28, padding: '0 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 100ms',
                          background: isSelected ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                          color: isSelected ? 'var(--accent-text)' : 'var(--text-secondary)',
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                          fontWeight: isSelected ? 500 : 400,
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setEditing({ ...editing, name: editing.name || '自定义', type: 'custom', baseUrl: editing.baseUrl })}
                    style={{
                      height: 28, padding: '0 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 100ms',
                      background: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                      color: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? 'var(--accent-text)' : 'var(--text-secondary)',
                      border: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                    }}
                  >
                    其他...
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>名称</label>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    style={inputStyle} placeholder="My Provider"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>协议类型</label>
                  <ModelSelect
                    value={{ openai: 'OpenAI', 'openai-responses': 'OpenAI Responses', claude: 'Claude (Anthropic)', custom: 'OpenAI 兼容', ollama: 'Ollama (本地)', codex: 'Codex CLI' }[editing.type] || editing.type}
                    options={['OpenAI', 'OpenAI 兼容', 'Codex CLI', 'Claude (Anthropic)', 'Ollama (本地)']}
                    allowCustom={false}
                    placeholder="选择协议"
                    onChange={(val) => {
                      const typeMap: Record<string, ProviderConfig['type']> = { 'OpenAI': 'openai', 'OpenAI Responses': 'openai-responses', 'Claude (Anthropic)': 'claude', 'OpenAI 兼容': 'custom', 'Ollama (本地)': 'ollama', 'Codex CLI': 'codex' }
                      const newType = typeMap[val] || 'custom'
                      setEditing({
                        ...editing,
                        type: newType,
                        apiKey: newType === 'codex' ? '' : editing.apiKey,
                        baseUrl: newType === 'codex' ? (editing.type === 'codex' ? editing.baseUrl || 'codex' : 'codex') : editing.baseUrl,
                        model: DEFAULT_MODELS[newType]?.[0] || editing.model
                      })
                    }}
                  />
                </div>
              </div>
              {editing.type !== 'codex' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>API Key</label>
                  <input type="password" value={editing.apiKey} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    style={inputStyle} placeholder={editing.hasApiKey ? '已保存，留空保留现有 Key' : editing.type === 'ollama' ? '无需填写' : 'sk-...'}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>{editing.type === 'codex' ? 'CLI 路径' : `Base URL ${editing.type === 'openai' || editing.type === 'openai-responses' || editing.type === 'claude' ? '(留空使用官方)' : ''}`}</label>
                <input value={editing.baseUrl} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  style={inputStyle} placeholder={editing.type === 'codex' ? 'codex 或 /usr/local/bin/codex' : editing.type === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>输入价格（USD / 100万 tokens）</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editing.inputCostPer1MTokens ?? ''}
                    onChange={(e) => setEditing({ ...editing, inputCostPer1MTokens: parseOptionalCostRate(e.target.value) })}
                    style={inputStyle}
                    placeholder="例如 0.15"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>输出价格（USD / 100万 tokens）</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editing.outputCostPer1MTokens ?? ''}
                    onChange={(e) => setEditing({ ...editing, outputCostPer1MTokens: parseOptionalCostRate(e.target.value) })}
                    style={inputStyle}
                    placeholder="例如 0.60"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>模型</label>
                <ModelSelect
                  value={editing.model}
                  options={getModelsForEditing(editing)}
                  placeholder="选择或输入模型"
                  onChange={(model) => setEditing({ ...editing, model })}
                />
              </div>
              <ProviderSetupChecklist
                config={editing}
                validationResult={validationResult}
                probeResult={probeResult}
                testingProvider={testingProvider}
                probing={probing}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={handleProbeQuestion} disabled={probing || testingProvider} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: probing ? 'wait' : 'pointer', opacity: probing ? 0.6 : 1 }}>{probing ? t('settings.providerTest.probing') : t('settings.providerTest.probeAction')}</button>
                <button onClick={handleValidateEditing} disabled={testingProvider} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: testingProvider ? 'wait' : 'pointer', opacity: testingProvider ? 0.6 : 1 }}>{testingProvider ? t('settings.providerTest.testing') : t('settings.providerTest.validateAction')}</button>
                <button onClick={() => setEditing(null)} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}>取消</button>
                <button onClick={handleSave} style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>保存</button>
              </div>
              {probeResult && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: 'var(--control-bg)', border: `1px solid ${probeResult.ok ? 'var(--control-border)' : 'color-mix(in srgb, var(--danger) 38%, transparent)'}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    {probeResult.ok
                      ? t('settings.providerTest.probeAnswer', { latency: probeResult.latencyMs ?? 0, model: probeResult.model || editing.model })
                      : t('settings.providerTest.probeFailed')}
                  </div>
                  <div style={{ fontSize: 12, color: probeResult.ok ? 'var(--text-primary)' : 'var(--danger)', whiteSpace: 'pre-wrap' }}>
                    {probeResult.text}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={detectConfirm}
        title="自动检测 AI 配置"
        message="将读取本地 Claude Code / Codex 配置并在主进程内导入；不会把检测到的密钥回传到界面。"
        confirmText="检测并导入"
        onConfirm={async () => {
          setDetectConfirm(false)
          const detected = await window.api.invoke('ai:detect-local-config', undefined)
          if (detected.imported > 0) {
            const ps = await window.api.invoke('ai:get-providers', undefined)
            setProviders(ps)
            const active = ps.find((p) => p.enabled)
            setActiveProviderId(active?.id || ps[0]?.id || null)
            toast(`已检测并添加 ${detected.imported} 个 AI 配置`, 'success')
          } else if (detected.existing > 0) {
            toast('检测到的 AI 配置已存在', 'info')
          } else if (detected.skipped?.length) {
            toast(detected.skipped[0], 'info')
          } else {
            toast('未检测到本地 AI 配置，或已存在', 'info')
          }
        }}
        onCancel={() => setDetectConfirm(false)}
      />
    </div>
  )
}

function AIUsageSummaryPanel({
  summary,
  budget,
  loading,
  onRefresh,
  onSaveBudget
}: {
  summary: AIUsageSummary | null
  budget: AICostBudget | null
  loading: boolean
  onRefresh: () => void
  onSaveBudget: (budget: AICostBudget) => void | Promise<void>
}) {
  const providerRows = summary?.byProvider.slice(0, 3) || []
  const costLabel = summary
    ? `${formatUsd(summary.estimatedCostUsd)}${summary.unknownCostRecords > 0 ? ` + ${summary.unknownCostRecords} 条未计价` : ''}`
    : '-'
  const [budgetInput, setBudgetInput] = useState('')
  const [warnAtPercent, setWarnAtPercent] = useState(80)

  useEffect(() => {
    setBudgetInput(budget?.monthlyUsd ? String(budget.monthlyUsd) : '')
    setWarnAtPercent(budget?.warnAtPercent ?? 80)
  }, [budget])

  const saveBudget = () => {
    const parsed = Number(budgetInput)
    void onSaveBudget({
      monthlyUsd: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      warnAtPercent
    })
  }

  return (
    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>本月用量</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.65 : 1 }}
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
        <div>
          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)' }}>请求</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{summary ? formatTokenCount(summary.records) : '-'}</span>
        </div>
        <div>
          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)' }}>Tokens</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{summary ? formatTokenCount(summary.totalTokens) : '-'}</span>
        </div>
        <div>
          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)' }}>成本</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{costLabel}</span>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>月预算 USD</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={budgetInput}
          onChange={(event) => setBudgetInput(event.target.value)}
          placeholder="不限制"
          style={{ width: 92, height: 24, padding: '0 7px', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none' }}
        />
        <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>提醒</label>
        <select
          value={warnAtPercent}
          onChange={(event) => setWarnAtPercent(Number(event.target.value))}
          style={{ height: 24, padding: '0 6px', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none' }}
        >
          <option value={70}>70%</option>
          <option value={80}>80%</option>
          <option value={90}>90%</option>
          <option value={100}>100%</option>
        </select>
        <button
          onClick={saveBudget}
          style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' }}
        >
          保存预算
        </button>
      </div>
      {providerRows.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {providerRows.map((row) => (
            <div key={`${row.providerId}:${row.model}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.providerName} · {row.model}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{formatTokenCount(row.totalTokens)} tokens</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{row.unknownCostRecords > 0 ? '未计价' : formatUsd(row.estimatedCostUsd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SYNC_STATUS_TONES: Record<CloudSyncHealth['status'], string> = {
  idle: 'var(--text-tertiary)',
  ok: 'var(--success)',
  conflict: 'var(--warning)',
  error: 'var(--danger)'
}
type SyncNoticeTone = 'neutral' | 'success' | 'warning' | 'error'
const SYNC_NOTICE_COLORS: Record<SyncNoticeTone, string> = {
  neutral: 'var(--text-tertiary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--danger)'
}

function formatSyncTimestamp(value: number | null, locale?: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function formatSyncConflictTimestamp(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function formatSyncConflictHash(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function getSyncFailureText(health: CloudSyncHealth, t: (key: string, options?: Record<string, unknown>) => unknown): string {
  if (health.lastError) return health.lastError
  if (health.status === 'conflict') return String(t('settings.cloudSync.conflictPending', { count: health.conflicts }))
  if (health.status === 'error') return String(t('settings.cloudSync.syncUnknownError'))
  return String(t('settings.cloudSync.noFailure'))
}

export function CloudSyncHealthPanel({
  health,
  loading,
  onRefresh
}: {
  health: CloudSyncHealth | null
  loading: boolean
  onRefresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const tone = health ? SYNC_STATUS_TONES[health.status] : 'var(--text-tertiary)'
  const statusLabel = health
    ? t(`settings.cloudSync.statusValues.${health.status}`)
    : t('settings.cloudSync.noData')
  const providerLabel = health
    ? `${health.activeProviderName} · ${health.activeProviderConfigured ? t('settings.cloudSync.configured') : t('settings.cloudSync.notConfigured')}`
    : t('settings.cloudSync.noData')
  const lastSyncValue = health?.lastRunAt
    ? formatSyncTimestamp(health.lastRunAt, i18n.resolvedLanguage || i18n.language)
    : t('settings.cloudSync.notSynced')
  const lastSyncDetail = health?.lastDirection
    ? t(`settings.cloudSync.direction.${health.lastDirection}`)
    : t('settings.cloudSync.noData')
  const failureValue = health ? getSyncFailureText(health, t) : t('settings.cloudSync.noData')
  const transferValue = health
    ? t('settings.cloudSync.pendingValue', { pushed: health.pushed, pulled: health.pulled })
    : '—'
  const queueValue = health
    ? t('settings.cloudSync.queueValue', { count: health.offlineQueueSize })
    : '—'

  return (
    <section
      aria-label={t('settings.cloudSync.title')}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--control-bg)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 3 }}>
            {t('settings.cloudSync.title')}
          </div>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', maxWidth: 520 }}>
            {t('settings.cloudSync.description')}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.65 : 1 }}
        >
          {loading ? t('settings.cloudSync.refreshing') : t('settings.cloudSync.refresh')}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t('settings.cloudSync.provider')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{providerLabel}</span>
        <span style={{ padding: '2px 7px', borderRadius: 999, border: `1px solid ${tone}33`, fontSize: 10, color: tone, background: 'var(--bg-elevated)' }}>
          {statusLabel}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{queueValue}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <SyncHealthStat label={t('settings.cloudSync.lastSync')} value={lastSyncValue} detail={lastSyncDetail} />
        <SyncHealthStat
          label={t('settings.cloudSync.status')}
          value={statusLabel}
          detail={health ? (health.activeProviderConfigured ? t('settings.cloudSync.configured') : t('settings.cloudSync.notConfigured')) : t('settings.cloudSync.noData')}
        />
        <SyncHealthStat label={t('settings.cloudSync.lastError')} value={failureValue} detail={queueValue} />
        <SyncHealthStat label={t('settings.cloudSync.transfers')} value={transferValue} detail={queueValue} />
      </div>
      <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontSize: 10, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>
        {t('settings.cloudSync.recoveryHint')}
      </div>
    </section>
  )
}

function SyncHealthStat({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div style={{ minWidth: 0, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
    </div>
  )
}

export function CloudSyncBoundaryNotice() {
  const { t } = useTranslation()

  return (
    <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--control-bg)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 4 }}>
        {t('settings.cloudSync.boundaryTitle')}
      </div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', maxWidth: 560 }}>
        {t('settings.cloudSync.boundaryHint')}
      </p>
    </div>
  )
}

export function CloudSyncConflictList({
  conflicts,
  resolvingPath,
  onResolve
}: {
  conflicts: CloudSyncConflict[]
  resolvingPath: string | null
  onResolve: (path: string, resolution: 'local' | 'remote') => void
}) {
  const { t, i18n } = useTranslation()

  if (conflicts.length === 0) return null

  return (
    <section
      aria-label={t('settings.cloudSync.conflicts.title')}
      style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)', background: 'var(--control-bg)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--warning)', marginBottom: 4 }}>
            {t('settings.cloudSync.conflicts.title')}
          </div>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', maxWidth: 560 }}>
            {t('settings.cloudSync.conflicts.description')}
          </p>
        </div>
        <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--warning) 34%, transparent)', color: 'var(--warning)', background: 'var(--warning-muted)', fontSize: 10 }}>
          {t('settings.cloudSync.conflicts.count', { count: conflicts.length })}
        </span>
      </div>

      <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {t('settings.cloudSync.conflicts.explanation')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {conflicts.map((conflict) => {
          const busy = resolvingPath === conflict.path
          return (
            <div
              key={conflict.path}
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    title={conflict.path}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {conflict.path}
                  </div>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <SyncConflictStat
                      label={t('settings.cloudSync.conflicts.local')}
                      updatedLabel={t('settings.cloudSync.conflicts.localUpdated', { value: formatSyncConflictTimestamp(conflict.localUpdatedAt, i18n.resolvedLanguage || i18n.language) })}
                      updatedValue={conflict.localUpdatedAt}
                      hashLabel={t('settings.cloudSync.conflicts.localHash', { hash: formatSyncConflictHash(conflict.localHash) })}
                      hashValue={conflict.localHash}
                    />
                    <SyncConflictStat
                      label={t('settings.cloudSync.conflicts.remote')}
                      updatedLabel={t('settings.cloudSync.conflicts.remoteUpdated', { value: formatSyncConflictTimestamp(conflict.remoteUpdatedAt, i18n.resolvedLanguage || i18n.language) })}
                      updatedValue={conflict.remoteUpdatedAt}
                      hashLabel={t('settings.cloudSync.conflicts.remoteHash', { hash: formatSyncConflictHash(conflict.remoteHash) })}
                      hashValue={conflict.remoteHash}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onResolve(conflict.path, 'local')}
                    disabled={busy}
                    title={t('settings.cloudSync.conflicts.keepLocalHint')}
                    style={{ height: 28, padding: '0 10px', fontSize: 11, color: 'var(--text-on-accent)', background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1, fontWeight: 500 }}
                  >
                    {t('settings.cloudSync.conflicts.keepLocal')}
                  </button>
                  <button
                    onClick={() => onResolve(conflict.path, 'remote')}
                    disabled={busy}
                    title={t('settings.cloudSync.conflicts.pullRemoteHint')}
                    style={{ height: 28, padding: '0 10px', fontSize: 11, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1, fontWeight: 500 }}
                  >
                    {t('settings.cloudSync.conflicts.pullRemote')}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SyncConflictStat({
  label,
  updatedLabel,
  updatedValue,
  hashLabel,
  hashValue
}: {
  label: string
  updatedLabel: string
  updatedValue: string
  hashLabel: string
  hashValue: string
}) {
  return (
    <div style={{ minWidth: 0, padding: 8, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }} title={updatedValue}>{updatedLabel}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }} title={hashValue}>{hashLabel}</div>
    </div>
  )
}

export function NoAiModePanel() {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('settings.noAiMode.title')}
      style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--control-bg)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 3 }}>
            {t('settings.noAiMode.title')}
          </div>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', maxWidth: 520 }}>
            {t('settings.noAiMode.description')}
          </p>
        </div>
        <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}>
          {t('settings.noAiMode.badge')}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <NoAiModeFeatureGroup
          title={t('settings.noAiMode.localAvailable')}
          featureKeys={NO_AI_MODE_LOCAL_FEATURES}
          translationPrefix="settings.noAiMode.localFeatures"
        />
        <NoAiModeFeatureGroup
          title={t('settings.noAiMode.requiresProvider')}
          featureKeys={NO_AI_MODE_PROVIDER_FEATURES}
          translationPrefix="settings.noAiMode.providerFeatures"
        />
      </div>
    </section>
  )
}

function NoAiModeFeatureGroup({
  title,
  featureKeys,
  translationPrefix
}: {
  title: string
  featureKeys: readonly string[]
  translationPrefix: string
}) {
  const { t } = useTranslation()

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 650, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {featureKeys.map((feature) => (
          <span
            key={feature}
            style={{ padding: '3px 7px', borderRadius: 999, border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', fontSize: 10, lineHeight: 1.2 }}
          >
            {t(`${translationPrefix}.${feature}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

type ProviderChecklistStatus = 'idle' | 'running' | 'success' | 'error'

interface ProviderSetupChecklistProps {
  config: ProviderConfig
  validationResult: ProviderTestResult | null
  probeResult: ProviderTestResult | null
  testingProvider: boolean
  probing: boolean
}

function ProviderSetupChecklist({ config, validationResult, probeResult, testingProvider, probing }: ProviderSetupChecklistProps) {
  const { t } = useTranslation()
  const configIssue = getProviderConfigIssue(config)
  const resultDetail = (result: ProviderTestResult | null, fallback: string): string => {
    if (!result) return fallback
    if (result.ok) return result.text
    return result.text
  }
  const items: Array<{ key: string; label: string; status: ProviderChecklistStatus; detail: string }> = [
    {
      key: 'config',
      label: t('settings.providerTest.config'),
      status: configIssue ? 'error' : 'success',
      detail: configIssue
        ? t(`settings.providerTest.configIssues.${configIssue}`)
        : t('settings.providerTest.configOk')
    },
    {
      key: 'connection',
      label: t('settings.providerTest.connection'),
      status: testingProvider ? 'running' : validationResult ? (validationResult.ok ? 'success' : 'error') : 'idle',
      detail: testingProvider
        ? t('settings.providerTest.testing')
        : resultDetail(validationResult, t('settings.providerTest.notTested'))
    },
    {
      key: 'response',
      label: t('settings.providerTest.response'),
      status: probing ? 'running' : probeResult ? (probeResult.ok ? 'success' : 'error') : 'idle',
      detail: probing
        ? t('settings.providerTest.probing')
        : resultDetail(probeResult, t('settings.providerTest.notTested'))
    }
  ]
  const colorByStatus: Record<ProviderChecklistStatus, string> = {
    idle: 'var(--text-tertiary)',
    running: 'var(--accent)',
    success: 'var(--success)',
    error: 'var(--danger)'
  }

  return (
    <div style={{ marginBottom: 14, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--control-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-secondary)' }}>{t('settings.providerTest.title')}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t('settings.providerTest.optional')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '14px 82px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, minHeight: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: colorByStatus[item.status] }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.label}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: item.status === 'error' ? 'var(--danger)' : 'var(--text-tertiary)' }}>{item.detail}</span>
            <span style={{ fontSize: 10, color: colorByStatus[item.status], textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t(`settings.providerTest.status.${item.status}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface CloudTabProps {
  cloudConfig: CloudConfig
  setCloudConfig: React.Dispatch<React.SetStateAction<CloudConfig>>
  cloudUser: CloudUser
  setCloudUser: React.Dispatch<React.SetStateAction<CloudUser>>
  inputStyle: React.CSSProperties
}

function CloudTab({ cloudConfig, setCloudConfig, cloudUser, setCloudUser, inputStyle }: CloudTabProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [activeProvider, setActiveProvider] = useState<string>('supabase')
  const [providers, setProviders] = useState<{ type: string; name: string; configured: boolean }[]>([])
  const [syncHealth, setSyncHealth] = useState<CloudSyncHealth | null>(null)
  const [syncHealthLoading, setSyncHealthLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncMsgTone, setSyncMsgTone] = useState<SyncNoticeTone>('neutral')
  const [conflicts, setConflicts] = useState<CloudSyncConflict[]>([])
  const [resolvingPath, setResolvingPath] = useState<string | null>(null)
  const [onedriveConfig, setOnedriveConfig] = useState({ clientId: '', folder: '/Nexusky' })
  const [webdavConfig, setWebdavConfig] = useState({ url: '', username: '', password: '', folder: '/Nexusky', hasPassword: false })
  const [s3Config, setS3Config] = useState({ endpoint: '', region: 'us-east-1', bucket: '', accessKeyId: '', secretAccessKey: '', prefix: 'Nexusky', hasAccessKeyId: false, hasSecretAccessKey: false })
  const [icloudPath, setIcloudPath] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('cloud:get-sync-provider', undefined).then(setActiveProvider)
    window.api.invoke('cloud:get-all-providers', undefined).then(setProviders)
    window.api.invoke('cloud:get-onedrive-config', undefined).then((c) => {
      if (c) setOnedriveConfig({ clientId: c.clientId, folder: c.folder })
    })
    window.api.invoke('cloud:get-webdav-config', undefined).then((c) => setWebdavConfig({ url: c.url, username: c.username || '', password: '', folder: c.folder, hasPassword: c.hasPassword }))
    window.api.invoke('cloud:get-s3-config', undefined).then((c) => setS3Config({ endpoint: c.endpoint, region: c.region, bucket: c.bucket, accessKeyId: '', secretAccessKey: '', prefix: c.prefix || '', hasAccessKeyId: c.hasAccessKeyId, hasSecretAccessKey: c.hasSecretAccessKey }))
    window.api.invoke('cloud:get-icloud-path', undefined).then(setIcloudPath)
  }, [])

  const loadSyncHealth = useCallback(async () => {
    setSyncHealthLoading(true)
    try {
      const currentVaultPath = vaultPath || await window.api.invoke('vault:get', undefined)
      const health = await window.api.invoke('cloud:get-sync-health', currentVaultPath ? { vaultPath: currentVaultPath } : undefined)
      setSyncHealth(health)
      return health
    } finally {
      setSyncHealthLoading(false)
    }
  }, [vaultPath])

  useEffect(() => {
    void loadSyncHealth().catch(() => {})
  }, [loadSyncHealth])

  const showSyncMessage = useCallback((message: string, tone: SyncNoticeTone) => {
    setSyncMsg(message)
    setSyncMsgTone(tone)
  }, [])

  const switchProvider = async (type: string) => {
    setActiveProvider(type)
    await window.api.invoke('cloud:set-sync-provider', { provider: type })
    await loadSyncHealth().catch(() => {})
  }

  const handleSync = async () => {
    setSyncing(true)
    showSyncMessage('', 'neutral')
    setConflicts([])
    const vaultPath = await window.api.invoke('vault:get', undefined)
    if (!vaultPath) {
      setSyncing(false)
      return
    }
    try {
      const result = await window.api.invoke('cloud:sync', { vaultPath })
      if (result.errors.length === 0 && result.conflicts.length === 0) {
        showSyncMessage(t('settings.cloudSync.syncComplete', { pushed: result.pushed, pulled: result.pulled }), 'success')
      } else if (result.conflicts.length > 0) {
        setConflicts(result.conflicts)
        showSyncMessage(t('settings.cloudSync.syncConflict', { pushed: result.pushed, pulled: result.pulled, count: result.conflicts.length }), 'warning')
      } else {
        showSyncMessage(t('common.syncFailed', { error: result.errors[0] || t('settings.cloudSync.syncUnknownError') }), 'error')
      }
    } catch (error: unknown) {
      showSyncMessage(t('common.syncFailed', { error: getErrorMessage(error, t('settings.cloudSync.syncUnknownError')) }), 'error')
    } finally {
      setSyncing(false)
      await loadSyncHealth().catch(() => {})
    }
  }

  const handleResolveConflict = async (path: string, resolution: 'local' | 'remote') => {
    const vaultPath = await window.api.invoke('vault:get', undefined)
    if (!vaultPath) return
    setResolvingPath(path)
    try {
      const ok = await window.api.invoke('cloud:resolve-conflict', { vaultPath, path, resolution })
      if (ok) {
        showSyncMessage(
          resolution === 'local'
            ? t('settings.cloudSync.conflicts.resolveSuccessLocal', { path })
            : t('settings.cloudSync.conflicts.resolveSuccessRemote', { path }),
          'success'
        )
        setConflicts((prev) => prev.filter((c) => c.path !== path))
      } else {
        showSyncMessage(t('settings.cloudSync.resolveConflictFailed', { path }), 'error')
      }
      await loadSyncHealth().catch(() => {})
    } catch (error: unknown) {
      showSyncMessage(t('common.syncFailed', { error: getErrorMessage(error, t('settings.cloudSync.syncUnknownError')) }), 'error')
    } finally {
      setResolvingPath(null)
    }
  }

  const handlePull = async () => {
    setSyncing(true)
    showSyncMessage('', 'neutral')
    setConflicts([])
    const vaultPath = await window.api.invoke('vault:get', undefined)
    if (!vaultPath) {
      setSyncing(false)
      return
    }
    try {
      const result = await window.api.invoke('cloud:pull-all', { vaultPath })
      if (result.errors.length === 0) {
        showSyncMessage(t('settings.cloudSync.pullComplete', { pulled: result.pulled }), 'success')
      } else {
        showSyncMessage(t('common.syncFailed', { error: result.errors[0] || t('settings.cloudSync.syncUnknownError') }), 'error')
      }
    } catch (error: unknown) {
      showSyncMessage(t('common.syncFailed', { error: getErrorMessage(error, t('settings.cloudSync.syncUnknownError')) }), 'error')
    } finally {
      setSyncing(false)
      await loadSyncHealth().catch(() => {})
    }
  }

  const providerBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 56,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
    border: active ? '2px solid var(--accent)' : '1px solid var(--border-default)',
    background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
    cursor: 'pointer',
    transition: 'all 150ms',
    fontSize: 11,
    fontWeight: 500,
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <CloudSyncHealthPanel
        health={syncHealth}
        loading={syncHealthLoading || syncing}
        onRefresh={() => { void loadSyncHealth().catch(() => {}) }}
      />

      <CloudSyncBoundaryNotice />

      {/* Provider selector */}
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>{t('settings.cloudSync.providerSelectorTitle')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => switchProvider('supabase')} style={providerBtnStyle(activeProvider === 'supabase')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Supabase
          </button>
          <button onClick={() => switchProvider('icloud')} style={providerBtnStyle(activeProvider === 'icloud')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            iCloud
          </button>
          <button onClick={() => switchProvider('onedrive')} style={providerBtnStyle(activeProvider === 'onedrive')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            OneDrive
          </button>
          <button onClick={() => switchProvider('webdav')} style={providerBtnStyle(activeProvider === 'webdav')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
            WebDAV
          </button>
          <button onClick={() => switchProvider('s3')} style={providerBtnStyle(activeProvider === 's3')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg>
            S3
          </button>
        </div>
      </div>

      {/* Provider-specific config */}
      {activeProvider === 'supabase' && (
        <SupabaseConfig
          cloudConfig={cloudConfig}
          setCloudConfig={setCloudConfig}
          cloudUser={cloudUser}
          setCloudUser={setCloudUser}
          inputStyle={inputStyle}
        />
      )}

      {activeProvider === 'icloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--control-bg)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              iCloud Drive 通过文件系统同步，无需额外配置。确保已登录 iCloud 并启用 iCloud Drive。
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              路径: {icloudPath || '未检测到 iCloud Drive'}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>自定义 iCloud 同步路径（可选）</label>
            <input
              value={icloudPath || ''}
              onChange={(e) => setIcloudPath(e.target.value)}
              style={inputStyle}
              placeholder="~/Library/Mobile Documents/..."
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
            <button
              onClick={async () => { if (icloudPath) await window.api.invoke('cloud:set-icloud-path', { path: icloudPath }) }}
              style={{ marginTop: 8, height: 28, padding: '0 12px', fontSize: 11, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 5, cursor: 'pointer' }}
            >
              保存路径
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'onedrive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Application (Client) ID</label>
            <input
              value={onedriveConfig.clientId}
              onChange={(e) => setOnedriveConfig({ ...onedriveConfig, clientId: e.target.value })}
              style={inputStyle}
              placeholder="Azure AD 应用 Client ID"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>同步文件夹</label>
            <input
              value={onedriveConfig.folder}
              onChange={(e) => setOnedriveConfig({ ...onedriveConfig, folder: e.target.value })}
              style={inputStyle}
              placeholder="/Nexusky"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-onedrive-config', onedriveConfig)
                const result = await window.api.invoke('cloud:onedrive-auth', { clientId: onedriveConfig.clientId })
                if (result.success) toast('OneDrive 授权成功', 'success')
                else toast(`授权失败: ${result.error}`, 'error')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              授权登录
            </button>
            <button
              onClick={async () => { await window.api.invoke('cloud:save-onedrive-config', onedriveConfig) }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
            >
              保存配置
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'webdav' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>WebDAV URL</label>
            <input
              value={webdavConfig.url}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
              style={inputStyle}
              placeholder="https://dav.example.com/remote.php/dav/files/user"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>用户名</label>
              <input
                value={webdavConfig.username}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                style={inputStyle}
                placeholder="user"
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>密码 / App Password</label>
              <input
                type="password"
                value={webdavConfig.password}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                style={inputStyle}
                placeholder={webdavConfig.hasPassword ? '已保存，留空保留' : '••••••••'}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>远端文件夹</label>
            <input
              value={webdavConfig.folder}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, folder: e.target.value })}
              style={inputStyle}
              placeholder="/Nexusky"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-webdav-config', webdavConfig)
                toast('WebDAV 配置已保存', 'success')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              保存配置
            </button>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-webdav-config', webdavConfig)
                const result = await window.api.invoke('cloud:test-connection', { provider: 'webdav' })
                toast(result.ok ? 'WebDAV 连接成功' : `连接失败: ${result.error}`, result.ok ? 'success' : 'error')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
            >
              测试连接
            </button>
          </div>
        </div>
      )}

      {activeProvider === 's3' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Endpoint</label>
              <input
                value={s3Config.endpoint}
                onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                style={inputStyle}
                placeholder="https://s3.amazonaws.com 或 MinIO/R2 endpoint"
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Region</label>
              <input
                value={s3Config.region}
                onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                style={inputStyle}
                placeholder="us-east-1"
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Bucket</label>
              <input
                value={s3Config.bucket}
                onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                style={inputStyle}
                placeholder="nexusky-notes"
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Prefix</label>
              <input
                value={s3Config.prefix}
                onChange={(e) => setS3Config({ ...s3Config, prefix: e.target.value })}
                style={inputStyle}
                placeholder="Nexusky"
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Access Key ID</label>
              <input
                value={s3Config.accessKeyId}
                onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })}
                style={inputStyle}
                placeholder={s3Config.hasAccessKeyId ? '已保存，留空保留' : 'AKIA...'}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Secret Access Key</label>
              <input
                type="password"
                value={s3Config.secretAccessKey}
                onChange={(e) => setS3Config({ ...s3Config, secretAccessKey: e.target.value })}
                style={inputStyle}
                placeholder={s3Config.hasSecretAccessKey ? '已保存，留空保留' : '••••••••'}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-s3-config', s3Config)
                toast('S3 配置已保存', 'success')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              保存配置
            </button>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-s3-config', s3Config)
                const result = await window.api.invoke('cloud:test-connection', { provider: 's3' })
                toast(result.ok ? 'S3 连接成功' : `连接失败: ${result.error}`, result.ok ? 'success' : 'error')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
            >
              测试连接
            </button>
          </div>
        </div>
      )}

      {/* Auto sync */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>自动同步</span>
        <select
          defaultValue={safeGet('nexusky-auto-sync') || '0'}
          onChange={(e) => {
            safeSet('nexusky-auto-sync', e.target.value)
            window.dispatchEvent(new CustomEvent('sync-interval-changed'))
          }}
          style={{ height: 30, padding: '0 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }}
        >
          <option value="0">关闭</option>
          <option value="5">每 5 分钟</option>
          <option value="10">每 10 分钟</option>
          <option value="30">每 30 分钟</option>
          <option value="60">每 60 分钟</option>
        </select>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>修改后立即生效</p>
      </div>

      {/* Sync actions */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>同步操作</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 500, opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? '同步中...' : '双向同步'}
          </button>
          <button
            onClick={handlePull}
            disabled={syncing}
            style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? '拉取中...' : '从云端拉取'}
          </button>
        </div>
        {syncMsg && (
          <p style={{ marginTop: 10, fontSize: 11, color: SYNC_NOTICE_COLORS[syncMsgTone], padding: '8px 10px', borderRadius: 6, background: 'var(--control-bg)' }}>
            {syncMsg}
          </p>
        )}
        <CloudSyncConflictList
          conflicts={conflicts}
          resolvingPath={resolvingPath}
          onResolve={handleResolveConflict}
        />
      </div>
    </div>
  )
}

function SupabaseConfig({ cloudConfig, setCloudConfig, cloudUser, setCloudUser, inputStyle }: CloudTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Supabase URL</label>
        <input
          value={cloudConfig.supabaseUrl}
          onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseUrl: e.target.value })}
          style={inputStyle}
          placeholder="https://xxx.supabase.co"
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Supabase Anon Key</label>
        <input
          type="password"
          value={cloudConfig.supabaseKey}
          onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseKey: e.target.value })}
          style={inputStyle}
          placeholder={cloudConfig.hasSupabaseKey ? '已保存，留空保留' : 'eyJ...'}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--accent-text)', marginBottom: 6, fontWeight: 600 }}>Service Role Key（必填）</label>
        <input
          type="password"
          value={cloudConfig.serviceRoleKey}
          onChange={(e) => setCloudConfig({ ...cloudConfig, serviceRoleKey: e.target.value })}
          style={inputStyle}
          placeholder={cloudConfig.hasServiceRoleKey ? '已保存，留空保留' : 'eyJ... (Dashboard → Settings → API → service_role)'}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={cloudConfig.enabled}
          onChange={(e) => setCloudConfig({ ...cloudConfig, enabled: e.target.checked })}
          style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>启用 Supabase</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={async () => { await window.api.invoke('cloud:save-config', { config: cloudConfig }) }}
          style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
        >
          保存配置
        </button>
        {cloudConfig.supabaseUrl && (cloudConfig.supabaseKey || cloudConfig.hasSupabaseKey) && (
          <button
            onClick={async () => {
              await window.api.invoke('cloud:save-config', { config: cloudConfig })
              const result = await window.api.invoke('cloud:init', undefined)
              toast(result.success ? '云端初始化成功！' : `初始化失败: ${result.error}`, result.success ? 'success' : 'error')
            }}
            style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
          >
            一键初始化
          </button>
        )}
      </div>
      {cloudConfig.enabled && cloudUser && (
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, background: 'var(--control-bg)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cloudUser.email}</span>
            <button
              onClick={async () => { await window.api.invoke('cloud:sign-out', undefined); setCloudUser(null) }}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              退出
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeTab() {
  const { t } = useTranslation()
  const { theme, setTheme } = useUIStore()

  const themeMeta: Record<Theme, { swatches: [string, string, string] }> = {
    dark: { swatches: ['#1e1e1e', '#2d2d2d', '#7c6ef5'] },
    light: { swatches: ['#eceef3', '#f8f9fb', '#2f6feb'] },
    ocean: { swatches: ['#1a2332', '#243242', '#4facfe'] },
    amber: { swatches: ['#1c1a17', '#2c2820', '#f0a050'] },
    forest: { swatches: ['#1a2420', '#24332d', '#4ec9a0'] },
    rose: { swatches: ['#fffbfa', '#faf5f4', '#e8577a'] },
    minimal: { swatches: ['#1a1a1a', '#2a2a2a', '#b0b0b0'] },
    obsidian: { swatches: ['#19151f', '#2b2335', '#9f7aea'] },
    nord: { swatches: ['#2e3440', '#3b4252', '#88c0d0'] },
    solarized: { swatches: ['#fdf6e3', '#eee8d5', '#268bd2'] },
    contrast: { swatches: ['#050505', '#1a1a1a', '#ffd60a'] },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('settings.theme.choose')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('settings.theme.description')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
        {THEME_IDS.map((id) => {
          const meta = themeMeta[id]
          return (
          <button
            key={id}
            onClick={() => setTheme(id)}
            style={{
              minHeight: 104,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'space-between',
              gap: 12,
              padding: 12,
              borderRadius: 10,
              border: theme === id ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              background: theme === id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              transition: 'all 150ms',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', gap: 5 }}>
              {meta.swatches.map((color) => (
                <span key={color} style={{ flex: 1, height: 24, borderRadius: 5, background: color, border: '1px solid var(--border-subtle)' }} />
              ))}
            </div>
            <span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme === id ? 'var(--accent-text)' : 'var(--text-primary)' }}>{t(`settings.theme.items.${id}.label`)}</span>
              <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)' }}>{t(`settings.theme.items.${id}.detail`)}</span>
            </span>
          </button>
          )
        })}
      </div>
    </div>
  )
}

function AppearanceTab() {
  const { t } = useTranslation()
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [updateStage, setUpdateStage] = useState<'idle' | 'checking' | 'downloading' | 'ready'>('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [telemetryEnabled, setTelemetryEnabled] = useState(false)
  const { theme, accentColor, setAccentColor, resetAccentColor, language, setLanguage } = useUIStore()

  useEffect(() => {
    window.api.invoke('app:get-version', undefined).then(setAppVersion)
    window.api.invoke('telemetry:get-prefs', undefined).then((prefs) => setTelemetryEnabled(prefs.enabled)).catch(() => {})
  }, [])

  useEffect(() => {
    const offProgress = window.api.onUpdaterProgress((data: { percent: number }) => {
      setDownloadPercent(Math.round(data.percent || 0))
      setUpdateStage('downloading')
    })
    const offDone = window.api.onUpdaterDownloaded(() => {
      setUpdateStage('ready')
    })
    return () => { offProgress(); offDone() }
  }, [])

  if (showThemePicker) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowThemePicker(false)}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.theme.choose')}</span>
        </div>
        <ThemeTab />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>{t('settings.theme.title')}</span>
        <button
          onClick={() => setShowThemePicker(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 140, padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <span style={{ fontSize: 12 }}>{t(`settings.theme.items.${theme}.label`)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <ThemePackagesSection />

      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('settings.accent.title')}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{t('settings.accent.description')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              title={color}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                border: accentColor === color ? '2px solid var(--text-primary)' : '1px solid var(--border-default)',
                background: color,
                cursor: 'pointer',
                boxShadow: accentColor === color ? '0 0 0 3px var(--accent-muted)' : 'none'
              }}
            />
          ))}
          <input
            type="color"
            value={accentColor || '#7c6ef5'}
            onChange={(e) => setAccentColor(e.target.value)}
            aria-label={t('settings.accent.custom')}
            style={{ width: 34, height: 28, border: '1px solid var(--border-default)', borderRadius: 7, background: 'var(--bg-elevated)', padding: 2, cursor: 'pointer' }}
          />
          <button
            onClick={resetAccentColor}
            disabled={!accentColor}
            style={{ height: 28, padding: '0 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: accentColor ? 'var(--text-secondary)' : 'var(--text-tertiary)', cursor: accentColor ? 'pointer' : 'default' }}
          >
            {t('settings.accent.reset')}
          </button>
        </div>
      </div>

      <CssSnippetsSection />

      {/* Language */}
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>{t('settings.language.title')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['zh-CN', '简体中文'], ['en', 'English']] as const).map(([lang, label]) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                borderRadius: 8,
                border: language === lang ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                background: language === lang ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                color: language === lang ? 'var(--accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: language === lang ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>隐私</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={telemetryEnabled}
            onChange={async (e) => {
              const next = e.target.checked
              setTelemetryEnabled(next)
              const prefs = await window.api.invoke('telemetry:set-prefs', { enabled: next })
              setTelemetryEnabled(prefs.enabled)
            }}
            style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>发送匿名错误报告</span>
        </label>
      </div>

      {/* Version & Update */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nexusky v{appVersion || '...'}</span>
          {updateInfo && updateStage === 'idle' && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>发现新版本 v{updateInfo.version}</span>
          )}
          {updateStage === 'downloading' && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>正在下载 {downloadPercent}%</span>
          )}
          {updateStage === 'ready' && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>更新已下载，重启即可安装</span>
          )}
        </div>
        {updateStage === 'idle' && !updateInfo && (
          <button
            onClick={async () => {
              setUpdateStage('checking')
              const result = await window.api.invoke('updater:check', undefined)
              if (result.available && result.version) {
                setUpdateInfo({ version: result.version })
                setUpdateStage('idle')
              } else {
                setUpdateStage('idle')
                toast('已是最新版本', 'success')
              }
            }}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            检查更新
          </button>
        )}
        {updateStage === 'checking' && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>检查中...</span>
        )}
        {updateStage === 'idle' && updateInfo && (
          <button
            onClick={async () => {
              if (window.api.platform === 'darwin') {
                await window.api.invoke('app:open-external', { url: 'https://github.com/wobushiyoushen0214/Nexusky/releases/latest' })
              } else {
                setUpdateStage('downloading')
                setDownloadPercent(0)
                try {
                  await window.api.invoke('updater:download', undefined)
                } catch (e: unknown) {
                  toast(`下载失败: ${getErrorMessage(e)}`, 'error')
                  setUpdateStage('idle')
                }
              }
            }}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 5, color: 'var(--panel-bg)', cursor: 'pointer' }}
          >
            {window.api.platform === 'darwin' ? '前往下载' : '立即更新'}
          </button>
        )}
        {updateStage === 'ready' && (
          <button
            onClick={() => window.api.invoke('updater:install', undefined)}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 5, color: 'var(--panel-bg)', cursor: 'pointer' }}
          >
            重启安装
          </button>
        )}
      </div>
    </div>
  )
}

function ThemePackagesSection() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [themes, setThemes] = useState<ThemePackageView[]>([])
  const [loading, setLoading] = useState(false)

  const loadThemes = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const activeId = getActiveThemePackageId(vaultPath)
      const result = await loadThemePackages(vaultPath)
      setThemes(result.map((theme) => ({ ...theme, active: theme.id === activeId })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadThemes()
  }, [vaultPath])

  const activateTheme = (id: string | null) => {
    if (!vaultPath) return
    setActiveThemePackageId(vaultPath, id)
    setThemes((current) => current.map((theme) => ({ ...theme, active: theme.id === id })))
    applyThemePackage(vaultPath).catch(() => {})
    window.dispatchEvent(new CustomEvent(THEME_PACKAGES_UPDATED))
  }

  const revealThemesDir = async () => {
    if (!vaultPath) return
    await loadThemePackages(vaultPath)
    await window.api.invoke('file:reveal', { path: `${vaultPath}/.nexusky/themes` })
  }

  const hasActiveTheme = themes.some((theme) => theme.active)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{t('settings.themePackages.title')}</span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('settings.themePackages.description')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadThemes} disabled={!vaultPath || loading} style={{ height: 28, padding: '0 9px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: vaultPath && !loading ? 'pointer' : 'default' }}>
            {loading ? t('settings.themePackages.refreshing') : t('settings.themePackages.refresh')}
          </button>
          <button onClick={revealThemesDir} disabled={!vaultPath} style={{ height: 28, padding: '0 9px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--accent-text)', cursor: vaultPath ? 'pointer' : 'default' }}>
            {t('settings.themePackages.openFolder')}
          </button>
        </div>
      </div>

      {!vaultPath ? (
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-tertiary)', fontSize: 12 }}>
          {t('settings.themePackages.noVault')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: !hasActiveTheme ? 'var(--accent-muted)' : 'var(--bg-base)', cursor: 'pointer' }}>
            <span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: !hasActiveTheme ? 'var(--accent-text)' : 'var(--text-primary)' }}>{t('settings.themePackages.builtin')}</span>
              <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)' }}>{t('settings.themePackages.builtinHint')}</span>
            </span>
            <input type="radio" checked={!hasActiveTheme} onChange={() => activateTheme(null)} style={{ width: 14, height: 14, accentColor: 'var(--accent)', flexShrink: 0 }} />
          </label>

          {themes.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.6 }}>
              {t('settings.themePackages.empty')}
            </div>
          ) : themes.map((theme) => {
            const swatches = ['--bg-base', '--bg-surface', '--accent'].map((key) => theme.colors[key]).filter(Boolean)
            return (
              <label key={theme.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: theme.active ? 'var(--accent-muted)' : 'var(--bg-base)', cursor: 'pointer' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme.active ? 'var(--accent-text)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{theme.name}</span>
                    {swatches.map((color, index) => (
                      <span key={`${theme.id}-${index}`} style={{ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid var(--border-subtle)', flexShrink: 0 }} />
                    ))}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {theme.description || `.nexusky/themes/${theme.id}.json`}
                  </span>
                </span>
                <input type="radio" checked={theme.active} onChange={() => activateTheme(theme.id)} style={{ width: 14, height: 14, accentColor: 'var(--accent)', flexShrink: 0 }} />
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CssSnippetsSection() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [snippets, setSnippets] = useState<SnippetView[]>([])
  const [loading, setLoading] = useState(false)

  const loadSnippets = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const enabled = new Set(getEnabledSnippetNames(vaultPath))
      const result = await loadCssSnippets(vaultPath)
      setSnippets(result.map((snippet) => ({ ...snippet, enabled: enabled.has(snippet.name) })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSnippets()
  }, [vaultPath])

  const toggleSnippet = (name: string) => {
    if (!vaultPath) return
    setSnippets((current) => {
      const next = current.map((snippet) => snippet.name === name ? { ...snippet, enabled: !snippet.enabled } : snippet)
      setEnabledSnippetNames(vaultPath, next.filter((snippet) => snippet.enabled).map((snippet) => snippet.name))
      applyCssSnippets(vaultPath).catch(() => {})
      window.dispatchEvent(new CustomEvent(CSS_SNIPPETS_UPDATED))
      return next
    })
  }

  const revealSnippetsDir = async () => {
    if (!vaultPath) return
    await loadCssSnippets(vaultPath)
    await window.api.invoke('file:reveal', { path: `${vaultPath}/.nexusky/snippets` })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{t('settings.snippets.title')}</span>
          <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('settings.snippets.description')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadSnippets} disabled={!vaultPath || loading} style={{ height: 28, padding: '0 9px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: vaultPath && !loading ? 'pointer' : 'default' }}>
            {loading ? t('settings.snippets.refreshing') : t('settings.snippets.refresh')}
          </button>
          <button onClick={revealSnippetsDir} disabled={!vaultPath} style={{ height: 28, padding: '0 9px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--accent-text)', cursor: vaultPath ? 'pointer' : 'default' }}>
            {t('settings.snippets.openFolder')}
          </button>
        </div>
      </div>

      {!vaultPath ? (
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-tertiary)', fontSize: 12 }}>
          {t('settings.snippets.noVault')}
        </div>
      ) : snippets.length === 0 ? (
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.6 }}>
          {t('settings.snippets.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {snippets.map((snippet) => (
            <label key={snippet.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: snippet.enabled ? 'var(--accent-muted)' : 'var(--bg-base)', cursor: 'pointer' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: snippet.enabled ? 'var(--accent-text)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snippet.name}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>.nexusky/snippets/{snippet.name}.css</span>
              </span>
              <input type="checkbox" checked={snippet.enabled} onChange={() => toggleSnippet(snippet.name)} style={{ width: 14, height: 14, accentColor: 'var(--accent)', flexShrink: 0 }} />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function InlineCompletionSection() {
  const [enabled, setEnabled] = useState(() => {
    return safeGet('nexusky-ai-completion-enabled') === '1'
  })
  const [tagSuggestionEnabled, setTagSuggestionEnabled] = useState(() => {
    return safeGet('nexusky-ai-tag-suggestion-enabled') === '1'
  })

  const handleToggle = (value: boolean) => {
    setEnabled(value)
    safeSet('nexusky-ai-completion-enabled', value ? '1' : '0')
  }

  const handleTagSuggestionToggle = (value: boolean) => {
    setTagSuggestionEnabled(value)
    safeSet('nexusky-ai-tag-suggestion-enabled', value ? '1' : '0')
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
        <div>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>行内 AI 补全</span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>开启后，写作停顿时会请求当前 AI 提供商生成 ghost text。</span>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--accent)', flexShrink: 0 }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
        <div>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>保存时建议标签</span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>开启后，无标签长笔记保存时会请求 AI 生成标签建议。</span>
        </div>
        <input
          type="checkbox"
          checked={tagSuggestionEnabled}
          onChange={(e) => handleTagSuggestionToggle(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--accent)', flexShrink: 0 }}
        />
      </label>
    </div>
  )
}

function SystemPromptSection() {
  const [prompt, setPrompt] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.invoke('ai:get-system-prompt', undefined).then((p) => setPrompt(p || ''))
  }, [])

  const handleSave = async () => {
    await window.api.invoke('ai:set-system-prompt', { prompt })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>自定义系统提示词</span>
        <button
          onClick={handleSave}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: 'none', background: saved ? 'var(--success-muted)' : 'var(--accent)', color: saved ? 'var(--success)' : 'var(--text-on-accent)', cursor: 'pointer', fontWeight: 500, transition: 'all 150ms' }}
        >
          {saved ? '已保存' : '保存'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>设置 AI 对话的默认系统提示词，留空使用内置默认提示词</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="例如：你是一个专注于编程的助手，回答简洁明了..."
        rows={4}
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, lineHeight: 1.6, background: 'var(--control-bg)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
      />
    </div>
  )
}

function KeyBindingsTab() {
  const { bindings, setCustomKey, resetAll } = useKeyBindingStore()
  const [recording, setRecording] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault()
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(key)
    if (parts.length > 1) {
      setCustomKey(id, parts.join('+'))
      setRecording(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>快捷键配置</span>
        <button onClick={resetAll} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>重置全部</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {bindings.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--control-bg)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.label}</span>
            <button
              onClick={() => setRecording(b.id)}
              onKeyDown={(e) => recording === b.id && handleKeyDown(e, b.id)}
              onBlur={() => setRecording(null)}
              style={{
                minWidth: 100, height: 24, padding: '0 8px', fontSize: 11, textAlign: 'center',
                background: recording === b.id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                border: recording === b.id ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
              }}
            >
              {recording === b.id ? '按下快捷键...' : (b.customKey || b.defaultKey)}
            </button>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>点击快捷键按钮后按下新组合键即可修改。全局快捷键会立即生效。</p>
    </div>
  )
}

const PLUGIN_PERMISSION_LABELS: Record<PluginLocalPackItem['permissions'][number], string> = {
  ai_prompt: 'AI 提示',
  read_only_panel: '只读面板',
  editor_extension_declaration: '编辑器声明'
}

function pluginLocalPackRiskLabel(value: PluginLocalPackItem['riskLevel']): string {
  return value === 'medium' ? '需确认' : '低风险'
}

function pluginLocalPackSourceLabel(value: PluginLocalPackItem['source']): string {
  return value === 'bundled_local' ? '内置本地包' : value
}

function PluginsTab() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [plugins, setPlugins] = useState<LocalPlugin[]>([])
  const [localPack, setLocalPack] = useState<PluginLocalPackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  const loadPlugins = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const [result, packItems] = await Promise.all([
        window.api.invoke('plugins:list', { vaultPath }),
        window.api.invoke('plugins:get-local-pack', { vaultPath })
      ])
      setPlugins(result)
      setLocalPack(packItems)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [vaultPath])

  const revealPluginDir = async () => {
    if (!vaultPath) return
    await window.api.invoke('plugins:list', { vaultPath })
    await window.api.invoke('file:reveal', { path: `${vaultPath}/.nexusky/plugins` })
  }

  const installPlugin = async (pluginId: string) => {
    if (!vaultPath) return
    setInstalling(pluginId)
    try {
      const result = await window.api.invoke('plugins:install-local-pack', { vaultPath, pluginId })
      setPlugins(result.plugins)
      const packItems = await window.api.invoke('plugins:get-local-pack', { vaultPath })
      setLocalPack(packItems)
      toast(result.installed > 0 ? '插件已安装' : '插件已存在', result.installed > 0 ? 'success' : 'info')
    } finally {
      setInstalling(null)
    }
  }

  const installPack = async () => {
    if (!vaultPath) return
    setInstalling('__pack__')
    try {
      const result = await window.api.invoke('plugins:install-local-pack-bundle', { vaultPath })
      setPlugins(result.plugins)
      const packItems = await window.api.invoke('plugins:get-local-pack', { vaultPath })
      setLocalPack(packItems)
      toast(result.installed > 0 ? `已安装 ${result.installed} 个精选插件` : '精选插件已全部安装', result.installed > 0 ? 'success' : 'info')
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>本地内置插件包</span>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>安装内置本地插件包；不会联网下载，也不会执行任意脚本。</p>
          </div>
          <button
            onClick={installPack}
            disabled={installing === '__pack__' || localPack.every((plugin) => plugin.installed)}
            style={{ flexShrink: 0, fontSize: 11, color: 'var(--accent-text)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: installing === '__pack__' ? 'default' : 'pointer', padding: '4px 8px', borderRadius: 4, opacity: localPack.every((plugin) => plugin.installed) ? 0.6 : 1 }}
          >
            {installing === '__pack__' ? '安装中...' : '安装全部精选'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {localPack.map((plugin) => (
            <div key={plugin.id} style={{ padding: 10, borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plugin.name}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)' }}>{plugin.author} · {plugin.commands.length} commands · {plugin.panels.length} panels</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)' }}>{pluginLocalPackSourceLabel(plugin.source)} · {pluginLocalPackRiskLabel(plugin.riskLevel)}</span>
                </span>
                <button
                  onClick={() => installPlugin(plugin.id)}
                  disabled={plugin.installed || installing === plugin.id}
                  style={{ flexShrink: 0, fontSize: 10, color: plugin.installed ? 'var(--text-tertiary)' : 'var(--accent-text)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: plugin.installed ? 'default' : 'pointer', padding: '3px 7px', borderRadius: 4 }}
                >
                  {plugin.installed ? '已安装' : installing === plugin.id ? '安装中...' : '安装'}
                </button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plugin.permissions.map((permission) => (
                  <span key={permission} title={plugin.installNote} style={{ padding: '2px 5px', borderRadius: 999, border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 10 }}>{PLUGIN_PERMISSION_LABELS[permission]}</span>
                ))}
                {plugin.tags.map((tag) => (
                  <span key={tag} style={{ padding: '2px 5px', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 10 }}>{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>本地插件命令</span>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>.nexusky/plugins/*.json</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadPlugins} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>{loading ? '刷新中...' : '刷新'}</button>
          <button onClick={revealPluginDir} style={{ fontSize: 11, color: 'var(--accent-text)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>打开目录</button>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div style={{ padding: 18, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.7 }}>
          暂未发现插件。参考 docs/PLUGIN_COMMANDS.md 创建 JSON 文件后，插件声明会出现在命令面板、Slash 菜单或插件面板中。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plugins.map((plugin) => (
            <div key={plugin.id} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{plugin.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{plugin.version || plugin.id}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plugin.commands.map((command) => (
                  <div key={command.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elevated)' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{command.title}</span>
                      {command.description && <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{command.description}</span>}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--accent-text)' }}>{command.mode || 'chat'}</span>
                  </div>
                ))}
                {plugin.panels.map((panel) => (
                  <div key={panel.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elevated)' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel.title}</span>
                      {panel.description && <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel.description}</span>}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--accent-text)' }}>panel</span>
                  </div>
                ))}
                {plugin.editorExtensions.map((extension) => (
                  <div key={extension.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elevated)' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extension.title}</span>
                      {extension.description && <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extension.description}</span>}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--accent-text)' }}>{extension.kind}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelSelect({
  value,
  options,
  onChange,
  placeholder = '选择或输入',
  allowCustom = true
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  allowCustom?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [activeIndex, setActiveIndex] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) setQuery(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, value])

  const handleOpen = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      const dropHeight = Math.min(Math.max(options.length, 1) * 30 + 8, 210)
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const top = spaceBelow >= dropHeight ? rect.bottom + 4 : rect.top - dropHeight - 4
      setPos({ top, left: rect.left, width: rect.width })
    }
    setQuery('')
    setOpen(true)
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((opt) => opt.toLowerCase().includes(normalizedQuery))
    : options
  const exactMatch = options.some((opt) => opt.toLowerCase() === normalizedQuery)
  const canUseCustom = allowCustom && query.trim().length > 0 && !exactMatch

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const commitValue = (nextValue: string) => {
    const trimmed = nextValue.trim()
    if (!trimmed) return
    onChange(trimmed)
    setQuery(trimmed)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filteredOptions[activeIndex]
      if (selected && (!allowCustom || selected.toLowerCase() === normalizedQuery || !canUseCustom)) {
        commitValue(selected)
        return
      }
      if (canUseCustom) {
        commitValue(query)
        return
      }
      if (selected) commitValue(selected)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery(value)
    }
  }

  return (
    <div ref={ref}>
      <div
        style={{
          width: '100%', height: 32, padding: '0 12px', fontSize: 13,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-color 150ms',
          borderColor: open ? 'var(--accent)' : undefined,
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={handleOpen}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        />
        <svg
          onMouseDown={(e) => { e.preventDefault(); open ? setOpen(false) : handleOpen() }}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ flexShrink: 0, cursor: 'pointer', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {filteredOptions.map((opt, index) => (
            <button
              key={opt}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commitValue(opt)}
              style={{
                width: '100%', height: 30, padding: '0 12px', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                background: opt === value ? 'var(--accent-muted)' : index === activeIndex ? 'var(--bg-hover)' : 'transparent',
                color: opt === value ? 'var(--accent-text)' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 80ms',
              }}
            >
              {opt === value && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              <span style={{ marginLeft: opt === value ? 0 : 18 }}>{opt}</span>
            </button>
          ))}
          {canUseCustom && (
            <button
              onClick={() => commitValue(query)}
              style={{
                width: '100%', minHeight: 30, padding: '6px 12px', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                background: filteredOptions.length === 0 ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--accent-text)', border: 'none', borderTop: filteredOptions.length > 0 ? '1px solid var(--border-subtle)' : 'none',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              使用 “{query.trim()}”
            </button>
          )}
          {filteredOptions.length === 0 && !canUseCustom && (
            <div style={{ height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
              未找到匹配项
            </div>
          )}
        </div>
      )}
    </div>
  )
}
