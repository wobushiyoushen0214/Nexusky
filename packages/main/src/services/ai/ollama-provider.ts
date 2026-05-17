import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ChatOptions } from './base-provider'
import { net } from 'electron'

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
    } catch (error: any) {
      if (error.name === 'AbortError' || signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      yield { type: 'error', content: error.message || 'Ollama 请求失败，请确认 Ollama 正在运行' }
    }
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
    const data = await response.json() as any
    return (data.models || []).map((m: any) => m.name)
  } catch {
    return []
  }
}
