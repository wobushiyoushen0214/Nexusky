import { describe, expect, it } from 'vitest'
import { filterReaderRows, getReaderSource, getReaderSourceUrl, isUnreadReaderRow } from '../packages/renderer/src/components/reader/ReaderInboxView'
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
      row('Notes/Regular.md', { tags: ['research'] }, 40)
    ]

    expect(isUnreadReaderRow(rows[0])).toBe(true)
    expect(isUnreadReaderRow(rows[2])).toBe(false)
    expect(filterReaderRows(rows, 'all', '', false).map((item) => item.filePath)).toEqual([
      'Imports/Notion/Done.md',
      'Imports/Readwise/Book.md',
      'Imports/Pocket/Later.md'
    ])
    expect(filterReaderRows(rows, 'pocket', 'research', true).map((item) => item.filePath)).toEqual(['Imports/Pocket/Later.md'])
    expect(filterReaderRows(rows, 'all', 'Ada', false).map((item) => item.filePath)).toEqual(['Imports/Readwise/Book.md'])
  })

  it('only exposes http source URLs for external opening', () => {
    expect(getReaderSourceUrl(row('Imports/Pocket/A.md', { url: 'https://example.com/a' }))).toBe('https://example.com/a')
    expect(getReaderSourceUrl(row('Imports/Pocket/B.md', { url: 'http://example.com/b' }))).toBe('http://example.com/b')
    expect(getReaderSourceUrl(row('Imports/Pocket/C.md', { url: 'file:///tmp/a' }))).toBe('')
    expect(getReaderSourceUrl(row('Imports/Pocket/D.md', { url: 'javascript:alert(1)' }))).toBe('')
  })
})
