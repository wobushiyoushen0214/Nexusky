import { describe, expect, it } from 'vitest'
import { formatSearchNotesToolResult } from '../packages/main/src/services/ai/search-results'

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
