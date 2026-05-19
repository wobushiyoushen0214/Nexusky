import { BaseAIProvider, AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent, ChatOptions, ToolDefinition, AIProviderValidationResult } from './base-provider'
import { OpenAIProvider } from './openai-provider'
import { OpenAIResponsesProvider } from './openai-responses-provider'
import { ClaudeProvider } from './claude-provider'
import { OllamaProvider } from './ollama-provider'
import { CodexCliProvider } from './codex-cli-provider'
import { store } from '../store'

class AIManager {
  private providers: Map<string, BaseAIProvider> = new Map()
  private configHashes: Map<string, string> = new Map()

  private hashConfig(config: AIProviderConfig): string {
    return `${config.type}:${config.apiKey}:${config.baseUrl}:${config.model}`
  }

  getProvider(config: AIProviderConfig): BaseAIProvider {
    const hash = this.hashConfig(config)
    const cachedHash = this.configHashes.get(config.id)
    if (cachedHash === hash) {
      const cached = this.providers.get(config.id)
      if (cached) return cached
    }

    let provider: BaseAIProvider
    switch (config.type) {
      case 'claude':
        provider = new ClaudeProvider(config)
        break
      case 'ollama':
        provider = new OllamaProvider(config)
        break
      case 'codex':
        provider = new CodexCliProvider(config)
        break
      case 'openai-responses':
        provider = new OpenAIResponsesProvider(config)
        break
      case 'openai':
      case 'custom':
      default:
        provider = new OpenAIProvider(config)
        break
    }

    this.providers.set(config.id, provider)
    this.configHashes.set(config.id, hash)
    return provider
  }

  clearCache(): void {
    this.providers.clear()
    this.configHashes.clear()
  }

  getActiveConfig(): AIProviderConfig | null {
    const configs = store.get('aiProviders') as AIProviderConfig[] | undefined
    if (!configs || configs.length === 0) return null
    const activeId = store.get('activeProviderId') as string | undefined
    let config: AIProviderConfig | undefined
    if (activeId) {
      config = configs.find((c) => c.id === activeId && c.enabled)
    }
    if (!config) {
      config = configs.find((c) => c.enabled)
    }
    return config || null
  }

  validateConfig(config: AIProviderConfig): string | null {
    const needsApiKey = config.type !== 'ollama' && config.type !== 'codex'
    if (needsApiKey && !config.apiKey) {
      return 'API Key 为空（可能是跨设备同步后解密失败），请重新配置 API Key'
    }
    if (!config.model.trim()) {
      return '模型名称为空，请填写要使用的模型'
    }
    if (config.type === 'custom' && !config.baseUrl.trim()) {
      return '自定义提供商需要填写 API Base URL'
    }
    return null
  }

  async *chat(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    const config = this.getActiveConfig()
    if (!config) {
      yield { type: 'error', content: '未配置 AI 提供商，请在设置中添加' }
      return
    }
    const configError = this.validateConfig(config)
    if (configError) {
      yield { type: 'error', content: configError }
      return
    }
    const provider = this.getProvider(config)
    yield* provider.chatStream(messages, signal, options)
  }

  async *chatWithTools(messages: ChatMessage[], tools: ToolDefinition[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
    const config = this.getActiveConfig()
    if (!config) {
      yield { type: 'error', content: '未配置 AI 提供商，请在设置中添加' }
      return
    }
    const configError = this.validateConfig(config)
    if (configError) {
      yield { type: 'error', content: configError }
      return
    }
    const provider = this.getProvider(config)
    yield* provider.chatStreamWithTools(messages, tools, signal)
  }
}

export const aiManager = new AIManager()
export type { AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent, ChatOptions, ToolDefinition, AIProviderValidationResult }
