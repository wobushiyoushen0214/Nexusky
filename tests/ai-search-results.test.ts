import { describe, expect, it } from 'vitest'
import { formatNoteLinksToolResult, formatReadNoteToolResult, formatSearchNotesToolResult } from '../packages/main/src/services/ai/search-results'

describe('formatSearchNotesToolResult', () => {
  it('includes file paths so the agent can disambiguate read_note calls', () => {
    const output = formatSearchNotesToolResult([
      { title: 'Topic', filePath: 'A/Topic.md', chunk: 'First result content.' },
      { title: 'Topic', filePath: 'B/Topic.md', chunk: 'Second result content.' }
    ])

    expect(output).toContain('1. **Topic**')
    expect(output).toContain('Path: A/Topic.md')
    expect(output).toContain('Path: B/Topic.md')
  })

  it('limits long chunks in tool output', () => {
    const output = formatSearchNotesToolResult([
      { title: 'Long', filePath: 'Long.md', chunk: 'x'.repeat(260) }
    ])

    expect(output).toHaveLength('1. **Long**\nPath: Long.md\n'.length + 200)
  })
})

describe('formatReadNoteToolResult', () => {
  it('includes title and path before note content', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'A/Topic.md',
      content: '# Topic\n\nBody.'
    })

    expect(output).toBe('Title: Topic\nPath: A/Topic.md\n\n# Topic\n\nBody.')
  })

  it('marks empty notes explicitly', () => {
    const output = formatReadNoteToolResult({
      title: 'Empty',
      filePath: 'Empty.md',
      content: '   '
    })

    expect(output).toBe('Title: Empty\nPath: Empty.md\n\n(empty note)')
  })

  it('includes section metadata when reading a note section', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      section: 'Details',
      content: '## Details\nBody.'
    })

    expect(output).toBe('Title: Topic\nPath: Topic.md\nSection: Details\n\n## Details\nBody.')
  })

  it('includes block metadata when reading a note block', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      blockId: 'todo-1',
      content: '- Task body'
    })

    expect(output).toBe('Title: Topic\nPath: Topic.md\nBlock: ^todo-1\n\n- Task body')
  })
})

describe('formatNoteLinksToolResult', () => {
  it('formats outgoing links and backlinks with paths', () => {
    const output = formatNoteLinksToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      outgoing: [
        { targetTitle: 'Next', targetPath: 'Folder/Next.md', context: 'See [[Next]] for details.', resolved: true },
        { targetTitle: 'Missing', context: 'See [[Missing]].', resolved: false }
      ],
      backlinks: [
        { sourceTitle: 'Source', sourcePath: 'Source.md', context: 'References [[Topic]].' }
      ]
    })

    expect(output).toContain('Title: Topic')
    expect(output).toContain('Path: Topic.md')
    expect(output).toContain('1. Next (Folder/Next.md) - See [[Next]] for details.')
    expect(output).toContain('2. Missing (unresolved) - See [[Missing]].')
    expect(output).toContain('1. Source (Source.md) - References [[Topic]].')
  })

  it('marks empty link sections explicitly', () => {
    const output = formatNoteLinksToolResult({
      title: 'Solo',
      filePath: 'Solo.md',
      outgoing: [],
      backlinks: []
    })

    expect(output).toBe('Title: Solo\nPath: Solo.md\n\nOutgoing:\n(none)\n\nBacklinks:\n(none)')
  })
})
