import { describe, expect, it } from 'vitest'
import { linkPlainMentionAtLine, linkPlainMentionsAtLines } from '../packages/renderer/src/utils/wikilink'

describe('wikilink utilities', () => {
  it('links only the requested plain mention line', () => {
    const result = linkPlainMentionAtLine('# Topic\n\nProject appears here.\nProject stays plain.\n', 3, 'Project')

    expect(result.changed).toBe(true)
    expect(result.content).toBe('# Topic\n\n[[Project]] appears here.\nProject stays plain.\n')
  })

  it('preserves CRLF line endings', () => {
    const result = linkPlainMentionAtLine('# Topic\r\n\r\nProject appears here.\r\n', 3, 'Project')

    expect(result.changed).toBe(true)
    expect(result.content).toBe('# Topic\r\n\r\n[[Project]] appears here.\r\n')
  })

  it('does not relink existing wikilinks', () => {
    const result = linkPlainMentionAtLine('# Topic\n\nSee [[Project]] today.\n', 3, 'Project')

    expect(result.changed).toBe(false)
    expect(result.content).toBe('# Topic\n\nSee [[Project]] today.\n')
  })

  it('does not match inside longer latin words', () => {
    const result = linkPlainMentionAtLine('# Topic\n\nPlanning is not Plan.\n', 3, 'Plan')

    expect(result.changed).toBe(true)
    expect(result.content).toBe('# Topic\n\nPlanning is not [[Plan]].\n')
  })

  it('returns unchanged content when the target line is missing', () => {
    const result = linkPlainMentionAtLine('# Topic\n', 5, 'Topic')

    expect(result.changed).toBe(false)
    expect(result.content).toBe('# Topic\n')
  })

  it('links multiple mention targets in one pass', () => {
    const result = linkPlainMentionsAtLines('# Topic\n\nProject meets Roadmap.\nSee Plan later.\n', [
      { line: 3, mention: 'Project' },
      { line: 3, mention: 'Roadmap' },
      { line: 4, mention: 'Plan' }
    ])

    expect(result.changedCount).toBe(3)
    expect(result.content).toBe('# Topic\n\n[[Project]] meets [[Roadmap]].\nSee [[Plan]] later.\n')
  })

  it('counts only changed mention targets in bulk mode', () => {
    const result = linkPlainMentionsAtLines('# Topic\n\nSee [[Project]] and Plan.\n', [
      { line: 3, mention: 'Project' },
      { line: 3, mention: 'Plan' },
      { line: 8, mention: 'Missing' }
    ])

    expect(result.changedCount).toBe(1)
    expect(result.content).toBe('# Topic\n\nSee [[Project]] and [[Plan]].\n')
  })
})
