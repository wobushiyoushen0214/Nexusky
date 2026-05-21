import { describe, expect, it } from 'vitest'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata, ensureGeneratedNoteWikilinks } from '../packages/main/src/services/ai/note-writing'

describe('generated note writing prompts', () => {
  it('requires natural wikilinks to same-batch notes', () => {
    const prompt = buildGeneratedNoteSystemPrompt()

    expect(prompt).toContain('必须使用 [[双向链接]]')
    expect(prompt).toContain('只能链接给定的其他笔记标题')
    expect(prompt).not.toContain('不要使用 [[]] 双链语法')
  })

  it('lists available sibling note titles for wikilinks', () => {
    const prompt = buildGeneratedNoteUserPrompt('Hooks 入门', '基础 Hook', ['自定义 Hook', '状态管理'])

    expect(prompt).toContain('标题: Hooks 入门')
    expect(prompt).toContain('描述: 基础 Hook')
    expect(prompt).toContain('- 自定义 Hook')
    expect(prompt).toContain('- 状态管理')
  })

  it('appends missing same-batch wikilinks to generated content', () => {
    expect(ensureGeneratedNoteWikilinks('# Hooks 入门\n\n内容', 'Hooks 入门', ['自定义 Hook', '状态管理'])).toBe([
      '# Hooks 入门',
      '',
      '内容',
      '',
      '## 相关笔记',
      '',
      '- [[自定义 Hook]]',
      '- [[状态管理]]'
    ].join('\n'))
  })

  it('does not duplicate existing wikilinks or link to itself', () => {
    expect(ensureGeneratedNoteWikilinks('# Hooks 入门\n\n参见 [[自定义 Hook|封装逻辑]]。', 'Hooks 入门', ['Hooks 入门', '自定义 Hook', '状态管理'])).toContain('- [[状态管理]]')
    expect(ensureGeneratedNoteWikilinks('# Hooks 入门\n\n参见 [[自定义 Hook|封装逻辑]]。', 'Hooks 入门', ['Hooks 入门', '自定义 Hook', '状态管理'])).not.toContain('- [[自定义 Hook]]')
    expect(ensureGeneratedNoteWikilinks('# Hooks 入门\n\n参见 [[自定义 Hook|封装逻辑]]。', 'Hooks 入门', ['Hooks 入门', '自定义 Hook', '状态管理'])).not.toContain('[[Hooks 入门]]')
  })

  it('merges missing wikilinks into an existing related-notes section', () => {
    expect(ensureGeneratedNoteWikilinks([
      '# Hooks 入门',
      '',
      '内容',
      '',
      '## 相关笔记',
      '',
      '- [[自定义 Hook]]',
      '',
      '## 后续',
      '',
      '练习。'
    ].join('\n'), 'Hooks 入门', ['自定义 Hook', '状态管理'])).toBe([
      '# Hooks 入门',
      '',
      '内容',
      '',
      '## 相关笔记',
      '',
      '- [[自定义 Hook]]',
      '- [[状态管理]]',
      '',
      '## 后续',
      '',
      '练习。'
    ].join('\n'))
  })

  it('reuses common related-link heading variants', () => {
    expect(ensureGeneratedNoteWikilinks([
      '# Hooks 入门',
      '',
      '内容',
      '',
      '## Related Notes',
      '',
      '- [[自定义 Hook]]'
    ].join('\n'), 'Hooks 入门', ['自定义 Hook', '状态管理'])).toBe([
      '# Hooks 入门',
      '',
      '内容',
      '',
      '## Related Notes',
      '',
      '- [[自定义 Hook]]',
      '- [[状态管理]]'
    ].join('\n'))
  })

  it('adds frontmatter metadata to generated notes', () => {
    expect(ensureGeneratedNoteMetadata('# Hooks 入门\n\n内容', 'Hooks 入门', '基础 Hook')).toBe([
      '---',
      'title: "Hooks 入门"',
      'summary: "基础 Hook"',
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
