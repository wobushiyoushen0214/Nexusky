import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig } from './base-provider'

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })) as any,
        stream: true
      }, signal ? { signal } : undefined)

      for await (const chunk of stream) {
        if (signal?.aborted) break
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          yield { type: 'text', content }
        }
      }
      yield { type: 'done', content: '' }
    } catch (error: any) {
      if (error.name === 'AbortError' || signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      yield { type: 'error', content: error.message || 'OpenAI request failed' }
    }
  }

  async validate(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch {
      return false
    }
  }
}
