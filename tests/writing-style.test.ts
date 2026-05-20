import { describe, expect, it } from 'vitest'
import { analyzeWritingStyle, formatWritingStylePrompt } from '../packages/shared/src/writing-style'

describe('writing style profile', () => {
  it('detects structured Chinese technical notes', () => {
    const profile = analyzeWritingStyle([
      '# AI 工作流',
      '',
      '这个模块负责把用户输入转换为可执行任务。它需要保持上下文，也需要避免重复请求。',
      '',
      '## 实现细节',
      '',
      '- 使用队列合并短时间内的更新',
      '- 通过 API 返回 JSON 结果',
      '- 在数据库中保存索引状态',
      '',
      '```ts',
      'const enabled = true',
      '```'
    ].join('\n'))

    expect(profile.language).toBe('zh')
    expect(profile.headingStyle).toBe('structured')
    expect(profile.listStyle).toBe('dash')
    expect(profile.technicalTone).toBe(true)
    expect(profile.usesCodeBlocks).toBe(true)
  })

  it('detects English prose with longer paragraphs', () => {
    const profile = analyzeWritingStyle([
      'The product should help users move from scattered notes to deliberate thinking without making them manage another rigid system.',
      '',
      'A good assistant should preserve the author voice, keep the argument focused, and extend the text in a way that feels like a natural continuation instead of a generic answer.'
    ].join('\n'))

    expect(profile.language).toBe('en')
    expect(profile.listStyle).toBe('none')
    expect(profile.headingStyle).toBe('none')
    expect(profile.avgSentenceLength).toBeGreaterThan(50)
  })

  it('does not emit a style prompt for tiny samples', () => {
    const prompt = formatWritingStylePrompt(analyzeWritingStyle('太短。'))

    expect(prompt).toBe('')
  })

  it('formats a compact prompt for useful samples', () => {
    const prompt = formatWritingStylePrompt(analyzeWritingStyle('这是一段用于学习写作风格的中文样本。它包含足够的句子，用于判断语言、句长和段落节奏。\n\n- 第一项\n- 第二项'))

    expect(prompt).toContain('写作风格画像')
    expect(prompt).toContain('语言: 中文')
    expect(prompt).toContain('使用 - 列表')
  })
})
