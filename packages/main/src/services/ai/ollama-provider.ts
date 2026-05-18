import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ChatOptions } from './base-provider'
import { net } from 'electron'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError } from './provider-errors'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

interface OllamaTagsResponse {
  models?: { name?: string }[]
}

function toOllamaMessage(message: ChatMessage): ChatCompletionMessageParam {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
  if (message.role === 'tool') {
    return { role: 'tool', content, tool_call_id: message.tool_call_id || '' }
  }
  if (message.role === 'assistant') return { role: 'assistant', content }
  if (message.role === 'system') return { role: 'system', content }
  return { role: 'user', content }
}

export class OllamaProvider extends BaseAIProvider {
  private client: OpenAI

  constructor(config: AIProviderConfig) {
    super(config)
    const baseUrl = config.baseUrl || 'http://localhost:11434/v1'
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: baseUrl
    })
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    let lastErrorMessage = 'Ollama 请求失败'

    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }

      if (attempt > 0) {
        yield { type: 'retry', content: `正在重试 (${attempt}/${MAX_PROVIDER_RETRIES})...` }
        const delay = getProviderRetryDelay(attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages.map(toOllamaMessage),
          stream: true,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        }, signal ? { signal } : undefined)

        for await (const chunk of stream) {
          if (signal?.aborted) break
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            yield { type: 'text', content }
          }
        }
        yield { type: 'done', content: '' }
        return
      } catch (error: unknown) {
        const normalized = normalizeProviderError(error)
        lastErrorMessage = normalized.message
        if (normalized.isAbort || signal?.aborted) {
          yield { type: 'done', content: '' }
          return
        }
        if (!normalized.retryable || attempt === MAX_PROVIDER_RETRIES) {
          yield { type: 'error', content: normalized.message || 'Ollama 请求失败，请确认 Ollama 正在运行' }
          return
        }
      }
    }

    yield { type: 'error', content: lastErrorMessage }
  }

  async validate(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl || 'http://localhost:11434'
      const response = await net.fetch(`${baseUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }
}

export async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  try {
    const url = baseUrl || 'http://localhost:11434'
    const response = await net.fetch(`${url}/api/tags`)
    if (!response.ok) return []
    const data = await response.json() as OllamaTagsResponse
    return (data.models || [])
      .map((model) => model.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
  } catch {
    return []
  }
}
