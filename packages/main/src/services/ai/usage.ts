import { randomUUID } from 'crypto'
import { store } from '../store'
import type {
  AICostBudget,
  AIUsageProviderSummary,
  AIUsageRecord,
  AIUsageSource,
  AIUsageStatus,
  AIUsageSummary
} from '@shared/types/ipc'
import type { AIProviderConfig, ChatMessage, ChatStreamEvent, ChatUsageMeta, ToolCallEvent } from './base-provider'

export const AI_USAGE_STORE_KEY = 'aiUsageRecords'
export const AI_USAGE_MAX_RECORDS = 1000
export const AI_COST_BUDGET_STORE_KEY = 'aiCostBudget'
export const DEFAULT_AI_COST_BUDGET: AICostBudget = { warnAtPercent: 80 }

export interface AIUsageQuery {
  since?: number
  until?: number
  limit?: number
}

export interface BuildAIUsageRecordParams {
  id?: string
  config: AIProviderConfig
  messages: ChatMessage[]
  outputText: string
  source: AIUsageSource
  status: AIUsageStatus
  startedAt: number
  completedAt: number
  finishReason?: string
  usage?: ChatUsageMeta
}

export function estimateStringTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text || '') {
    const code = ch.codePointAt(0) || 0
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFFEF)
    ) {
      cjk++
    } else {
      other++
    }
  }
  return cjk + Math.ceil(other / 4)
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const message of messages) {
    total += estimateStringTokens(message.role)
    if (typeof message.content === 'string') {
      total += estimateStringTokens(message.content)
    } else {
      total += estimateStringTokens(JSON.stringify(message.content))
    }
    if (message.tool_calls?.length) total += estimateStringTokens(JSON.stringify(message.tool_calls))
    if (message.tool_call_id) total += estimateStringTokens(message.tool_call_id)
  }
  return total
}

export function normalizeCostRate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

export function normalizeAICostBudget(value: unknown): AICostBudget {
  const item = value && typeof value === 'object' ? value as Partial<AICostBudget> : {}
  const monthlyUsd = normalizeCostRate(item.monthlyUsd)
  const warnAtPercentValue = typeof item.warnAtPercent === 'number' && Number.isFinite(item.warnAtPercent)
    ? item.warnAtPercent
    : DEFAULT_AI_COST_BUDGET.warnAtPercent
  return {
    monthlyUsd: monthlyUsd && monthlyUsd > 0 ? monthlyUsd : undefined,
    warnAtPercent: Math.max(1, Math.min(100, Math.round(warnAtPercentValue)))
  }
}

export function calculateEstimatedCostUsd(
  inputTokens: number,
  outputTokens: number,
  config: Pick<AIProviderConfig, 'inputCostPer1MTokens' | 'outputCostPer1MTokens'>
): number | null {
  const inputRate = normalizeCostRate(config.inputCostPer1MTokens)
  const outputRate = normalizeCostRate(config.outputCostPer1MTokens)
  if (inputRate === undefined || outputRate === undefined) return null
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate
}

export function buildAIUsageRecord(params: BuildAIUsageRecordParams): AIUsageRecord {
  const inputTokens = Math.max(0, Math.round(params.usage?.inputTokens ?? estimateMessagesTokens(params.messages)))
  const outputTokens = Math.max(0, Math.round(params.usage?.outputTokens ?? estimateStringTokens(params.outputText)))
  const totalTokens = Math.max(0, Math.round(params.usage?.totalTokens ?? inputTokens + outputTokens))
  const inputCostPer1MTokens = normalizeCostRate(params.config.inputCostPer1MTokens)
  const outputCostPer1MTokens = normalizeCostRate(params.config.outputCostPer1MTokens)

  return {
    id: params.id || randomUUID(),
    providerId: params.config.id,
    providerName: params.config.name || params.config.type,
    providerType: params.config.type,
    model: params.config.model,
    source: params.source,
    status: params.status,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCostPer1MTokens,
    outputCostPer1MTokens,
    estimatedCostUsd: calculateEstimatedCostUsd(inputTokens, outputTokens, params.config),
    finishReason: params.finishReason
  }
}

export function normalizeUsageRecords(value: unknown): AIUsageRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((record): record is AIUsageRecord => {
    if (!record || typeof record !== 'object') return false
    const item = record as Partial<AIUsageRecord>
    return typeof item.id === 'string' &&
      typeof item.providerId === 'string' &&
      typeof item.model === 'string' &&
      typeof item.startedAt === 'number' &&
      typeof item.completedAt === 'number' &&
      typeof item.inputTokens === 'number' &&
      typeof item.outputTokens === 'number' &&
      typeof item.totalTokens === 'number'
  })
}

export function appendUsageRecord(
  records: AIUsageRecord[],
  record: AIUsageRecord,
  limit: number = AI_USAGE_MAX_RECORDS
): AIUsageRecord[] {
  return [...records, record].slice(-Math.max(1, limit))
}

