export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatStreamEvent {
  type: 'text' | 'done' | 'error'
  content: string
}

export abstract class BaseAIProvider {
  protected config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  abstract chatStream(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent>
  abstract validate(): Promise<boolean>
}
