import type { AgentRunSummary, CloudSyncHealth, TrashEntry } from '@shared/types/ipc'

export type OverviewRecentTrustTone = 'neutral' | 'good' | 'warning' | 'danger' | 'accent'
export type OverviewRecentTrustKind = 'agent' | 'sync' | 'recovery'

export interface OverviewRecentTrustItem {
  id: OverviewRecentTrustKind
  tone: OverviewRecentTrustTone
  statusKey: string
  detailKey: string
  detailParams: Record<string, string | number>
  occurredAt: number | null
}

export interface OverviewRecentTrustSummary {
  items: OverviewRecentTrustItem[]
  attentionCount: number
  hasActivity: boolean
}

export function buildOverviewRecentTrust(params: {
  agentRuns: AgentRunSummary[]
  syncHealth: CloudSyncHealth | null
  trashEntries: TrashEntry[]
}): OverviewRecentTrustSummary {
  const items = [
    buildAgentTrustItem(params.agentRuns),
    buildSyncTrustItem(params.syncHealth),
    buildRecoveryTrustItem(params.trashEntries)
  ]

  return {
    items,
    attentionCount: items.filter((item) => item.tone === 'warning' || item.tone === 'danger').length,
    hasActivity: items.some((item) => item.occurredAt !== null)
  }
}

function buildAgentTrustItem(agentRuns: AgentRunSummary[]): OverviewRecentTrustItem {
  const latest = [...agentRuns].sort((a, b) => getAgentRunTime(b) - getAgentRunTime(a))[0]
  if (!latest) {
    return trustItem('agent', 'neutral', 'none', 'noneDetail', {}, null)
  }

  const occurredAt = getAgentRunTime(latest)
  const commonParams = {
    goal: truncateText(latest.goal || latest.description || 'Untitled', 64),
    current: Math.max(0, latest.currentStepIndex),
    total: Math.max(0, latest.totalSteps)
  }

  if (latest.status === 'completed') {
    return latest.dryRun
      ? trustItem('agent', 'good', 'previewed', 'previewedDetail', commonParams, occurredAt)
      : trustItem('agent', 'good', 'applied', 'appliedDetail', commonParams, occurredAt)
  }
  if (latest.status === 'failed') {
    return trustItem('agent', 'danger', 'failed', 'failedDetail', {
      ...commonParams,
      error: truncateText(latest.error || latest.resultSummary || 'Unknown error', 72)
    }, occurredAt)
  }
  if (latest.status === 'cancelled') {
    return trustItem('agent', 'warning', 'cancelled', 'cancelledDetail', commonParams, occurredAt)
  }
  if (latest.status === 'awaiting_user' || latest.status === 'paused') {
    return trustItem('agent', 'warning', 'waiting', 'waitingDetail', commonParams, occurredAt)
  }

  return trustItem('agent', 'accent', 'running', 'runningDetail', commonParams, occurredAt)
}

function buildSyncTrustItem(syncHealth: CloudSyncHealth | null): OverviewRecentTrustItem {
  if (!syncHealth) {
    return trustItem('sync', 'neutral', 'unknown', 'unknownDetail', {}, null)
  }

  const params = {
    provider: syncHealth.activeProviderName || syncHealth.activeProvider || 'Cloud',
    direction: syncHealth.lastDirection || 'sync',
    conflicts: Math.max(0, syncHealth.conflicts),
    errors: Math.max(0, syncHealth.errors),
    queued: Math.max(0, syncHealth.offlineQueueSize),
    changed: Math.max(0, syncHealth.pushed + syncHealth.pulled),
    error: truncateText(syncHealth.lastError || 'Unknown error', 72)
  }

  if (syncHealth.status === 'conflict') {
    return trustItem('sync', 'danger', 'conflict', 'conflictDetail', params, syncHealth.lastRunAt)
  }
  if (syncHealth.status === 'error') {
    return trustItem('sync', 'danger', 'error', 'errorDetail', params, syncHealth.lastRunAt)
  }
  if (syncHealth.offlineQueueSize > 0) {
    return trustItem('sync', 'warning', 'queued', 'queuedDetail', params, syncHealth.lastRunAt)
  }
  if (!syncHealth.activeProviderConfigured) {
    return trustItem('sync', 'neutral', 'notConfigured', 'notConfiguredDetail', params, syncHealth.lastRunAt)
  }
  if (syncHealth.status === 'ok') {
    return trustItem('sync', 'good', 'ok', 'okDetail', params, syncHealth.lastRunAt)
  }

  return trustItem('sync', 'neutral', 'idle', 'idleDetail', params, syncHealth.lastRunAt)
}

function buildRecoveryTrustItem(trashEntries: TrashEntry[]): OverviewRecentTrustItem {
  const latest = [...trashEntries].sort((a, b) => getTrashTime(b) - getTrashTime(a))[0]
  if (!latest) {
    return trustItem('recovery', 'neutral', 'none', 'noneDetail', { count: 0 }, null)
  }

  const params = {
    count: trashEntries.length,
    file: truncateText(latest.originalName || latest.fileName || 'Untitled', 64)
  }

  if (latest.reason === 'sync_remote_delete') {
    return trustItem('recovery', 'warning', 'remoteDelete', 'remoteDeleteDetail', params, latest.deletedAt ?? null)
  }

  return trustItem('recovery', 'good', 'recoverable', 'recoverableDetail', params, latest.deletedAt ?? null)
}

function trustItem(
  id: OverviewRecentTrustKind,
  tone: OverviewRecentTrustTone,
  statusKey: string,
  detailKey: string,
  detailParams: Record<string, string | number>,
  occurredAt: number | null
): OverviewRecentTrustItem {
  return {
    id,
    tone,
    statusKey: `overviewPage.recentTrust.${id}.status.${statusKey}`,
    detailKey: `overviewPage.recentTrust.${id}.detail.${detailKey}`,
    detailParams,
    occurredAt
  }
}

function getAgentRunTime(run: AgentRunSummary): number {
  return run.completedAt ?? run.updatedAt ?? run.startedAt ?? run.createdAt ?? 0
}

function getTrashTime(entry: TrashEntry): number {
  return entry.deletedAt ?? 0
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}
