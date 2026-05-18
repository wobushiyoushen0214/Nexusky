import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ToolCallEvent, ChatOptions } from './base-provider'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError } from './provider-errors'

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    let lastErrorMessage = 'OpenAI request failed after retries'

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
          messages: messages.map((m) => ({ role: m.role, content: m.content })) as any,
          stream: true,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        }, signal ? { signal } : undefined)

        let finishReason = 'stop'
        for await (const chunk of stream) {
          if (signal?.aborted) break
          const choice = chunk.choices[0]
          const content = choice?.delta?.content
          if (content) {
            yield { type: 'text', content }
          }
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason
          }
        }
        yield { type: 'done', content: '', meta: { finishReason } }
        return
      } catch (error: unknown) {
        const normalized = normalizeProviderError(error)
        lastErrorMessage = normalized.message
        if (normalized.isAbort || signal?.aborted) {
          yield { type: 'done', content: '' }
          return
        }
        if (!normalized.retryable || attempt === MAX_PROVIDER_RETRIES) {
          yield { type: 'error', content: normalized.message || 'OpenAI request failed' }
          return
        }
        // Will retry on next iteration
      }
    }

    // Should not reach here, but just in case
    yield { type: 'error', content: lastErrorMessage }
  }

  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: any[],
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
    let lastErrorMessage = 'OpenAI request failed after retries'

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
        const apiMessages = messages.map((m) => {
          if (m.role === 'tool') {
            return { role: 'tool' as const, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content), tool_call_id: m.tool_call_id }
          }
          if (m.role === 'assistant' && m.tool_calls) {
            return { role: 'assistant' as const, content: m.content || null, tool_calls: m.tool_calls }
          }
          return { role: m.role, content: m.content }
        })

        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: apiMessages as any,
          tools: tools.length > 0 ? tools : undefined,
          stream: true
        }, signal ? { signal } : undefined)

        let finishReason = 'stop'
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

        for await (const chunk of stream) {
          if (signal?.aborted) break
          const choice = chunk.choices[0]
          const delta = choice?.delta

          // Handle text content
          if (delta?.content) {
            yield { type: 'text', content: delta.content }
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' })
              }
              const existing = toolCalls.get(idx)!
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name = tc.function.name
              if (tc.function?.arguments) existing.arguments += tc.function.arguments
            }
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason
          }
        }

        // If there were tool calls, yield them
        if (toolCalls.size > 0) {
          const calls = Array.from(toolCalls.values())
          yield { type: 'tool_calls', calls }
          return
        }

        yield { type: 'done', content: '', meta: { finishReason } }
        return
      } catch (error: unknown) {
        const normalized = normalizeProviderError(error)
        lastErrorMessage = normalized.message
        if (normalized.isAbort || signal?.aborted) {
          yield { type: 'done', content: '' }
          return
        }
        if (!normalized.retryable || attempt === MAX_PROVIDER_RETRIES) {
          yield { type: 'error', content: normalized.message || 'OpenAI request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastErrorMessage }
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
