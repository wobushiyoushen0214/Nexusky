import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ChatOptions } from './base-provider'
import { net } from 'electron'

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'])
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
const NON_RETRYABLE_STATUS = new Set([401, 403, 404])
const MAX_RETRIES = 3
const BASE_DELAY = 500

interface OllamaTagsResponse {
  models?: { name?: string }[]
}

function isRetryableError(error: any): boolean {
  if (error.name === 'AbortError') return false
  if (error.code && RETRYABLE_CODES.has(error.code)) return true
  if (error.status && RETRYABLE_STATUS.has(error.status)) return true
  if (error.status && NON_RETRYABLE_STATUS.has(error.status)) return false
  if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) return true
  return false
}

function getRetryDelay(attempt: number): number {
  return BASE_DELAY * Math.pow(3, attempt)
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
    let lastError: any = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }

      if (attempt > 0) {
        yield { type: 'retry', content: `正在重试 (${attempt}/${MAX_RETRIES})...` }
        const delay = getRetryDelay(attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })) as any,
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
      } catch (error: any) {
        lastError = error
        if (error.name === 'AbortError' || signal?.aborted) {
          yield { type: 'done', content: '' }
          return
        }
        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          yield { type: 'error', content: error.message || 'Ollama 请求失败，请确认 Ollama 正在运行' }
          return
        }
      }
    }

    yield { type: 'error', content: lastError?.message || 'Ollama 请求失败' }
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
