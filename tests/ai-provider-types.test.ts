import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AIProviderValidationResult, ChatMessage, ToolDefinition } from '../packages/main/src/services/ai/base-provider'
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
