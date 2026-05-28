import { describe, expect, it } from 'vitest'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata } from '../packages/main/src/services/ai/note-writing'

describe('generated note writing prompts', () => {
  it('keeps wikilinks optional and forbids invented targets', () => {
    const prompt = buildGeneratedNoteSystemPrompt()

    expect(prompt).toContain('可以用 [[标题]] 引用')
    expect(prompt).toContain('不要编造未给出的标题作为 wikilink')
    expect(prompt).not.toContain('必须使用 [[双向链接]]')
  })

  it('lists available sibling note titles for optional wikilinks', () => {
    const prompt = buildGeneratedNoteUserPrompt('Hooks 入门', '基础 Hook', ['自定义 Hook', '状态管理'])

    expect(prompt).toContain('标题: Hooks 入门')
    expect(prompt).toContain('描述: 基础 Hook')
    expect(prompt).toContain('- 自定义 Hook')
    expect(prompt).toContain('- 状态管理')
    expect(prompt).toContain('仅在正文自然涉及时引用')
  })

  it('adds structured frontmatter metadata to generated notes', () => {
    expect(ensureGeneratedNoteMetadata('# Hooks 入门\n\n内容', 'Hooks 入门', '基础 Hook', ['自定义 Hook', '状态管理', 'Hooks 入门', '自定义 Hook'])).toBe([
      '---',
      'title: "Hooks 入门"',
      'summary: "基础 Hook"',
      'related:',
      '  - "自定义 Hook"',
      '  - "状态管理"',
      'tags:',
      '  - "ai-generated"',
      '  - "batch-note"',
      'status: seed',
      'source: ai-batch',
      '---',
      '# Hooks 入门',
      '',
      '内容'
    ].join('\n'))
  })

  it('does not duplicate existing frontmatter', () => {
    const content = '---\ntitle: "Existing"\n---\n# Existing\n'
    expect(ensureGeneratedNoteMetadata(content, 'Next', 'Summary')).toBe(content.trim())
  })
})
