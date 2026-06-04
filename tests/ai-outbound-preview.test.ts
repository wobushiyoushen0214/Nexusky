import { describe, expect, it } from 'vitest'
import {
  buildAIOutboundPreview,
  extractAttachmentSnippetsFromText,
  extractUserPromptText
} from '../packages/main/src/services/ai/outbound-preview'
import type { AIProviderConfig } from '../packages/main/src/services/ai/base-provider'
import type { LongContextPack } from '../packages/main/src/services/long-context/context-pack-builder'

const provider: AIProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  type: 'openai',
  baseUrl: '',
  apiKey: 'sk-test',
  model: 'gpt-4.1',
  enabled: true
}

describe('AI outbound preview', () => {
  it('extracts attachment snippets and the final user prompt from chat attachment context', () => {
    const text = `以下是参考笔记内容：

[笔记: Alpha]
Alpha note body.

[选中片段: Current]
Selected paragraph.

用户问题：怎么总结这些材料？`

    expect(extractUserPromptText(text)).toBe('怎么总结这些材料？')
    expect(extractAttachmentSnippetsFromText(text)).toMatchObject([
      { kind: 'attachment', title: 'Alpha', preview: 'Alpha note body.' },
      { kind: 'attachment', title: 'Current', preview: 'Selected paragraph.' }
    ])
  })

  it('summarizes provider, retrieved notes, long-context, and attachments without exposing secrets', () => {
    const pack: LongContextPack = {
      tokenBudget: 400,
      estimatedTokens: 42,
      hot: [{
        tier: 'hot',
        title: 'Tool Orchestration',
        source: 'Tool.md',
        relationType: 'supports_goal',
        confidence: 0.82,
        score: 0.74,
        reason: 'Related automation context.',
        evidence: ['Current note mentions tools.']
      }],
      warm: [],
      cold: [],
      droppedItems: [],
      systemText: 'Hot Memory\n- Tool Orchestration: Related automation context.',
      sources: [{ title: 'Tool Orchestration', filePath: 'Tool.md', chunk: 'Related automation context.', score: 0.74 }]
    }

    const preview = buildAIOutboundPreview({
      mode: 'chat',
      provider,
      messages: [
        { role: 'system', content: '当前打开笔记: Current\n路径: Current.md' },
        {
          role: 'user',
          content: `以下是参考笔记内容：

[笔记: Alpha]
Alpha note body.

用户问题：请对照 Alpha 回答。`
        }
      ],
      vaultPath: '/vault',
      currentFilePath: '/vault/Current.md',
      retrievedNotes: [{ title: 'Alpha', filePath: 'Alpha.md', chunk: 'Matched Alpha chunk.', score: 0.9 }],
      longContextPack: pack,
      language: 'zh-CN'
    })

    expect(preview.provider).toMatchObject({ name: 'OpenAI', model: 'gpt-4.1', localOnly: false })
    expect(preview.provider).not.toHaveProperty('apiKey')
    expect(preview.promptPreview).toBe('请对照 Alpha 回答。')
    expect(preview.clientContextSnippets[0].title).toBe('当前笔记指针')
    expect(preview.attachmentSnippets[0]).toMatchObject({ title: 'Alpha', preview: 'Alpha note body.' })
    expect(preview.retrievedNoteSnippets[0]).toMatchObject({ title: 'Alpha', filePath: 'Alpha.md' })
    expect(preview.longContext.hot).toBe(1)
    expect(preview.longContext.snippets[0].title).toContain('Hot')
    expect(preview.estimatedTokens).toBeGreaterThan(42)
  })

  it('describes agent tool access before the request is confirmed', () => {
    const preview = buildAIOutboundPreview({
      mode: 'agent',
      provider,
      messages: [{ role: 'user', content: '查找并总结当前项目里的行动项' }],
      toolNames: ['search_notes', 'read_note'],
      language: 'zh-CN'
    })

    expect(preview.toolAccess).toEqual({ toolCount: 2, toolNames: ['search_notes', 'read_note'] })
    expect(preview.warnings.some((warning) => warning.includes('Vault 工具'))).toBe(true)
    expect(preview.retrievedNoteSnippets).toHaveLength(0)
  })

  it('estimates request cost and monthly budget status before sending', () => {
    const preview = buildAIOutboundPreview({
      mode: 'chat',
      provider: {
        ...provider,
        inputCostPer1MTokens: 2,
        outputCostPer1MTokens: 8
      },
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Summarize the attached notes and suggest next steps.' }
      ],
      usageSummary: {
        since: 100,
        records: 2,
        inputTokens: 1000,
        outputTokens: 400,
        totalTokens: 1400,
        estimatedCostUsd: 4.95,
        unknownCostRecords: 0,
        byProvider: []
      },
      costBudget: {
        monthlyUsd: 4.95,
        warnAtPercent: 80
      },
      language: 'en'
    })

    expect(preview.cost.estimatedInputTokens).toBeGreaterThan(0)
    expect(preview.cost.estimatedOutputTokens).toBeGreaterThan(0)
    expect(preview.cost.estimatedCostUsd).toBeGreaterThan(0)
    expect(preview.cost.monthlyBudgetUsd).toBe(4.95)
    expect(preview.cost.budgetStatus).toBe('over')
    expect(preview.warnings.some((warning) => warning.includes('over budget'))).toBe(true)
  })
})
