export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'openai-responses' | 'claude' | 'custom' | 'ollama' | 'codex'
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
  type: 'text' | 'done' | 'error' | 'retry' | 'tool_call'
  content: string
  meta?: { finishReason?: string }
}

export interface ToolCallEvent {
  type: 'tool_calls'
  calls: { id: string; name: string; arguments: string }[]
}

export abstract class BaseAIProvider {
  protected config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  abstract chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>
  abstract validate(): Promise<boolean>

  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: any[],
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
    // Default implementation: just stream without tools
    yield* this.chatStream(messages, signal)
  }
}
