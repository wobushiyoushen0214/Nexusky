import { describe, expect, it } from 'vitest'
import { formatAiToolStatus } from '../packages/renderer/src/components/ai/tool-labels'

describe('AI tool status labels', () => {
  it('adds useful detail for note search and reads', () => {
    expect(formatAiToolStatus('search_notes', { query: 'project roadmap' })).toBe('搜索笔记: project roadmap')
    expect(formatAiToolStatus('read_note', { title: 'Plans/Launch.md' })).toBe('读取笔记: Plans/Launch.md')
  })

  it('labels memory and structure tools in user-facing language', () => {
    expect(formatAiToolStatus('list_memory_term_pairs', { type: 'mixed' })).toBe('分析概念共现: mixed')
    expect(formatAiToolStatus('list_notes_by_property', { key: 'status' })).toBe('按属性找笔记: status')
    expect(formatAiToolStatus('get_vault_overview')).toBe('汇总知识库')
  })

  it('falls back to the raw tool name when unknown', () => {
    expect(formatAiToolStatus('custom_tool')).toBe('custom_tool')
    expect(formatAiToolStatus('')).toBe('调用工具')
  })
})
