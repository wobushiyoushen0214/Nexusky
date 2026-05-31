import { describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { buildChatHints } from '../packages/renderer/src/components/ai/ai-command-draft'
import { buildVaultHealthAskAiDraft } from '../packages/renderer/src/components/VaultHealthScreen'
import type { VaultHealthSummary } from '../packages/shared/src/types/ipc'

const summary: VaultHealthSummary = {
  noteCount: 14,
  linkCount: 32,
  unresolvedLinkCount: 3,
  orphanCount: 2,
  openTaskCount: 5,
  duplicateTitleCount: 1,
  missingMemoryCount: 4,
  staleNoteCount: 6
}

describe('AI onboarding prompts', () => {
  it('builds a Vault Health draft that starts a sourced vault question', async () => {
    await i18n.changeLanguage('en')

    const draft = buildVaultHealthAskAiDraft(i18n.t.bind(i18n), summary)

    expect(draft.mode).toBe('chat')
    expect(draft.agentMode).toBe(true)
    expect(draft.prompt).toContain('sourced tour')
    expect(draft.prompt).toContain('cite the notes')
    expect(draft.prompt).toContain('14 notes')
    expect(draft.prompt).toContain('3 unresolved links')
  })

  it('makes the first chat empty-state hint a sourced sample question', async () => {
    await i18n.changeLanguage('en')

    const [firstHint] = buildChatHints(i18n.t.bind(i18n))

    expect(firstHint.id).toBe('cited-vault-question')
    expect(firstHint.draft?.mode).toBe('chat')
    expect(firstHint.draft?.agentMode).toBe(true)
    expect(firstHint.draft?.prompt).toContain('main themes')
    expect(firstHint.draft?.prompt).toContain('Cite the notes')
  })
})
