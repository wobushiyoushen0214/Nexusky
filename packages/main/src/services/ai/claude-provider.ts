import Anthropic from '@anthropic-ai/sdk'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig } from './base-provider'

export class ClaudeProvider extends BaseAIProvider {
  private client: Anthropic

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent> {
    try {
      const systemMsg = messages.find((m) => m.role === 'system')
      const chatMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const stream = this.client.messages.stream({
        model: this.config.model,
        max_tokens: 4096,
        system: systemMsg?.content || undefined,
        messages: chatMessages
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text }
        }
      }
      yield { type: 'done', content: '' }
    } catch (error: any) {
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
