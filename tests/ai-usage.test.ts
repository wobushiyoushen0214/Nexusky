import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent } from '../packages/main/src/services/ai/base-provider'
import type { AIUsageRecord } from '../packages/shared/src/types/ipc'

const storeData = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../packages/main/src/services/store', () => ({
  store: {
    get: vi.fn((key: string) => storeData.get(key)),
    set: vi.fn((key: string, value: unknown) => { storeData.set(key, value) }),
    flush: vi.fn()
  }
}))

import {
  AI_USAGE_STORE_KEY,
  appendUsageRecord,
  buildAIUsageRecord,
  calculateEstimatedCostUsd,
  clearAIUsageRecords,
  estimateMessagesTokens,
  filterUsageRecords,
  summarizeUsageRecords,
  trackAIUsageStream
} from '../packages/main/src/services/ai/usage'

const config: AIProviderConfig = {
  id: 'p1',
  name: 'OpenAI',
  type: 'openai',
  baseUrl: '',
  apiKey: 'sk-test',
  model: 'gpt-4.1-mini',
  enabled: true,
  inputCostPer1MTokens: 2,
  outputCostPer1MTokens: 8
}

const messages: ChatMessage[] = [
  { role: 'system', content: 'Be concise.' },
  { role: 'user', content: 'Summarize this note.' }
]

async function* streamEvents(events: ChatStreamEvent[]): AsyncGenerator<ChatStreamEvent> {
  for (const event of events) yield event
}

async function* mixedStreamEvents(events: Array<ChatStreamEvent | ToolCallEvent>): AsyncGenerator<ChatStreamEvent | ToolCallEvent> {
  for (const event of events) yield event
}

describe('AI usage tracking', () => {
  beforeEach(() => {
    storeData.clear()
  })

  it('estimates tokens and cost when provider usage metadata is unavailable', () => {
    const record = buildAIUsageRecord({
      config,
      messages,
      outputText: 'A short answer.',
      source: 'chat',
      status: 'completed',
      startedAt: 100,
      completedAt: 200
    })

    expect(record.inputTokens).toBe(estimateMessagesTokens(messages))
    expect(record.outputTokens).toBeGreaterThan(0)
    expect(record.totalTokens).toBe(record.inputTokens + record.outputTokens)
    expect(record.estimatedCostUsd).toBe(calculateEstimatedCostUsd(record.inputTokens, record.outputTokens, config))
  })

  it('uses provider token metadata when the stream reports it', async () => {
    const events: ChatStreamEvent[] = [
      { type: 'text', content: 'hello' },
      { type: 'done', content: '', meta: { finishReason: 'stop', usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 } } }
    ]

    const collected: ChatStreamEvent[] = []
    for await (const event of trackAIUsageStream(config, messages, streamEvents(events), { source: 'chat' })) {
      collected.push(event)
    }

    const stored = storeData.get(AI_USAGE_STORE_KEY) as AIUsageRecord[]
    expect(collected).toHaveLength(2)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      providerId: 'p1',
      source: 'chat',
      status: 'completed',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      finishReason: 'stop'
    })
    expect(stored[0].estimatedCostUsd).toBe(0.006)
  })

  it('uses provider token metadata from tool-call streams', async () => {
    const events: Array<ChatStreamEvent | ToolCallEvent> = [
      {
        type: 'tool_calls',
        calls: [{ id: 'call-1', name: 'search_notes', arguments: '{"query":"x"}' }],
        meta: { usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 } }
      }
    ]

    const collected: Array<ChatStreamEvent | ToolCallEvent> = []
    for await (const event of trackAIUsageStream(config, messages, mixedStreamEvents(events), { source: 'agent' })) {
      collected.push(event)
    }

    const stored = storeData.get(AI_USAGE_STORE_KEY) as AIUsageRecord[]
    expect(collected[0].type).toBe('tool_calls')
    expect(stored[0]).toMatchObject({
      source: 'agent',
      inputTokens: 200,
      outputTokens: 40,
      totalTokens: 240
    })
    expect(stored[0].estimatedCostUsd).toBe(0.00072)
  })

  it('summarizes known and unknown costs by provider and model', () => {
    const known = buildAIUsageRecord({
      id: 'known',
      config,
      messages,
      outputText: 'known',
      source: 'chat',
      status: 'completed',
      startedAt: 100,
      completedAt: 200,
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }
    })
    const unknown = buildAIUsageRecord({
      id: 'unknown',
      config: { ...config, id: 'p2', inputCostPer1MTokens: undefined, outputCostPer1MTokens: undefined },
      messages,
      outputText: 'unknown',
      source: 'agent',
      status: 'completed',
      startedAt: 300,
      completedAt: 400,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
    })

    const summary = summarizeUsageRecords([known, unknown])
    expect(summary.records).toBe(2)
    expect(summary.totalTokens).toBe(1650)
    expect(summary.estimatedCostUsd).toBe(0.006)
    expect(summary.unknownCostRecords).toBe(1)
    expect(summary.byProvider).toHaveLength(2)
    expect(summary.byProvider[0].totalTokens).toBe(1500)
  })

  it('filters, caps, and clears stored usage records', () => {
    const one = buildAIUsageRecord({ id: 'one', config, messages, outputText: '1', source: 'chat', status: 'completed', startedAt: 10, completedAt: 10 })
    const two = buildAIUsageRecord({ id: 'two', config, messages, outputText: '2', source: 'chat', status: 'completed', startedAt: 20, completedAt: 20 })

    expect(filterUsageRecords([one, two], { since: 15 })).toEqual([two])
    expect(appendUsageRecord([one], two, 1)).toEqual([two])

    storeData.set(AI_USAGE_STORE_KEY, [one, two])
    expect(clearAIUsageRecords()).toEqual({ cleared: 2 })
    expect(storeData.get(AI_USAGE_STORE_KEY)).toEqual([])
  })
})
