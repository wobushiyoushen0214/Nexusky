import OpenAI from 'openai'
import type {
  EasyInputMessage,
  FunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputContent,
} from 'openai/resources/responses/responses'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatUsageMeta, AIProviderConfig, ToolCallEvent, ChatOptions, ToolDefinition, AIProviderValidationResult } from './base-provider'
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

function toResponseUsageMeta(
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null
): ChatUsageMeta | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens
  }
}

function isCodexResponsesModel(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return normalized.includes('codex') || /^gpt-5\.\d+(?:$|[-_])/.test(normalized)
}

export class OpenAIResponsesProvider extends BaseAIProvider {
  override readonly capabilities = {
    streaming: true,
    toolCalling: true
  }

  private client: OpenAI

  constructor(config: AIProviderConfig) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
  }

  private buildInput(messages: ChatMessage[]): { input: ResponseInput; instructions?: string } {
    const input: ResponseInput = []
    const instructions: string[] = []
    for (const m of messages) {
      if (m.role === 'system') {
        const content = contentToString(m.content).trim()
        if (content) instructions.push(content)
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
    return {
      input,
      instructions: instructions.length > 0 ? instructions.join('\n\n') : undefined
    }
  }

  private buildStreamingRequest(
    messages: ChatMessage[],
    options?: ChatOptions,
    tools?: FunctionTool[]
  ): ResponseCreateParamsStreaming {
    const { input, instructions } = this.buildInput(messages)
    const codexRequest = isCodexResponsesModel(this.config.model)
    const request: ResponseCreateParamsStreaming = {
      model: this.config.model,
      input,
      stream: true,
      ...(instructions !== undefined && { instructions }),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(codexRequest
        ? {
            store: false,
            include: ['reasoning.encrypted_content'],
            tool_choice: 'auto',
            parallel_tool_calls: false
          }
        : {
            ...(options?.temperature !== undefined && { temperature: options.temperature })
          })
    }
    return request
  }

  private buildValidationRequest(): ResponseCreateParamsNonStreaming {
    const { input, instructions } = this.buildInput([{ role: 'user', content: 'hi' }])
    return {
      model: this.config.model,
      input,
      max_output_tokens: 5,
      ...(instructions !== undefined && { instructions })
    }
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
        const request = this.buildStreamingRequest(messages, options)
        const stream = await this.client.responses.create(request, signal ? { signal } : undefined)

        let usage: ChatUsageMeta | undefined
        for await (const event of stream) {
          if (signal?.aborted) break
          if (event.type === 'response.output_text.delta') {
            yield { type: 'text', content: event.delta }
          } else if (event.type === 'response.completed') {
            usage = toResponseUsageMeta(event.response.usage)
            break
          }
        }
        yield { type: 'done', content: '', meta: { usage } }
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
        const responsesTools = toResponseTools(tools)
        const request = this.buildStreamingRequest(messages, undefined, responsesTools)
        const stream = await this.client.responses.create(request, signal ? { signal } : undefined)

        const toolCalls = new Map<string, { id: string; name: string; arguments: string }>()
        let usage: ChatUsageMeta | undefined

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
            usage = toResponseUsageMeta(event.response.usage)
            break
          }
        }

        if (toolCalls.size > 0) {
          yield { type: 'tool_calls', calls: Array.from(toolCalls.values()), meta: { usage } }
          return
        }

        yield { type: 'done', content: '', meta: { usage } }
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

  async validate(): Promise<AIProviderValidationResult> {
    try {
      if (isCodexResponsesModel(this.config.model)) {
        const request = this.buildStreamingRequest([{ role: 'user', content: 'hi' }])
        const stream = await this.client.responses.create(request)
        for await (const event of stream) {
          if (event.type === 'response.completed') break
        }
      } else {
        await this.client.responses.create(this.buildValidationRequest())
      }
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: normalizeProviderError(error).message }
    }
  }
}
