import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { getRelationTypeLabel } from '../packages/renderer/src/components/long-context/LongContextBadge'
import { getChatSourceProvenance } from '../packages/renderer/src/components/observability/chat-source-provenance'
import type { ChatSource } from '../packages/shared/src/types/ipc'

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
})
