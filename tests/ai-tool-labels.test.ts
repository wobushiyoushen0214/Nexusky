import { describe, expect, it } from 'vitest'
import { formatAiToolStatus } from '../packages/renderer/src/components/ai/tool-labels'

describe('AI tool status labels', () => {
  it('adds useful detail for note search and reads', () => {
    expect(formatAiToolStatus('search_notes', { query: 'project roadmap' })).toBe('搜索笔记: project roadmap')
    expect(formatAiToolStatus('read_note', { title: 'Plans/Launch.md' })).toBe('读取笔记: Plans/Launch.md')
    expect(formatAiToolStatus('read_current_note')).toBe('读取当前笔记')
    expect(formatAiToolStatus('read_current_note_properties')).toBe('读取当前笔记属性')
    expect(formatAiToolStatus('read_current_note_lines')).toBe('读取当前笔记行号')
    expect(formatAiToolStatus('find_text_in_current_note', { query: 'decision' })).toBe('在当前笔记内查找: decision')
    expect(formatAiToolStatus('list_current_note_links')).toBe('读取当前笔记链接')
    expect(formatAiToolStatus('summarize_current_note_links')).toBe('汇总当前笔记关系')
    expect(formatAiToolStatus('list_current_note_unlinked_references')).toBe('查找当前笔记未链接引用')
    expect(formatAiToolStatus('list_current_note_headings')).toBe('读取当前笔记目录')
    expect(formatAiToolStatus('list_current_note_blocks')).toBe('读取当前笔记块引用')
    expect(formatAiToolStatus('read_current_note_memory')).toBe('读取当前笔记记忆')
    expect(formatAiToolStatus('list_current_note_tasks', { status: 'open' })).toBe('查询当前笔记任务: open')
  })

  it('labels memory and structure tools in user-facing language', () => {
    expect(formatAiToolStatus('find_connection_opportunities', { query: 'graph' })).toBe('查找连接机会: graph')
    expect(formatAiToolStatus('list_knowledge_bridges', { query: 'research' })).toBe('分析知识桥梁: research')
    expect(formatAiToolStatus('list_memory_term_pairs', { type: 'mixed' })).toBe('分析概念共现: mixed')
    expect(formatAiToolStatus('list_notes_by_property', { key: 'status' })).toBe('按属性找笔记: status')
    expect(formatAiToolStatus('get_vault_overview')).toBe('汇总知识库')
  })

  it('falls back to the raw tool name when unknown', () => {
    expect(formatAiToolStatus('custom_tool')).toBe('custom_tool')
    expect(formatAiToolStatus('')).toBe('调用工具')
  })

  it('truncates very long detail text', () => {
    const label = formatAiToolStatus('search_notes', { query: 'a'.repeat(90) })
    expect(label).toHaveLength('搜索笔记: '.length + 72)
    expect(label.endsWith('...')).toBe(true)
  })
})
