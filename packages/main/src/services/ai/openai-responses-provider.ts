import OpenAI from 'openai'
import type {
  EasyInputMessage,
  FunctionTool,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputContent,
} from 'openai/resources/responses/responses'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ToolCallEvent, ChatOptions, ToolDefinition } from './base-provider'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError, waitForProviderRetry } from './provider-errors'

function contentToString(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

function toResponseContent(content: ChatMessage['content']): string | ResponseInputContent[] {
  if (typeof content === 'string') return content
  return content.map((part): ResponseInputContent => {
    if (part.type === 'text') return { type: 'input_text', text: part.text || '' }
    return { type: 'input_image', image_url: part.image_url?.url || '', detail: 'auto' }
  })
}

function toResponseTools(tools: ToolDefinition[]): FunctionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters || { type: 'object', properties: {} },
    strict: null
  }))
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

  private buildInput(messages: ChatMessage[]): ResponseInput {
    const input: ResponseInput = []
    for (const m of messages) {
      if (m.role === 'system') {
        input.push({ role: 'developer', content: contentToString(m.content) } satisfies EasyInputMessage)
      } else if (m.role === 'assistant' && m.tool_calls) {
        input.push(...m.tool_calls.map((toolCall): ResponseFunctionToolCall => ({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        })))
      } else if (m.role === 'tool') {
        input.push({ type: 'function_call_output', call_id: m.tool_call_id || '', output: contentToString(m.content) })
      } else {
        input.push({ role: m.role, content: toResponseContent(m.content) } satisfies EasyInputMessage)
      }
    }
    return input
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    let lastErrorMessage = 'OpenAI Responses API request failed after retries'

    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }

      if (attempt > 0) {
        yield { type: 'retry', content: `正在重试 (${attempt}/${MAX_PROVIDER_RETRIES})...` }
        const delay = getProviderRetryDelay(attempt - 1)
        if (!await waitForProviderRetry(delay, signal)) {
          yield { type: 'done', content: '' }
          return
        }
      }

      try {
        const input = this.buildInput(messages)
        const request: ResponseCreateParamsStreaming = {
          model: this.config.model,
          input,
          stream: true,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        }
        const stream = await this.client.responses.create(request, signal ? { signal } : undefined)

        for await (const event of stream) {
          if (signal?.aborted) break
          if (event.type === 'response.output_text.delta') {
            yield { type: 'text', content: event.delta }
          } else if (event.type === 'response.completed') {
            break
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
          yield { type: 'error', content: normalized.message || 'OpenAI Responses API request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastErrorMessage }
  }

  async *chatStreamWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
    let lastErrorMessage = 'OpenAI Responses API request failed after retries'

    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }

      if (attempt > 0) {
        yield { type: 'retry', content: `正在重试 (${attempt}/${MAX_PROVIDER_RETRIES})...` }
        const delay = getProviderRetryDelay(attempt - 1)
        if (!await waitForProviderRetry(delay, signal)) {
          yield { type: 'done', content: '' }
          return
        }
      }

      try {
        const input = this.buildInput(messages)
        const responsesTools = toResponseTools(tools)

        const request: ResponseCreateParamsStreaming = {
          model: this.config.model,
          input,
          tools: responsesTools.length > 0 ? responsesTools : undefined,
          stream: true
        }
        const stream = await this.client.responses.create(request, signal ? { signal } : undefined)

        const toolCalls = new Map<string, { id: string; name: string; arguments: string }>()

        for await (const event of stream) {
          if (signal?.aborted) break

          if (event.type === 'response.output_text.delta') {
            yield { type: 'text', content: event.delta }
          } else if (event.type === 'response.function_call_arguments.delta') {
            const existing = toolCalls.get(event.item_id) || { id: event.item_id, name: '', arguments: '' }
            existing.arguments += event.delta
            toolCalls.set(event.item_id, existing)
          } else if (event.type === 'response.function_call_arguments.done') {
            toolCalls.set(event.item_id, { id: event.item_id, name: event.name, arguments: event.arguments })
          } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
            toolCalls.set(event.item.id || event.item.call_id, {
              id: event.item.call_id,
              name: event.item.name,
              arguments: event.item.arguments || ''
            })
          } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
            toolCalls.set(event.item.id || event.item.call_id, {
              id: event.item.call_id,
              name: event.item.name,
              arguments: event.item.arguments || ''
            })
          } else if (event.type === 'response.completed') {
            break
          }
        }

        if (toolCalls.size > 0) {
          yield { type: 'tool_calls', calls: Array.from(toolCalls.values()) }
          return
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
          yield { type: 'error', content: normalized.message || 'OpenAI Responses API request failed' }
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
