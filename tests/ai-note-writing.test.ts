import { describe, expect, it } from 'vitest'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt } from '../packages/main/src/services/ai/note-writing'

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
})
