import { describe, expect, it } from 'vitest'
import type { AIProviderConfig, AIUsageRecord, ToolSurfaceEntry } from '../packages/shared/src/types/ipc'
import { buildOverviewUsageBoundary } from '../packages/renderer/src/components/overview/usage-boundary'

function provider(overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    model: 'gpt-4.1-mini',
    enabled: true,
    capabilities: { streaming: true, toolCalling: true },
    ...overrides
  }
}

function usage(overrides: Partial<AIUsageRecord> = {}): AIUsageRecord {
  return {
    id: 'usage-1',
    providerId: 'provider-1',
    providerName: 'OpenAI',
    providerType: 'openai',
    model: 'gpt-4.1-mini',
    source: 'chat',
    status: 'completed',
    startedAt: 1_800_000_000,
    completedAt: 1_800_000_001,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    estimatedCostUsd: 0.02,
    ...overrides
  }
}

const tools: ToolSurfaceEntry[] = [
  {
    name: 'search_notes',
    kind: 'read_only',
    category: 'note',
    labelKey: 'tool.search',
    keywords: [],
    requiresCurrentNote: false
  },
  {
    name: 'plan_knowledge_maintenance',
    kind: 'preview_write',
    category: 'maintenance',
    labelKey: 'tool.plan',
    keywords: [],
    requiresCurrentNote: false
  }
]

describe('overview usage boundary', () => {
  it('keeps local vault features available but disables AI tools without a provider', () => {
    const boundary = buildOverviewUsageBoundary({
      providers: [],
      activeProviderId: null,
      usageRecords: [],
      costBudget: { warnAtPercent: 80 },
      toolEntries: tools
    })

    expect(boundary.hasProvider).toBe(false)
    expect(boundary.vaultToolsStatus).toBe('no-provider')
    expect(boundary.budgetStatus).toBe('none')
  })

  it('does not mark Vault tools available when the active provider lacks tool calling', () => {
    const boundary = buildOverviewUsageBoundary({
      providers: [provider({ capabilities: { streaming: true, toolCalling: false } })],
      activeProviderId: 'provider-1',
      usageRecords: [usage()],
      costBudget: { warnAtPercent: 80 },
      toolEntries: tools
    })

    expect(boundary.hasProvider).toBe(true)
    expect(boundary.vaultToolsStatus).toBe('unsupported-provider')
    expect(boundary.vaultTools.previewWrite).toBe(1)
  })

  it('summarizes local providers, monthly budget, and recent cost', () => {
    const boundary = buildOverviewUsageBoundary({
      providers: [provider({ type: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' })],
      activeProviderId: 'provider-1',
      usageRecords: [usage({ totalTokens: 2_000, estimatedCostUsd: 0.5 })],
      costBudget: { monthlyUsd: 1, warnAtPercent: 75 },
      toolEntries: tools
    })

    expect(boundary.isLocalProvider).toBe(true)
    expect(boundary.totalTokens).toBe(2_000)
    expect(boundary.estimatedCostUsd).toBe(0.5)
    expect(boundary.budgetUsagePercent).toBe(50)
    expect(boundary.budgetStatus).toBe('ok')
    expect(boundary.vaultToolsStatus).toBe('available')
  })
})
