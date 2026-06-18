import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { getRelationTypeLabel } from '../packages/renderer/src/components/long-context/LongContextBadge'
import { applyRelationFeedbackToSuggestions, getRelationFeedbackStatusKey, isSuppressiveRelationFeedback } from '../packages/renderer/src/components/long-context/relation-feedback'
import { getChatSourceProvenance } from '../packages/renderer/src/components/observability/chat-source-provenance'
import type { ChatSource, LongContextSuggestion } from '../packages/shared/src/types/ipc'

describe('long-context UI helpers', () => {
  afterEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('labels relation types compactly for the editor panel', () => {
    const t = i18n.t.bind(i18n)

    expect(getRelationTypeLabel('supports_goal', t)).toBe('目标')
    expect(getRelationTypeLabel('blocked_by', t)).toBe('阻塞')
    expect(getRelationTypeLabel('repeated_pattern', t)).toBe('模式')
  })

  it('uses English relation labels when the locale changes', async () => {
    await i18n.changeLanguage('en')
    const t = i18n.t.bind(i18n)

    expect(getRelationTypeLabel('supports_goal', t)).toBe('Goal')
    expect(getRelationTypeLabel('blocked_by', t)).toBe('Blocked')
    expect(getRelationTypeLabel('repeated_pattern', t)).toBe('Pattern')
  })

  it('exposes Context Pack reasons alongside local search provenance', () => {
    const source: ChatSource = {
      title: 'Tool Orchestration',
      filePath: 'Tool.md',
      chunk: 'Search snippet',
      score: 0.91,
      origins: ['local_search', 'context_pack'],
      explanation: 'Both notes connect AI automation with external tool orchestration.',
      evidence: ['Current note mentions AI automation', 'Tool note explains orchestration'],
      relationType: 'supports_goal',
      memoryTier: 'hot'
    }

    expect(getChatSourceProvenance(source)).toEqual({
      originLabelKey: 'citationLookup.origin.blended',
      hasContextPack: true,
      explanation: 'Both notes connect AI automation with external tool orchestration.',
      evidence: ['Current note mentions AI automation', 'Tool note explains orchestration']
    })
  })

  it('keeps relation feedback state visible and hides suppressive feedback locally', async () => {
    await i18n.changeLanguage('en')
    const suggestions: LongContextSuggestion[] = [
      {
        relationId: 'keep',
        targetType: 'note',
        targetId: 'keep-note',
        targetTitle: 'Keep',
        targetPath: 'Keep.md',
        relationType: 'supports_goal',
        confidence: 0.8,
        score: 0.7,
        reason: 'Useful context',
        evidence: [],
        lastSeenAt: 1
      },
      {
        relationId: 'hide',
        targetType: 'note',
        targetId: 'hide-note',
        targetTitle: 'Hide',
        targetPath: 'Hide.md',
        relationType: 'related_to',
        confidence: 0.7,
        score: 0.6,
        reason: 'Noisy context',
        evidence: [],
        lastSeenAt: 1
      }
    ]

    expect(isSuppressiveRelationFeedback('useful')).toBe(false)
    expect(isSuppressiveRelationFeedback('not_related')).toBe(true)
    expect(applyRelationFeedbackToSuggestions(suggestions, 'keep', 'useful')).toHaveLength(2)
    expect(applyRelationFeedbackToSuggestions(suggestions, 'hide', 'snoozed').map((item) => item.relationId)).toEqual(['keep'])
    expect(i18n.t(getRelationFeedbackStatusKey('wrong_reason'))).toBe('Lower ranked')
  })
})
