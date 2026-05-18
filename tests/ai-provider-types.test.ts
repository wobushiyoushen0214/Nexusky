import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ChatMessage, ToolDefinition } from '../packages/main/src/services/ai/base-provider'

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
})
