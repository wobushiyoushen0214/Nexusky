import { ipcMain, net } from 'electron'
import { randomUUID } from 'crypto'
import { aiManager, AIProviderConfig, resolveActiveProviderId } from '../../services/ai'
import { store } from '../../services/store'
import { listOllamaModels } from '../../services/ai/ollama-provider'
import { transcribeAudio, type TranscribeAudioParams } from '../../services/ai/transcription'
import { clearAIUsageRecords, getAICostBudget, getAIUsageSummary, listAIUsageRecords, setAICostBudget, type AIUsageQuery } from '../../services/ai/usage'
import type { AICostBudget, FetchModelsParams, FetchModelsResult } from '@shared/types/ipc'

function getStoredProviders(): AIProviderConfig[] {
  return (store.get('aiProviders') as AIProviderConfig[] | undefined) || []
}

function getStoredActiveProviderId(): string | null {
  const activeId = store.get('activeProviderId')
  return typeof activeId === 'string' && activeId.trim() ? activeId : null
}

function setStoredActiveProviderId(providerId: string | null): void {
  store.set('activeProviderId', providerId || null)
}

export function redactProviderForRenderer(config: AIProviderConfig): AIProviderConfig {
  return {
    ...config,
    apiKey: '',
    hasApiKey: !!config.apiKey,
    capabilities: aiManager.getProvider(config).capabilities
  }
}

function hydrateProviderConfig(config: AIProviderConfig): AIProviderConfig {
  if (config.apiKey) return config
  const stored = getStoredProviders().find((provider) => provider.id === config.id)
  if (!stored?.apiKey) return config
  return { ...config, apiKey: stored.apiKey }
}

function normalizeProviderForStore(config: AIProviderConfig): AIProviderConfig {
  const { hasApiKey: _hasApiKey, capabilities: _capabilities, ...rest } = config
  return {
    ...rest,
    id: rest.id,
    name: (rest.name || '').trim(),
    type: rest.type,
    baseUrl: (rest.baseUrl || '').trim(),
    apiKey: (rest.apiKey || '').trim(),
    model: (rest.model || '').trim(),
    enabled: rest.enabled === true,
    inputCostPer1MTokens: typeof rest.inputCostPer1MTokens === 'number' ? rest.inputCostPer1MTokens : undefined,
    outputCostPer1MTokens: typeof rest.outputCostPer1MTokens === 'number' ? rest.outputCostPer1MTokens : undefined
  }
}

function providerRequiresApiKey(config: Pick<AIProviderConfig, 'type'>): boolean {
  return config.type !== 'ollama' && config.type !== 'codex'
}

function mergeProviderForStore(config: AIProviderConfig, existing?: AIProviderConfig): AIProviderConfig {
  const normalized = normalizeProviderForStore(config)
  return {
    ...normalized,
    apiKey: providerRequiresApiKey(normalized)
      ? normalized.apiKey || existing?.apiKey || ''
      : normalized.apiKey
  }
}

function validateProviderForSave(config: AIProviderConfig): string | null {
  if (!config.name?.trim()) return 'Provider name is required'
  if (!config.model?.trim()) return 'Model name is required'
  if (providerRequiresApiKey(config) && !config.apiKey?.trim()) {
    return 'API Key is required for this provider type'
  }
  if (config.type === 'custom' && !config.baseUrl?.trim()) {
    return 'Base URL is required for custom providers'
  }
  return null
}

function persistProviders(providers: AIProviderConfig[], preferredActiveId?: string | null): string | null {
  const activeId = resolveActiveProviderId(providers, preferredActiveId ?? getStoredActiveProviderId())
  store.set('aiProviders', providers)
  setStoredActiveProviderId(activeId)
  aiManager.clearCache()
  return activeId
}

function getFetchModelsBaseUrl(type: AIProviderConfig['type'], baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (type === 'openai' || type === 'openai-responses') return trimmed || 'https://api.openai.com/v1'
  if (type === 'ollama') return (trimmed || 'http://localhost:11434').replace(/\/v1$/, '')
  return trimmed
}

function normalizeUsageQuery(params?: AIUsageQuery): AIUsageQuery {
  const query: AIUsageQuery = {}
  if (typeof params?.since === 'number' && Number.isFinite(params.since)) query.since = params.since
  if (typeof params?.until === 'number' && Number.isFinite(params.until)) query.until = params.until
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0) {
    query.limit = Math.floor(params.limit)
  }
  return query
}

