import Anthropic from '@anthropic-ai/sdk'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, AIProviderConfig, ChatOptions, ToolCallEvent, ToolDefinition, AIProviderValidationResult } from './base-provider'
import { getProviderRetryDelay, MAX_PROVIDER_RETRIES, normalizeProviderError, waitForProviderRetry } from './provider-errors'
import { parseToolArguments } from './tool-arguments'

type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function isAnthropicImageMediaType(value: string): value is AnthropicImageMediaType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/gif' || value === 'image/webp'
}

function convertContent(content: string | ChatContentPart[]): string | Anthropic.MessageCreateParams['messages'][0]['content'] {
  if (typeof content === 'string') return content
  const blocks: Anthropic.ContentBlockParam[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      blocks.push({ type: 'text', text: part.text })
    } else if (part.type === 'image_url' && part.image_url?.url) {
      const url = part.image_url.url
      const match = url.match(/^data:(image\/\w+);base64,(.+)$/)
      if (match && isAnthropicImageMediaType(match[1])) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] }
        })
      }
    }
  }
  return blocks.length > 0 ? blocks : ''
}

function contentToString(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

function parseToolInput(argumentsJson: string): unknown {
  return parseToolArguments(argumentsJson).args
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []
  for (const message of messages) {
    if (message.role === 'system') continue

    if (message.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id || '',
          content: contentToString(message.content)
        }]
      })
      continue
    }

    if (message.role === 'assistant' && message.tool_calls) {
      const content: Anthropic.ContentBlockParam[] = []
      const text = contentToString(message.content).trim()
      if (text) content.push({ type: 'text', text })
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseToolInput(toolCall.function.arguments)
        })
      }
      result.push({ role: 'assistant', content })
      continue
    }

    result.push({
      role: message.role,
      content: convertContent(message.content)
    })
  }
  return result
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: (tool.function.parameters || { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema
  }))
}

function toFinishReason(stopReason: Anthropic.StopReason | null | undefined): string {
  return stopReason === 'max_tokens' ? 'length' : (stopReason || 'stop')
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
    const chatMessages = toAnthropicMessages(messages)

    let lastErrorMessage = 'Claude request failed'

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
        const stream = this.client.messages.stream({
          model: this.config.model,
          max_tokens: 4096,
          system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
          messages: chatMessages,
          ...(options?.temperature !== undefined && { temperature: options.temperature })
        }, signal ? { signal } : undefined)

        let finishReason = 'stop'
        for await (const event of stream) {
          if (signal?.aborted) break
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          } else if (event.type === 'message_delta') {
            finishReason = toFinishReason(event.delta.stop_reason)
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
          yield { type: 'error', content: normalized.message || 'Claude request failed' }
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
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = toAnthropicMessages(messages)
    const anthropicTools = toAnthropicTools(tools)
    let lastErrorMessage = 'Claude request failed'

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
        const stream = this.client.messages.stream({
          model: this.config.model,
          max_tokens: 4096,
          system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
          messages: chatMessages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined
        }, signal ? { signal } : undefined)

        let finishReason = 'stop'
        const toolCalls = new Map<number, { id: string; name: string; arguments: string; initialInput: unknown }>()

        for await (const event of stream) {
          if (signal?.aborted) break

          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            toolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: '',
              initialInput: event.content_block.input
            })
          } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
            const existing = toolCalls.get(event.index)
            if (existing) existing.arguments += event.delta.partial_json
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          } else if (event.type === 'message_delta') {
            finishReason = toFinishReason(event.delta.stop_reason)
          }
        }

        if (toolCalls.size > 0) {
          yield {
            type: 'tool_calls',
            calls: Array.from(toolCalls.values()).map((call) => ({
              id: call.id,
              name: call.name,
              arguments: call.arguments || JSON.stringify(call.initialInput || {})
            }))
          }
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
          yield { type: 'error', content: normalized.message || 'Claude request failed' }
          return
        }
      }
    }

    yield { type: 'error', content: lastErrorMessage }
  }

  async validate(): Promise<AIProviderValidationResult> {
    try {
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: normalizeProviderError(error).message }
    }
  }
}
