export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'openai-responses' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  hasApiKey?: boolean
  capabilities?: AIProviderCapabilities
}

export interface AIProviderCapabilities {
  streaming: boolean
  toolCalling: boolean
}

export interface AIProviderValidationResult {
  ok: boolean
  error?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ChatContentPart[]
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
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

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: { [key: string]: unknown }
  }
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
}

export abstract class BaseAIProvider {
  readonly capabilities: AIProviderCapabilities = {
    streaming: true,
    toolCalling: false
  }

  protected config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  abstract chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent>
  abstract validate(): Promise<AIProviderValidationResult>

  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
    void messages
    void tools
    void signal
    yield { type: 'error', content: buildToolCallingUnsupportedMessage(this.config) }
  }
}

export function buildToolCallingUnsupportedMessage(config: Pick<AIProviderConfig, 'name' | 'type'>): string {
  const providerName = config.name || config.type
  return `${providerName} 不支持 Agent 工具调用。请切换到 OpenAI、OpenAI Responses、Claude 或兼容工具调用的提供商后再使用 Agent 模式。`
}
