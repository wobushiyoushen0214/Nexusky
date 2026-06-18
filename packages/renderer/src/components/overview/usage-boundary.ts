import type { AICostBudget, AIProviderConfig, AIUsageRecord, ToolSurfaceEntry } from '@shared/types/ipc'
import { summarizeVaultToolsBoundary } from '../ai/vault-tools-boundary'

export type OverviewBudgetStatus = 'none' | 'ok' | 'near' | 'over' | 'unknown'
export type OverviewVaultToolsStatus = 'available' | 'no-provider' | 'unsupported-provider' | 'empty'

export interface OverviewUsageBoundary {
  provider: AIProviderConfig | null
  hasProvider: boolean
  providerName: string | null
  providerModel: string | null
  isLocalProvider: boolean
  totalTokens: number
  estimatedCostUsd: number | null
  unknownCostRecords: number
  hasBudget: boolean
  monthlyBudgetUsd?: number
  budgetUsagePercent: number | null
  budgetWarnAtPercent: number
  budgetStatus: OverviewBudgetStatus
  vaultToolsStatus: OverviewVaultToolsStatus
  vaultTools: {
    total: number
    readOnly: number
    previewWrite: number
    agentOnly: number
  }
}

export function buildOverviewUsageBoundary(params: {
  providers: AIProviderConfig[]
  activeProviderId: string | null
  usageRecords: AIUsageRecord[]
  costBudget: AICostBudget | null
  toolEntries: ToolSurfaceEntry[]
}): OverviewUsageBoundary {
  const provider = resolveActiveProvider(params.providers, params.activeProviderId)
  const cost = summarizeUsageCost(params.usageRecords)
  const budget = params.costBudget
  const monthlyBudgetUsd = typeof budget?.monthlyUsd === 'number' && budget.monthlyUsd > 0
    ? budget.monthlyUsd
    : undefined
  const budgetWarnAtPercent = Math.max(1, Math.min(100, Math.round(budget?.warnAtPercent ?? 80)))
  const budgetUsagePercent = monthlyBudgetUsd && cost.estimatedCostUsd !== null
    ? (cost.estimatedCostUsd / monthlyBudgetUsd) * 100
    : null
  const toolSummary = summarizeVaultToolsBoundary(params.toolEntries)

  return {
    provider,
    hasProvider: Boolean(provider),
    providerName: provider?.name || provider?.type || null,
    providerModel: provider?.model || null,
    isLocalProvider: provider ? isLocalProvider(provider) : false,
    totalTokens: cost.totalTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
    unknownCostRecords: cost.unknownCostRecords,
    hasBudget: monthlyBudgetUsd !== undefined,
    monthlyBudgetUsd,
    budgetUsagePercent,
    budgetWarnAtPercent,
    budgetStatus: resolveBudgetStatus(monthlyBudgetUsd, budgetUsagePercent, budgetWarnAtPercent, cost.unknownCostRecords),
    vaultToolsStatus: resolveVaultToolsStatus(provider, toolSummary.total),
    vaultTools: toolSummary
  }
}

function resolveActiveProvider(providers: AIProviderConfig[], activeProviderId: string | null): AIProviderConfig | null {
  const active = activeProviderId
    ? providers.find((provider) => provider.id === activeProviderId && provider.enabled)
    : null
  return active ?? providers.find((provider) => provider.enabled) ?? null
}

function summarizeUsageCost(records: AIUsageRecord[]): {
  totalTokens: number
  estimatedCostUsd: number | null
  unknownCostRecords: number
} {
  let totalTokens = 0
  let estimatedCostUsd = 0
  let unknownCostRecords = 0

  for (const record of records) {
    totalTokens += Math.max(0, record.totalTokens || record.inputTokens + record.outputTokens || 0)
    if (record.estimatedCostUsd === null) {
      unknownCostRecords += 1
    } else {
      estimatedCostUsd += Math.max(0, record.estimatedCostUsd)
    }
  }

  return {
    totalTokens,
    estimatedCostUsd: unknownCostRecords === records.length && records.length > 0 ? null : estimatedCostUsd,
    unknownCostRecords
  }
}

function resolveBudgetStatus(
  monthlyBudgetUsd: number | undefined,
  usagePercent: number | null,
  warnAtPercent: number,
  unknownCostRecords: number
): OverviewBudgetStatus {
  if (!monthlyBudgetUsd) return 'none'
  if (usagePercent === null) return 'unknown'
  if (usagePercent >= 100) return 'over'
  if (unknownCostRecords > 0 || usagePercent >= warnAtPercent) return 'near'
  return 'ok'
}

function resolveVaultToolsStatus(
  provider: AIProviderConfig | null,
  toolCount: number
): OverviewVaultToolsStatus {
  if (!provider) return 'no-provider'
  if (toolCount <= 0) return 'empty'
  return provider.capabilities?.toolCalling ? 'available' : 'unsupported-provider'
}

function isLocalProvider(provider: AIProviderConfig): boolean {
  if (provider.type === 'ollama' || provider.type === 'codex') return true
  const baseUrl = provider.baseUrl.trim().toLowerCase()
  return baseUrl.startsWith('http://localhost') ||
    baseUrl.startsWith('https://localhost') ||
    baseUrl.startsWith('http://127.0.0.1') ||
    baseUrl.startsWith('https://127.0.0.1') ||
    baseUrl.startsWith('http://[::1]') ||
    baseUrl.startsWith('https://[::1]')
}
