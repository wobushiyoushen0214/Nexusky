import { describe, expect, it } from 'vitest'
import { chatContentToText, withMergedSystemContext } from '../packages/main/src/services/ai/system-context'
import {
  getLongContextSystemGuard,
  LONG_CONTEXT_SYSTEM_GUARD,
  mergeLongContextIntoSystemPrompt,
  type LongContextPack
} from '../packages/main/src/services/long-context/context-pack-builder'

describe('AI system context merging', () => {
  it('keeps renderer system context when main process installs its system prompt', () => {
    const messages = withMergedSystemContext('Main prompt', [
      { role: 'system', content: '当前打开笔记: Project\n路径: Notes/Project.md' },
      { role: 'user', content: '总结当前笔记' },
    ])

    expect(messages).toEqual([
      {
        role: 'system',
        content: 'Main prompt\n\n<client_context>\n当前打开笔记: Project\n路径: Notes/Project.md\n</client_context>'
      },
      { role: 'user', content: '总结当前笔记' },
    ])
  })

  it('extracts only text parts from multimodal system content', () => {
    expect(chatContentToText([
      { type: 'text', text: 'first' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      { type: 'text', text: 'second' },
    ])).toBe('first\nsecond')
  })

  it('merges multiple client system messages in order', () => {
    const messages = withMergedSystemContext('Intent classifier', [
      { role: 'system', content: '当前打开笔记: Daily' },
      { role: 'system', content: '路径: Journal/Daily.md' },
      { role: 'user', content: '从这篇笔记提取任务？' },
    ])

    expect(messages[0].content).toBe('Intent classifier\n\n<client_context>\n当前打开笔记: Daily\n\n路径: Journal/Daily.md\n</client_context>')
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: '从这篇笔记提取任务？' },
    ])
  })

  it('adds the localized long-context guard without replacing client system context', () => {
    const pack: LongContextPack = {
      tokenBudget: 400,
      estimatedTokens: 40,
      hot: [],
      warm: [],
      cold: [],
      sources: [],
      systemText: '活跃记忆\n- 历史上下文 (置信度: 82%): 相关证据。'
    }

    const mergedPrompt = mergeLongContextIntoSystemPrompt('Base system prompt.', pack, 'zh-CN')
    const messages = withMergedSystemContext(mergedPrompt, [
      { role: 'system', content: 'Client-provided context.' },
      { role: 'user', content: 'What should I remember?' }
    ])

    expect(messages[0].content).toContain('Base system prompt.')
    expect(messages[0].content).toContain('<long_term_context>')
    expect(messages[0].content).toContain(LONG_CONTEXT_SYSTEM_GUARD)
    expect(messages[0].content).toContain('长期上下文是辅助记忆')
    expect(messages[0].content).toContain('<client_context>')
    expect(messages[0].content).toContain('Client-provided context.')
    expect(messages[1]).toMatchObject({ role: 'user' })
  })

  it('can inject an English long-context guard', () => {
    const pack: LongContextPack = {
      tokenBudget: 400,
      estimatedTokens: 40,
      hot: [],
      warm: [],
      cold: [],
      sources: [],
      systemText: 'Hot Memory\n- Historical Context (confidence: 82%): Related evidence.'
    }

    const mergedPrompt = mergeLongContextIntoSystemPrompt('Base system prompt.', pack, 'en')

    expect(mergedPrompt).toContain(getLongContextSystemGuard('en'))
    expect(mergedPrompt).toContain('Long-term context is supporting recall')
  })
})
