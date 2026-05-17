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
    try {
      const systemMsg = messages.find((m) => m.role === 'system')
      const chatMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: convertContent(m.content)
        }))

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
    } catch (error: any) {
      if (error.name === 'AbortError' || signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      yield { type: 'error', content: error.message || 'Claude request failed' }
    }
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
