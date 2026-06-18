import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import type { VaultHealthScoreFactor, VaultHealthSummary } from '../packages/shared/src/types/ipc'
import {
  buildVaultHealthActionTarget,
  buildVaultHealthNextSteps,
} from '../packages/renderer/src/utils/vault-health-actions'

const t = ((key: string, params?: Record<string, unknown>) => {
  const suffix = params ? ` ${JSON.stringify(params)}` : ''
  return `${key}${suffix}`
}) as unknown as TFunction

function factor(id: VaultHealthScoreFactor['id'], impact: number): VaultHealthScoreFactor {
  return {
    id,
    impact,
    score: 100 - impact,
    weight: 10,
    issueCount: impact,
    status: impact > 10 ? 'bad' : impact > 0 ? 'warn' : 'good',
  }
}

function summary(overrides: Partial<VaultHealthSummary> = {}): VaultHealthSummary {
  return {
    noteCount: 20,
    linkCount: 40,
    unresolvedLinkCount: 0,
    orphanCount: 0,
    openTaskCount: 0,
    duplicateTitleCount: 0,
    missingMemoryCount: 0,
    staleNoteCount: 0,
    score: 82,
    scannedAt: 1_800_000_000,
    trend: [],
    scoreFactors: [
      factor('links', 0),
      factor('tasks', 0),
      factor('memory', 0),
      factor('structure', 0),
      factor('freshness', 0),
      factor('sync', 0),
    ],
    ...overrides,
  }
}

describe('vault health actions', () => {
  it('prioritizes the highest-impact health signals and keeps fallbacks available', () => {
    const steps = buildVaultHealthNextSteps(summary({
      unresolvedLinkCount: 2,
      orphanCount: 5,
      staleNoteCount: 1,
      scoreFactors: [
        factor('links', 4),
        factor('tasks', 0),
        factor('memory', 0),
        factor('structure', 12),
        factor('freshness', 2),
        factor('sync', 0),
      ],
    }))

    expect(steps.map((step) => step.id)).toEqual(['reviewStructure', 'fixLinks', 'reviewStale'])
  })

  it('builds ordinary chat drafts for repair actions', () => {
    const target = buildVaultHealthActionTarget('fixLinks', t, summary({ unresolvedLinkCount: 3 }))

    expect(target).toMatchObject({
      kind: 'chat',
      draft: {
        mode: 'chat',
        agentMode: false,
      },
    })
    if (target.kind === 'chat') {
      expect(target.draft.prompt).toContain('vaultHealth.action.fixLinks.prompt')
      expect(target.draft.prompt).toContain('"unresolved":3')
    }
  })

  it('routes isolated structure signals to graph focus', () => {
    expect(buildVaultHealthActionTarget('reviewStructure', t, summary({ orphanCount: 4 }))).toEqual({
      kind: 'graph',
      focus: 'orphans',
    })
  })

  it('uses chat review for duplicate-title structure signals without orphans', () => {
    const target = buildVaultHealthActionTarget('reviewStructure', t, summary({ duplicateTitleCount: 2 }))

    expect(target.kind).toBe('chat')
    if (target.kind === 'chat') {
      expect(target.draft.agentMode).toBe(false)
      expect(target.draft.prompt).toContain('vaultHealth.action.reviewStructure.prompt')
      expect(target.draft.prompt).toContain('"duplicates":2')
    }
  })

  it('routes browse graph without entering chat', () => {
    expect(buildVaultHealthActionTarget('browseGraph', t, summary())).toEqual({
      kind: 'graph',
      focus: 'all',
    })
  })
})
