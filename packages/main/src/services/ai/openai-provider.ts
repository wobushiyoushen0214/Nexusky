import OpenAI from 'openai'
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, AIProviderConfig, ToolCallEvent, ChatOptions, ToolDefinition, AIProviderValidationResult } from './base-provider'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError, waitForProviderRetry } from './provider-errors'

function contentToString(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

function toOpenAIContent(content: ChatMessage['content']): string | ChatCompletionContentPart[] {
  if (typeof content === 'string') return content
  return content.map((part): ChatCompletionContentPart => {
    if (part.type === 'text') return { type: 'text', text: part.text || '' }
    return { type: 'image_url', image_url: { url: part.image_url?.url || '' } }
  })
}

function toOpenAIToolCalls(toolCalls: NonNullable<ChatMessage['tool_calls']>): ChatCompletionMessageToolCall[] {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments
    }
  }))
}

function toOpenAIMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return { role: 'tool', content: contentToString(message.content), tool_call_id: message.tool_call_id || '' }
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: contentToString(message.content),
      ...(message.tool_calls && { tool_calls: toOpenAIToolCalls(message.tool_calls) })
    }
  }
  if (message.role === 'system') {
    return { role: 'system', content: contentToString(message.content) }
  }
  return { role: 'user', content: toOpenAIContent(message.content) }
}

function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters || { type: 'object', properties: {} }
    }
  }))
}

export class OpenAIProvider extends BaseAIProvider {
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
        if (!await waitForProviderRetry(delay, signal)) {
          yield { type: 'done', content: '' }
          return
        }
      }

      try {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages.map(toOpenAIMessage),
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
    tools: ToolDefinition[],
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
        if (!await waitForProviderRetry(delay, signal)) {
          yield { type: 'done', content: '' }
          return
        }
      }

      try {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
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

  async validate(): Promise<AIProviderValidationResult> {
    try {
      await this.client.models.list()
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: normalizeProviderError(error).message }
    }
  }
}
