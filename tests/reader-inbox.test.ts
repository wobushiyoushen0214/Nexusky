import { describe, expect, it } from 'vitest'
import { appendReaderNote, countUnreadReaderRows, filterReaderRows, getReaderSource, getReaderSourceUrl, isArchivedReaderRow, isUnreadReaderRow } from '../packages/renderer/src/components/reader/ReaderInboxView'
import type { PropertyTableRow } from '../packages/shared/src/types/ipc'

function row(filePath: string, properties: PropertyTableRow['properties'], updatedAt = 1): PropertyTableRow {
  return {
    id: filePath,
    title: filePath.split('/').pop()?.replace(/\.md$/, '') || filePath,
    filePath,
    createdAt: updatedAt,
    updatedAt,
    properties
  }
}

describe('reader inbox helpers', () => {
  it('detects imported reader sources from frontmatter or import paths', () => {
    expect(getReaderSource(row('A.md', { source: 'readwise' }))).toBe('readwise')
    expect(getReaderSource(row('Imports/Pocket/Saved.md', {}))).toBe('pocket')
    expect(getReaderSource(row('Imports/Notion/Page.md', {}))).toBe('notion')
    expect(getReaderSource(row('Notes/Regular.md', {}))).toBeNull()
  })

  it('filters by source, query, unread status, and newest first', () => {
    const rows = [
      row('Imports/Pocket/Later.md', { status: 'unread', tags: ['research'], url: 'https://example.com' }, 10),
      row('Imports/Readwise/Book.md', { source: 'readwise', author: 'Ada', tags: ['book'] }, 20),
      row('Imports/Notion/Done.md', { source: 'notion', status: 'done' }, 30),
      row('Imports/Pocket/Archived.md', { source: 'pocket', status: 'archived' }, 35),
      row('Notes/Regular.md', { tags: ['research'] }, 40)
    ]

    expect(isUnreadReaderRow(rows[0])).toBe(true)
    expect(isUnreadReaderRow(rows[2])).toBe(false)
    expect(isArchivedReaderRow(rows[3])).toBe(true)
    expect(filterReaderRows(rows, 'all', '', false).map((item) => item.filePath)).toEqual([
      'Imports/Pocket/Archived.md',
      'Imports/Notion/Done.md',
      'Imports/Readwise/Book.md',
      'Imports/Pocket/Later.md'
    ])
    expect(filterReaderRows(rows, 'all', '', false, true).map((item) => item.filePath)).toEqual([
      'Imports/Notion/Done.md',
      'Imports/Readwise/Book.md',
      'Imports/Pocket/Later.md'
    ])
    expect(filterReaderRows(rows, 'pocket', 'research', true).map((item) => item.filePath)).toEqual(['Imports/Pocket/Later.md'])
    expect(filterReaderRows(rows, 'all', 'Ada', false).map((item) => item.filePath)).toEqual(['Imports/Readwise/Book.md'])
    expect(countUnreadReaderRows(rows)).toBe(2)
  })

  it('sorts reading items by title or source when requested', () => {
    const rows = [
      row('Imports/Pocket/Zebra.md', { source: 'pocket' }, 30),
      row('Imports/Readwise/Alpha.md', { source: 'readwise' }, 10),
      row('Imports/Notion/Middle.md', { source: 'notion' }, 20)
    ]

    expect(filterReaderRows(rows, 'all', '', false, false, 'title').map((item) => item.filePath)).toEqual([
      'Imports/Readwise/Alpha.md',
      'Imports/Notion/Middle.md',
      'Imports/Pocket/Zebra.md'
    ])
    expect(filterReaderRows(rows, 'all', '', false, false, 'source').map((item) => item.filePath)).toEqual([
      'Imports/Notion/Middle.md',
      'Imports/Pocket/Zebra.md',
      'Imports/Readwise/Alpha.md'
    ])
  })

  it('only exposes http source URLs for external opening', () => {
    expect(getReaderSourceUrl(row('Imports/Pocket/A.md', { url: 'https://example.com/a' }))).toBe('https://example.com/a')
    expect(getReaderSourceUrl(row('Imports/Pocket/B.md', { url: 'http://example.com/b' }))).toBe('http://example.com/b')
    expect(getReaderSourceUrl(row('Imports/Pocket/C.md', { url: 'file:///tmp/a' }))).toBe('')
    expect(getReaderSourceUrl(row('Imports/Pocket/D.md', { url: 'javascript:alert(1)' }))).toBe('')
  })

  it('appends quick notes to a new Notes section', () => {
    const updated = appendReaderNote('# Article\n\nBody', 'Connect this to [[Project]]', new Date('2026-05-20T08:00:00Z'))

    expect(updated).toBe('# Article\n\nBody\n\n## Notes\n\n- 2026-05-20: Connect this to [[Project]]\n')
  })

  it('keeps existing note sections before following headings', () => {
    const updated = appendReaderNote('# Article\n\n## Notes\n\n- 2026-05-19: Existing\n\n## Source\n\nLink', 'Second line\nwith detail', new Date('2026-05-20T08:00:00Z'))

    expect(updated).toContain('- 2026-05-19: Existing\n\n- 2026-05-20: Second line\n  with detail\n\n## Source')
  })
})