export function mergeProviderSecretsForStore(providers: AIProviderConfig[], existingProviders: AIProviderConfig[]): AIProviderConfig[] {
  const existingById = new Map(existingProviders.map((provider) => [provider.id, provider]))
  return providers.map((provider) => {
    const existing = existingById.get(provider.id)
    return mergeProviderForStore(provider, existing)
  })
}

export function registerAiProviderHandlers(): void {
  ipcMain.handle('ai:get-providers', () => {
    return getStoredProviders().map(redactProviderForRenderer)
  })

  ipcMain.handle('ai:save-provider', (_event, params: { config: AIProviderConfig }) => {
    const providers = getStoredProviders()
    const { config } = params

    const existingIndex = config.id ? providers.findIndex((provider) => provider.id === config.id) : -1
    const existing = existingIndex >= 0 ? providers[existingIndex] : undefined
    const providerId = existing?.id || config.id || randomUUID()
    const normalized = mergeProviderForStore({ ...config, id: providerId }, existing)
    const validationError = validateProviderForSave(normalized)
    if (validationError) throw new Error(validationError)

    if (config.id && providers.some(p => p.id === config.id)) {
      providers[existingIndex] = normalized
    } else {
      providers.push(normalized)
    }

    const currentActiveId = getStoredActiveProviderId()
    const preferredActiveId = !existing && normalized.enabled ? normalized.id : currentActiveId
    persistProviders(providers, preferredActiveId)
  })

  ipcMain.handle('ai:delete-provider', (_event, params: { id: string }) => {
    const providers = getStoredProviders()
    const filtered = providers.filter(p => p.id !== params.id)

    const enabledCount = filtered.filter(p => p.enabled).length
    if (enabledCount === 0 && filtered.length > 0) {
      throw new Error('Cannot delete the last enabled provider')
    }

    persistProviders(filtered)
  })

  ipcMain.handle('ai:test-provider', async (_event, params: { config: AIProviderConfig }) => {
    const config = hydrateProviderConfig(params.config)
    const configError = aiManager.validateConfig(config)
    if (configError) return { ok: false, text: configError }

    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const provider = aiManager.getProvider(config)
      let answer = ''
      for await (const event of provider.chatStream(
        [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: 'hi' }
        ],
        controller.signal,
        { temperature: 0.2 }
      )) {
        if (event.type === 'text') answer += event.content
        if (event.type === 'error') {
          return { ok: false, text: event.content || 'Connection failed' }
        }
        if (event.type === 'done') break
      }
      const latencyMs = Date.now() - started
      if (!answer.trim()) return { ok: false, text: 'Provider returned empty response' }
      return { ok: true, text: 'Connection successful', latencyMs, model: config.model }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      if (error.includes('401') || error.includes('unauthorized')) {
        return { ok: false, text: 'Invalid API Key' }
      }
      if (error.includes('404') || error.includes('not found')) {
        return { ok: false, text: 'Model not found' }
      }
      if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
        return { ok: false, text: 'Network timeout' }
      }
      if (error.includes('ECONNREFUSED') || error.includes('ENOTFOUND')) {
        return { ok: false, text: 'Base URL unreachable' }
      }
      return { ok: false, text: error }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('ai:save-providers', (_event, params: { providers: AIProviderConfig[] }) => {
    persistProviders(mergeProviderSecretsForStore(params.providers, getStoredProviders()))
  })

  ipcMain.handle('ai:set-active', (_event, params: { providerId: string }) => {
    const providers = getStoredProviders()
    const providerIndex = providers.findIndex((provider) => provider.id === params.providerId)
    if (providerIndex < 0) throw new Error('Provider not found')
    if (!providers[providerIndex].enabled) {
      providers[providerIndex] = normalizeProviderForStore({ ...providers[providerIndex], enabled: true })
      store.set('aiProviders', providers)
    }
    setStoredActiveProviderId(params.providerId)
    aiManager.clearCache()
  })

  ipcMain.handle('ai:get-active-provider', () => {
    const providers = getStoredProviders()
    const activeId = resolveActiveProviderId(providers, getStoredActiveProviderId())
    if (activeId !== getStoredActiveProviderId()) setStoredActiveProviderId(activeId)
    return activeId
  })

  ipcMain.handle('ai:get-usage-summary', (_event, params: AIUsageQuery) => {
    return getAIUsageSummary(normalizeUsageQuery(params))
  })

  ipcMain.handle('ai:list-usage-records', (_event, params: AIUsageQuery) => {
    return listAIUsageRecords(normalizeUsageQuery(params))
  })

  ipcMain.handle('ai:clear-usage-records', () => {
    return clearAIUsageRecords()
  })

  ipcMain.handle('ai:get-cost-budget', () => {
    return getAICostBudget()
  })

  ipcMain.handle('ai:set-cost-budget', (_event, params: AICostBudget) => {
    return setAICostBudget(params)
  })

  ipcMain.handle('ai:validate', async (_event, params: { config: AIProviderConfig }) => {
    const config = hydrateProviderConfig(params.config)
    const configError = aiManager.validateConfig(config)
    if (configError) return { ok: false, error: configError }
    const provider = aiManager.getProvider(config)
    return provider.validate()
  })

  ipcMain.handle('ai:probe-question', async (_event, params: { config?: AIProviderConfig; question?: string }) => {
    const config = params.config ? hydrateProviderConfig(params.config) : aiManager.getActiveConfig()
    if (!config) return { ok: false as const, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { ok: false as const, error: configError }
    const provider = aiManager.getProvider(config)
    const prompt = (params.question ?? '').trim() ||
      '用一句话介绍你自己，并解释你能在 Nexusky 中帮助知识管理者做什么。'
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      let answer = ''
      for await (const event of provider.chatStream(
        [
          { role: 'system', content: '你是 Nexusky 内置的 AI 助手，回答简洁友好。' },
          { role: 'user', content: prompt }
        ],
        controller.signal,
        { temperature: 0.2 }
      )) {
        if (event.type === 'text') answer += event.content
        if (event.type === 'error') {
          return { ok: false as const, error: event.content || 'AI 调用失败' }
        }
        if (event.type === 'done') break
      }
      const latencyMs = Date.now() - started
      const trimmed = answer.trim()
      if (!trimmed) return { ok: false as const, error: '提供商返回了空回答' }
      return { ok: true as const, answer: trimmed, latencyMs, model: config.model }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('ai:transcribe', async (_event, params: TranscribeAudioParams) => {
    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError }
    return transcribeAudio(config, params)
  })

  ipcMain.handle('ai:detect-local-config', async () => {
    const { homedir, platform } = require('os')
    const { readFileSync, existsSync } = require('fs')
    const { join } = require('path')
    const home = homedir()
    const os = platform()
    const detected: { claude?: { apiKey: string; baseUrl: string; source?: string }; openai?: { apiKey: string; source?: string }; codex?: { command: string; source?: string }; skipped?: string[] } = { skipped: [] }
    const isUsableOpenAIKey = (key: unknown) => typeof key === 'string' && /^sk-[A-Za-z0-9_-]+/.test(key.trim())

    const claudePaths = [
      join(home, '.claude', 'settings.json'),
      ...(os === 'win32' ? [join(process.env.APPDATA || '', 'claude', 'settings.json')] : []),
      ...(os === 'linux' ? [join(home, '.config', 'claude', 'settings.json')] : []),
    ]
    for (const p of claudePaths) {
      if (!existsSync(p)) continue
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        const env = data.env || {}
        if (env.ANTHROPIC_AUTH_TOKEN) {
          detected.claude = { apiKey: env.ANTHROPIC_AUTH_TOKEN, baseUrl: env.ANTHROPIC_BASE_URL || '', source: 'Claude Code' }
          break
        }
      } catch {}
    }

    if (isUsableOpenAIKey(process.env.OPENAI_API_KEY)) {
      detected.openai = { apiKey: process.env.OPENAI_API_KEY!.trim(), source: '环境变量 OPENAI_API_KEY' }
    }

    const codexPaths = [
      join(home, '.codex', 'auth.json'),
      ...(os === 'win32' ? [join(process.env.APPDATA || '', 'codex', 'auth.json')] : []),
      ...(os === 'linux' ? [join(home, '.config', 'codex', 'auth.json')] : []),
    ]
    for (const p of codexPaths) {
      if (!existsSync(p)) continue
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        if (!detected.openai && isUsableOpenAIKey(data.OPENAI_API_KEY)) {
          detected.openai = { apiKey: data.OPENAI_API_KEY.trim(), source: 'Codex API Key' }
        }
        if (data.auth_mode === 'chatgpt' && data.tokens) {
          detected.codex = { command: 'codex', source: 'Codex ChatGPT 登录' }
        } else if (data.OPENAI_API_KEY && !isUsableOpenAIKey(data.OPENAI_API_KEY)) {
          detected.skipped?.push('Codex 中的 OpenAI Key 格式不符合 API Key 要求，已跳过')
        }
      } catch {}
    }

    if (!detected.claude && process.env.ANTHROPIC_API_KEY) {
      detected.claude = { apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: process.env.ANTHROPIC_BASE_URL || '', source: '环境变量 ANTHROPIC_API_KEY' }
    }

    const existing = getStoredProviders()
    const next = [...existing]
    let importable = 0
    let imported = 0
    let existingCount = 0

    const addIfMissing = (provider: AIProviderConfig, exists: (candidate: AIProviderConfig) => boolean) => {
      importable++
      if (next.some(exists)) {
        existingCount++
        return
      }
      next.push(provider)
      imported++
    }

    if (detected.claude) {
      const hasCustomBase = !!detected.claude.baseUrl
      addIfMissing({
        id: randomUUID(),
        name: hasCustomBase ? 'Claude 中转站 (本地检测)' : 'Claude (本地检测)',
        type: hasCustomBase ? 'custom' : 'claude',
        baseUrl: hasCustomBase ? `${detected.claude.baseUrl.replace(/\/+$/, '')}/v1` : '',
        apiKey: detected.claude.apiKey,
        model: 'claude-sonnet-4-6',
        enabled: true
      }, (candidate) => candidate.apiKey === detected.claude!.apiKey)
    }

    if (detected.openai) {
      addIfMissing({
        id: randomUUID(),
        name: 'OpenAI (本地检测)',
        type: 'openai',
        baseUrl: '',
        apiKey: detected.openai.apiKey,
        model: 'gpt-4.1-mini',
        enabled: true
      }, (candidate) => candidate.apiKey === detected.openai!.apiKey)
    }

    if (detected.codex) {
      addIfMissing({
        id: randomUUID(),
        name: 'Codex CLI (本地登录)',
        type: 'codex',
        baseUrl: detected.codex.command,
        apiKey: '',
        model: 'gpt-5.4',
        enabled: true
      }, (candidate) => candidate.type === 'codex' && (candidate.baseUrl || 'codex') === detected.codex!.command)
    }

    if (imported > 0) {
      persistProviders(next, getStoredActiveProviderId() || next.find((provider) => provider.enabled)?.id || null)
    }

    return {
      importable,
      imported,
      existing: existingCount,
      skipped: detected.skipped && detected.skipped.length > 0 ? detected.skipped : undefined
    }
  })

  ipcMain.handle('ai:list-ollama-models', async (_event, params: { baseUrl?: string }) => {
    return listOllamaModels(params.baseUrl)
  })

  ipcMain.handle('ai:get-system-prompt', () => {
    return (store.get('aiSystemPrompt') as string) || ''
  })

  ipcMain.handle('ai:set-system-prompt', (_event, params: { prompt: string }) => {
    store.set('aiSystemPrompt', params.prompt)
  })

  ipcMain.handle('ai:fetch-models', async (_event, params: FetchModelsParams): Promise<FetchModelsResult> => {
    try {
      const stored = params.providerId ? getStoredProviders().find((provider) => provider.id === params.providerId) : undefined
      const apiKey = params.apiKey || stored?.apiKey || ''
      const baseUrl = getFetchModelsBaseUrl(params.type, params.baseUrl || stored?.baseUrl || '')

      if (params.type === 'claude') {
        return {
          ok: true,
          models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001']
        }
      }

      if (params.type === 'ollama') {
        const models = await listOllamaModels(baseUrl)
        return { ok: true, models }
      }

      if (!apiKey) return { ok: false, models: [], error: 'API Key 为空' }
      if (!baseUrl) return { ok: false, models: [], error: 'Base URL 为空' }

      const endpoints = [`${baseUrl}/models`, `${baseUrl}/v1/models`]

      for (const url of endpoints) {
        let timeout: ReturnType<typeof setTimeout> | null = null
        try {
          const controller = new AbortController()
          timeout = setTimeout(() => controller.abort(), 30_000)

          const response = await net.fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: controller.signal
          })

          clearTimeout(timeout)
          timeout = null

          if (response.status === 401) {
            return { ok: false, models: [], error: 'API Key 无效' }
          }

          if (!response.ok) continue

          const data = await response.json() as { data?: { id?: string }[] }
          const models = (data.data || [])
            .map(m => m.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

          return { ok: true, models }
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            return { ok: false, models: [], error: '请求超时' }
          }
          continue
        } finally {
          if (timeout) clearTimeout(timeout)
        }
      }

      return { ok: false, models: [], error: '网络错误' }
    } catch (e) {
      return { ok: false, models: [], error: e instanceof Error ? e.message : '网络错误' }
    }
  })
}
