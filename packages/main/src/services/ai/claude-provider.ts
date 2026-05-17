import Anthropic from '@anthropic-ai/sdk'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, AIProviderConfig, ChatOptions } from './base-provider'

function convertContent(content: string | ChatContentPart[]): string | Anthropic.MessageCreateParams['messages'][0]['content'] {
  if (typeof content === 'string') return content
  const blocks: Anthropic.ContentBlockParam[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      blocks.push({ type: 'text', text: part.text })
    } else if (part.type === 'image_url' && part.image_url?.url) {
      const url = part.image_url.url
      const match = url.match(/^data:(image\/\w+);base64,(.+)$/)
      if (match) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: match[1] as any, data: match[2] }
        })
      }
    }
  }
  return blocks.length > 0 ? blocks : ''
}

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'])
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
const NON_RETRYABLE_STATUS = new Set([401, 403, 404])
const MAX_RETRIES = 3
const BASE_DELAY = 500

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

export class ClaudeProvider extends BaseAIProvider {
  private client: Anthropic

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: convertContent(m.content)
      }))

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
        const stream = this.client.messages.stream({
          model: this.config.model,
          max_tokens: 4096,
          system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
          messages: chatMessages as any,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        }, signal ? { signal } : undefined)

        for await (const event of stream) {
          if (signal?.aborted) break
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
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
          yield { type: 'error', content: error.message || 'Claude request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastError?.message || 'Claude request failed' }
  }

  async validate(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return true
    } catch {
      return false
    }
  }
}
