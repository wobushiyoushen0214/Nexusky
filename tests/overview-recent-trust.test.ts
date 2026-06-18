import { describe, expect, it } from 'vitest'
import type { AgentRunSummary, CloudSyncHealth, TrashEntry } from '../packages/shared/src/types/ipc'
import { buildOverviewRecentTrust } from '../packages/renderer/src/components/overview/recent-trust'

function agentRun(overrides: Partial<AgentRunSummary> = {}): AgentRunSummary {
  return {
    id: 'run-1',
    vaultPath: '/tmp/vault',
    goal: 'Repair stale notes',
    description: '',
    status: 'completed',
    plan: [],
    rationale: '',
    dryRun: true,
    currentStepIndex: 0,
    totalSteps: 2,
    resultSummary: null,
    error: null,
    createdAt: 100,
    updatedAt: 110,
    startedAt: 105,
    completedAt: 120,
    ...overrides
  }
}

function syncHealth(overrides: Partial<CloudSyncHealth> = {}): CloudSyncHealth {
  return {
    activeProvider: 'webdav',
    activeProviderName: 'WebDAV',
    activeProviderConfigured: true,
    offlineQueueSize: 0,
    status: 'ok',
    lastRunAt: 1_700_000_000_000,
    lastDirection: 'sync',
    total: 2,
    pushed: 1,
    pulled: 1,
    conflicts: 0,
    errors: 0,
    lastError: null,
    ...overrides
  }
}

function trashEntry(overrides: Partial<TrashEntry> = {}): TrashEntry {
  return {
    fileName: '1700000000000_abcd_note.md',
    originalName: 'note.md',
    originalPath: 'note.md',
    path: '/tmp/vault/.trash/1700000000000_abcd_note.md',
    deletedAt: 1_700_000_000_000,
    reason: 'vault_file_delete',
    ...overrides
  }
}

describe('overview recent trust', () => {
  it('returns explicit empty trust states without activity', () => {
    const summary = buildOverviewRecentTrust({
      agentRuns: [],
      syncHealth: null,
      trashEntries: []
    })

    expect(summary.hasActivity).toBe(false)
    expect(summary.attentionCount).toBe(0)
    expect(summary.items.map((item) => item.statusKey)).toEqual([
      'overviewPage.recentTrust.agent.status.none',
      'overviewPage.recentTrust.sync.status.unknown',
      'overviewPage.recentTrust.recovery.status.none'
    ])
  })

  it('uses the latest Agent run and distinguishes preview from applied execution', () => {
    const summary = buildOverviewRecentTrust({
      agentRuns: [
        agentRun({ id: 'old-preview', dryRun: true, completedAt: 120 }),
        agentRun({ id: 'new-apply', dryRun: false, completedAt: 180, goal: 'Apply link fixes' })
      ],
      syncHealth: syncHealth(),
      trashEntries: []
    })

    const agent = summary.items[0]
    expect(agent.statusKey).toBe('overviewPage.recentTrust.agent.status.applied')
    expect(agent.detailParams.goal).toBe('Apply link fixes')
    expect(agent.tone).toBe('good')
  })

  it('marks failed Agent runs, sync conflicts, and remote deletes for review', () => {
    const summary = buildOverviewRecentTrust({
      agentRuns: [agentRun({ status: 'failed', error: 'tool failed', completedAt: 200 })],
      syncHealth: syncHealth({ status: 'conflict', conflicts: 2 }),
      trashEntries: [trashEntry({ reason: 'sync_remote_delete', originalName: 'remote.md' })]
    })

    expect(summary.attentionCount).toBe(3)
    expect(summary.items[0].statusKey).toBe('overviewPage.recentTrust.agent.status.failed')
    expect(summary.items[1].statusKey).toBe('overviewPage.recentTrust.sync.status.conflict')
    expect(summary.items[2].statusKey).toBe('overviewPage.recentTrust.recovery.status.remoteDelete')
  })

  it('treats offline sync queue as a warning but normal trash as recoverable history', () => {
    const summary = buildOverviewRecentTrust({
      agentRuns: [],
      syncHealth: syncHealth({ offlineQueueSize: 4 }),
      trashEntries: [trashEntry({ originalName: 'draft.md' })]
    })

    expect(summary.attentionCount).toBe(1)
    expect(summary.items[1].tone).toBe('warning')
    expect(summary.items[1].detailParams.queued).toBe(4)
    expect(summary.items[2].tone).toBe('good')
    expect(summary.items[2].detailParams.file).toBe('draft.md')
  })
})
