import Anthropic from '@anthropic-ai/sdk'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, AIProviderConfig, ChatOptions } from './base-provider'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError } from './provider-errors'

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

    let lastErrorMessage = 'Claude request failed'

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
      } catch (error: unknown) {
        const normalized = normalizeProviderError(error)
        lastErrorMessage = normalized.message
        if (normalized.isAbort || signal?.aborted) {
          yield { type: 'done', content: '' }
          return
        }
        if (!normalized.retryable || attempt === MAX_PROVIDER_RETRIES) {
          yield { type: 'error', content: normalized.message || 'Claude request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastErrorMessage }
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