export function filterUsageRecords(records: AIUsageRecord[], query: AIUsageQuery = {}): AIUsageRecord[] {
  const since = typeof query.since === 'number' ? query.since : undefined
  const until = typeof query.until === 'number' ? query.until : undefined
  let filtered = records.filter((record) => {
    if (since !== undefined && record.completedAt < since) return false
    if (until !== undefined && record.completedAt > until) return false
    return true
  })
  if (typeof query.limit === 'number' && query.limit > 0) {
    filtered = filtered.slice(-Math.floor(query.limit))
  }
  return filtered
}

export function summarizeUsageRecords(records: AIUsageRecord[], query: AIUsageQuery = {}): AIUsageSummary {
  const filtered = filterUsageRecords(records, query)
  const byProvider = new Map<string, AIUsageProviderSummary>()
  const summary: AIUsageSummary = {
    since: query.since,
    until: query.until,
    records: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    unknownCostRecords: 0,
    byProvider: []
  }

  for (const record of filtered) {
    summary.records++
    summary.inputTokens += record.inputTokens
    summary.outputTokens += record.outputTokens
    summary.totalTokens += record.totalTokens
    if (record.estimatedCostUsd === null) {
      summary.unknownCostRecords++
    } else {
      summary.estimatedCostUsd += record.estimatedCostUsd
    }

    const key = `${record.providerId}:${record.model}`
    let provider = byProvider.get(key)
    if (!provider) {
      provider = {
        providerId: record.providerId,
        providerName: record.providerName,
        providerType: record.providerType,
        model: record.model,
        records: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        unknownCostRecords: 0
      }
      byProvider.set(key, provider)
    }
    provider.records++
    provider.inputTokens += record.inputTokens
    provider.outputTokens += record.outputTokens
    provider.totalTokens += record.totalTokens
    if (record.estimatedCostUsd === null) provider.unknownCostRecords++
    else provider.estimatedCostUsd += record.estimatedCostUsd
  }

  summary.byProvider = Array.from(byProvider.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  return summary
}

export function listAIUsageRecords(query: AIUsageQuery = {}): AIUsageRecord[] {
  return filterUsageRecords(normalizeUsageRecords(store.get(AI_USAGE_STORE_KEY)), query)
}

export function getAIUsageSummary(query: AIUsageQuery = {}): AIUsageSummary {
  return summarizeUsageRecords(normalizeUsageRecords(store.get(AI_USAGE_STORE_KEY)), query)
}

export function getAICostBudget(): AICostBudget {
  return normalizeAICostBudget(store.get(AI_COST_BUDGET_STORE_KEY))
}

export function setAICostBudget(value: AICostBudget): AICostBudget {
  const budget = normalizeAICostBudget(value)
  store.set(AI_COST_BUDGET_STORE_KEY, budget)
  return budget
}

export function clearAIUsageRecords(): { cleared: number } {
  const records = normalizeUsageRecords(store.get(AI_USAGE_STORE_KEY))
  store.set(AI_USAGE_STORE_KEY, [])
  return { cleared: records.length }
}

export function recordAIUsage(params: BuildAIUsageRecordParams): AIUsageRecord {
  const record = buildAIUsageRecord(params)
  const records = normalizeUsageRecords(store.get(AI_USAGE_STORE_KEY))
  store.set(AI_USAGE_STORE_KEY, appendUsageRecord(records, record))
  return record
}

export async function* trackAIUsageStream<T extends ChatStreamEvent | ToolCallEvent>(
  config: AIProviderConfig,
  messages: ChatMessage[],
  stream: AsyncGenerator<T>,
  options: { signal?: AbortSignal; source: AIUsageSource }
): AsyncGenerator<T> {
  const startedAt = Date.now()
  let outputText = ''
  let status: AIUsageStatus = 'completed'
  let finishReason: string | undefined
  let usage: ChatUsageMeta | undefined

  try {
    for await (const event of stream) {
      if (event.type === 'text') {
        outputText += event.content
      } else if (event.type === 'tool_calls') {
        outputText += JSON.stringify(event.calls)
        usage = event.meta?.usage
      } else if (event.type === 'error') {
        status = 'error'
      } else if (event.type === 'done') {
        finishReason = event.meta?.finishReason
        usage = event.meta?.usage
      }
      yield event
    }
  } catch (error) {
    status = options.signal?.aborted ? 'aborted' : 'error'
    throw error
  } finally {
    if (options.signal?.aborted) status = 'aborted'
    try {
      recordAIUsage({
        config,
        messages,
        outputText,
        source: options.source,
        status,
        startedAt,
        completedAt: Date.now(),
        finishReason,
        usage
      })
    } catch {
      // Usage recording must not break the provider stream.
    }
  }
}
