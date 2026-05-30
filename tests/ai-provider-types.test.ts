import { describe, expect, expectTypeOf, it } from 'vitest'
import { BaseAIProvider, buildToolCallingUnsupportedMessage } from '../packages/main/src/services/ai/base-provider'
import type { AIProviderCapabilities, AIProviderValidationResult, ChatMessage, ChatStreamEvent, ToolDefinition } from '../packages/main/src/services/ai/base-provider'
import type { IPCChannelMap } from '../packages/shared/src/types/ipc'

describe('AI provider shared types', () => {
  it('keeps tool definitions typed for provider adapters', () => {
    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'search_notes',
          description: 'Search notes',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            },
            required: ['query']
          }
        }
      }
    ]

    expectTypeOf(tools).toMatchTypeOf<ToolDefinition[]>()
    expect(tools[0].function.name).toBe('search_notes')
  })

  it('keeps multimodal chat messages compatible with provider adapters', () => {
    const message: ChatMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'describe this image' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
      ]
    }

    expectTypeOf(message).toMatchTypeOf<ChatMessage>()
    expect(Array.isArray(message.content)).toBe(true)
  })

  it('keeps provider validation results structured for UI error messages', () => {
    const result: AIProviderValidationResult = { ok: false, error: 'invalid key' }

    expectTypeOf(result).toMatchTypeOf<AIProviderValidationResult>()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid key')
  })

  it('declares tool-calling capability and refuses unsupported tool use by default', async () => {
    class TextOnlyProvider extends BaseAIProvider {
      async *chatStream(): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'text', content: 'plain chat' }
      }
      async validate(): Promise<AIProviderValidationResult> {
        return { ok: true }
      }
    }

    const provider = new TextOnlyProvider({
      id: 'ollama',
      name: 'Ollama',
      type: 'ollama',
      baseUrl: '',
      apiKey: '',
      model: 'llama',
      enabled: true
    })
    const capabilities: AIProviderCapabilities = provider.capabilities
    const events = []
    for await (const event of provider.chatStreamWithTools([], [])) events.push(event)

    expect(capabilities.toolCalling).toBe(false)
    expect(events[0]).toEqual({
      type: 'error',
      content: buildToolCallingUnsupportedMessage({ name: 'Ollama', type: 'ollama' })
    })
  })

  it('keeps provider capabilities on renderer-safe IPC provider configs', () => {
    const provider: IPCChannelMap['ai:get-providers']['result'][number] = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4.1',
      enabled: true,
      inputCostPer1MTokens: 2,
      outputCostPer1MTokens: 8,
      hasApiKey: true,
      capabilities: { streaming: true, toolCalling: true }
    }

    expect(provider.capabilities?.toolCalling).toBe(true)
    expect(provider.inputCostPer1MTokens).toBe(2)
  })

  it('exposes AI usage IPC channels for renderer settings', () => {
    const summary: IPCChannelMap['ai:get-usage-summary']['result'] = {
      since: 100,
      records: 1,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.006,
      unknownCostRecords: 0,
      byProvider: [{
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        model: 'gpt-4.1',
        records: 1,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        estimatedCostUsd: 0.006,
        unknownCostRecords: 0
      }]
    }
    const records: IPCChannelMap['ai:list-usage-records']['result'] = [{
      id: 'usage-1',
      providerId: 'openai',
      providerName: 'OpenAI',
      providerType: 'openai',
      model: 'gpt-4.1',
      source: 'chat',
      status: 'completed',
      startedAt: 100,
      completedAt: 200,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.006
    }]
    const clearResult: IPCChannelMap['ai:clear-usage-records']['result'] = { cleared: 1 }

    expect(summary.totalTokens).toBe(1500)
    expect(records[0].source).toBe('chat')
    expect(clearResult.cleared).toBe(1)
  })

  it('exposes ai:probe-question with a discriminated union result', () => {
    type ProbeResult = IPCChannelMap['ai:probe-question']['result']
    const ok: ProbeResult = { ok: true, answer: 'hi', latencyMs: 120, model: 'gpt-4o-mini' }
    const fail: ProbeResult = { ok: false, error: 'no provider' }
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
    if (ok.ok) expect(ok.model).toBe('gpt-4o-mini')
    if (!fail.ok) expect(fail.error).toBe('no provider')
  })
})
