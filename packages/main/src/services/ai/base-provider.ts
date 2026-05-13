export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ChatContentPart[]
}

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
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

  abstract chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>
  abstract validate(): Promise<boolean>
}
