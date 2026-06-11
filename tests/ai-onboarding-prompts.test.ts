import { describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { buildChatHints } from '../packages/renderer/src/components/ai/ai-command-draft'
import { buildVaultHealthAskAiDraft, buildVaultHealthNextSteps } from '../packages/renderer/src/components/VaultHealthScreen'
import type { VaultHealthScoreFactor, VaultHealthScoreFactorId, VaultHealthSummary } from '../packages/shared/src/types/ipc'

const summary: VaultHealthSummary = {
  noteCount: 14,
  linkCount: 32,
  unresolvedLinkCount: 3,
  orphanCount: 2,
  openTaskCount: 5,
  duplicateTitleCount: 1,
  missingMemoryCount: 4,
  staleNoteCount: 6,
  score: 72,
  scannedAt: 1_800_000_000,
  scoreFactors: [],
  trend: []
}

function scoreFactor(id: VaultHealthScoreFactorId, impact: number): VaultHealthScoreFactor {
  return {
    id,
    score: 100 - impact,
    weight: 10,
    impact,
    issueCount: impact,
    status: impact > 20 ? 'bad' : impact > 0 ? 'warn' : 'good'
  }
}

describe('AI onboarding prompts', () => {
  it('builds a Vault Health draft that starts a sourced vault question', async () => {
    await i18n.changeLanguage('en')

    const draft = buildVaultHealthAskAiDraft(i18n.t.bind(i18n), summary)

    expect(draft.mode).toBe('chat')
    expect(draft.agentMode).toBe(false)
    expect(draft.prompt).toContain('sourced tour')
    expect(draft.prompt).toContain('local search')
    expect(draft.prompt).not.toContain('search/tools')
    expect(draft.prompt).toContain('cite the notes')
    expect(draft.prompt).toContain('14 notes')
    expect(draft.prompt).toContain('3 unresolved links')
  })

  it('makes the first chat empty-state hint a sourced sample question', async () => {
    await i18n.changeLanguage('en')

    const [firstHint] = buildChatHints(i18n.t.bind(i18n))

    expect(firstHint.id).toBe('cited-vault-question')
    expect(firstHint.draft?.mode).toBe('chat')
    expect(firstHint.draft?.agentMode).toBe(false)
    expect(firstHint.draft?.prompt).toContain('main themes')
    expect(firstHint.draft?.prompt).toContain('Cite the notes')
  })

  it('orders Vault Health next steps by current score impact', () => {
    const steps = buildVaultHealthNextSteps({
      ...summary,
      scoreFactors: [
        scoreFactor('memory', 18),
        scoreFactor('links', 12),
        scoreFactor('tasks', 6),
        scoreFactor('structure', 4),
        scoreFactor('freshness', 1)
      ]
    })

    expect(steps.map((step) => step.id)).toEqual(['reviewMemory', 'fixLinks', 'reviewTasks'])
    expect(steps.map((step) => step.count)).toEqual([4, 3, 5])
  })

  it('keeps useful fallback actions when Vault Health has no repair signals', () => {
    const steps = buildVaultHealthNextSteps({
      ...summary,
      unresolvedLinkCount: 0,
      orphanCount: 0,
      openTaskCount: 0,
      duplicateTitleCount: 0,
      missingMemoryCount: 0,
      staleNoteCount: 0,
      scoreFactors: []
    })

    expect(steps.map((step) => step.id)).toEqual(['askAi', 'browseGraph'])
  })
})
