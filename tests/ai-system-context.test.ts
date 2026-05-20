import { describe, expect, it } from 'vitest'
import { chatContentToText, withMergedSystemContext } from '../packages/main/src/services/ai/system-context'

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
})
