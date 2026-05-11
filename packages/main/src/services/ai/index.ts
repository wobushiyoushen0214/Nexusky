import { BaseAIProvider, AIProviderConfig, ChatMessage, ChatStreamEvent } from './base-provider'
import { OpenAIProvider } from './openai-provider'
import { ClaudeProvider } from './claude-provider'
import { OllamaProvider } from './ollama-provider'
import { store } from '../store'

class AIManager {
  private providers: Map<string, BaseAIProvider> = new Map()

  getProvider(config: AIProviderConfig): BaseAIProvider {
    const cached = this.providers.get(config.id)
    if (cached) return cached

    let provider: BaseAIProvider
    switch (config.type) {
      case 'claude':
        provider = new ClaudeProvider(config)
        break
      case 'ollama':
        provider = new OllamaProvider(config)
        break
      case 'openai':
      case 'custom':
      default:
        provider = new OpenAIProvider(config)
        break
    }

    this.providers.set(config.id, provider)
    return provider
  }

  clearCache(): void {
    this.providers.clear()
  }

  getActiveConfig(): AIProviderConfig | null {
    const configs = store.get('aiProviders') as AIProviderConfig[] | undefined
    if (!configs || configs.length === 0) return null
    const activeId = store.get('activeProviderId') as string | undefined
    if (activeId) {
      const found = configs.find((c) => c.id === activeId && c.enabled)
      if (found) return found
    }
    return configs.find((c) => c.enabled) || null
  }

  async *chat(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent> {
    const config = this.getActiveConfig()
    if (!config) {
      yield { type: 'error', content: '未配置 AI 提供商，请在设置中添加' }
      return
    }
    const provider = this.getProvider(config)
    yield* provider.chatStream(messages)
  }
}

export const aiManager = new AIManager()
export type { AIProviderConfig, ChatMessage, ChatStreamEvent }
