import OpenAI from 'openai'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ToolCallEvent, ChatOptions } from './base-provider'

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

export class OpenAIResponsesProvider extends BaseAIProvider {
  private client: OpenAI

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  private buildInput(messages: ChatMessage[]): any[] {
    const input: any[] = []
    for (const m of messages) {
      if (m.role === 'system') {
        input.push({ role: 'developer', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
      } else if (m.role === 'assistant' && m.tool_calls) {
        input.push({ type: 'function_call', call_id: m.tool_calls[0].id, name: m.tool_calls[0].function.name, arguments: m.tool_calls[0].function.arguments })
      } else if (m.role === 'tool') {
        input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
      } else {
        input.push({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
      }
    }
    return input
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
        const input = this.buildInput(messages)
        const stream = await this.client.responses.create({
          model: this.config.model,
          input,
          stream: true,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        } as any, signal ? { signal } : undefined) as any

        for await (const event of stream) {
          if (signal?.aborted) break
          if (event.type === 'response.output_text.delta') {
            yield { type: 'text', content: event.delta }
          } else if (event.type === 'response.completed' || event.type === 'response.done') {
            break
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
          yield { type: 'error', content: error.message || 'OpenAI Responses API request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastError?.message || 'OpenAI Responses API request failed after retries' }
  }

  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: any[],
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
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
        const input = this.buildInput(messages)
        const responsesTools = tools.map((t) => ({
          type: 'function' as const,
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))

        const stream = await this.client.responses.create({
          model: this.config.model,
          input,
          tools: responsesTools.length > 0 ? responsesTools : undefined,
          stream: true
        } as any, signal ? { signal } : undefined) as any

        let textContent = ''
        const toolCalls: { id: string; name: string; arguments: string }[] = []
        let currentToolCall: { id: string; name: string; arguments: string } | null = null

        for await (const event of stream) {
          if (signal?.aborted) break

          if (event.type === 'response.output_text.delta') {
            yield { type: 'text', content: event.delta }
            textContent += event.delta
          } else if (event.type === 'response.function_call_arguments.start') {
            currentToolCall = { id: event.item_id || crypto.randomUUID(), name: event.name || '', arguments: '' }
          } else if (event.type === 'response.function_call_arguments.delta') {
            if (currentToolCall) currentToolCall.arguments += event.delta
          } else if (event.type === 'response.function_call_arguments.done') {
            if (currentToolCall) {
              toolCalls.push(currentToolCall)
              currentToolCall = null
            }
          } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
            currentToolCall = { id: event.item.call_id || crypto.randomUUID(), name: event.item.name || '', arguments: '' }
          } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
            if (currentToolCall) {
              if (event.item.arguments) currentToolCall.arguments = event.item.arguments
              toolCalls.push(currentToolCall)
              currentToolCall = null
            }
          } else if (event.type === 'response.completed' || event.type === 'response.done') {
            break
          }
        }

        if (toolCalls.length > 0) {
          yield { type: 'tool_calls', calls: toolCalls }
          return
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
          yield { type: 'error', content: error.message || 'OpenAI Responses API request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastError?.message || 'OpenAI Responses API request failed after retries' }
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
