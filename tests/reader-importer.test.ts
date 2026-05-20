import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('reader importer', () => {
  let sourcePath: string
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-reader-vault-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
    sourcePath = join(vaultPath, 'readwise.csv')
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('parses quoted Readwise CSV rows with embedded commas and newlines', async () => {
    const { parseReadwiseCsv } = await import('../packages/main/src/services/reader-importer')
    const rows = parseReadwiseCsv([
      'Title,Author,Highlight,Note,Tags,Highlighted at,URL',
      '"Deep Work","Cal Newport","A quote, with comma","my note","focus; productivity","2026-05-20","https://example.com"',
      '"Deep Work","Cal Newport","Second line\ncontinued","","focus","2026-05-21","https://example.com"'
    ].join('\n'))

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      title: 'Deep Work',
      author: 'Cal Newport',
      highlight: 'A quote, with comma',
      note: 'my note',
      tags: ['focus', 'productivity']
    })
    expect(rows[1].highlight).toBe('Second line\ncontinued')
  })

  it('imports Readwise highlights as grouped Markdown notes and indexes them', async () => {
    const { importReadwiseCsv } = await import('../packages/main/src/services/reader-importer')
    const { getAllNotes, getPropertyRows } = await import('../packages/main/src/services/indexer')

    writeFileSync(sourcePath, [
      'Title,Author,Highlight,Note,Tags,Highlighted at,URL',
      '"Deep Work","Cal Newport","A quote, with comma","my note","focus; productivity","2026-05-20","https://example.com/deep"',
      '"Deep Work","Cal Newport","Second highlight","","focus","2026-05-21","https://example.com/deep"',
      '"Range","David Epstein","Useful contrast","","learning","2026-05-22","https://example.com/range"'
    ].join('\n'))

    const result = await importReadwiseCsv(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 2, indexed: 2, skipped: 0 })
    const deepWorkPath = join(vaultPath, 'Imports', 'Readwise', 'Deep Work.md')
    expect(existsSync(deepWorkPath)).toBe(true)
    const content = readFileSync(deepWorkPath, 'utf-8')
    expect(content).toContain('source: readwise')
    expect(content).toContain('> A quote, with comma')
    expect(content).toContain('**Note:** my note')
    expect(content).toContain('- productivity')

    const notes = getAllNotes(vaultPath)
    expect(notes.map((note) => note.filePath).sort()).toEqual([
      'Imports/Readwise/Deep Work.md',
      'Imports/Readwise/Range.md'
    ])
    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Imports/Readwise/Deep Work.md')
    expect(row?.properties).toMatchObject({
      title: 'Deep Work',
      source: 'readwise',
      author: 'Cal Newport',
      url: 'https://example.com/deep'
    })
    expect(row?.properties.tags).toEqual(expect.arrayContaining(['readwise', 'focus', 'productivity']))

    const duplicate = await importReadwiseCsv(sourcePath, vaultPath)
    expect(duplicate).toMatchObject({ imported: 0, indexed: 0, skipped: 2 })
  })

  it('imports Pocket bookmark exports as reading notes and skips duplicates', async () => {
    const { importPocketBookmarks, parsePocketBookmarksHtml } = await import('../packages/main/src/services/reader-importer')
    const { getAllNotes, getPropertyRows } = await import('../packages/main/src/services/indexer')
    const pocketPath = join(vaultPath, 'pocket.html')
    const html = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<DL><p>',
      '<DT><A HREF="https://example.com/deep?x=1&amp;y=2" ADD_DATE="1779235200" TAGS="focus, long form">Deep &amp; Useful</A>',
      '<DT><A HREF="https://example.com/deep?x=1&amp;y=2" ADD_DATE="1779235200" TAGS="focus">Deep Duplicate</A>',
      '<DT><A HREF="https://example.com/range" TAGS="learning">Range</A>',
      '</DL><p>'
    ].join('\n')
    writeFileSync(pocketPath, html)

    const parsed = parsePocketBookmarksHtml(html)
    expect(parsed[0]).toMatchObject({
      title: 'Deep & Useful',
      url: 'https://example.com/deep?x=1&y=2',
      tags: ['focus', 'long-form']
    })

    const result = await importPocketBookmarks(pocketPath, vaultPath)

    expect(result).toMatchObject({ imported: 2, indexed: 2, skipped: 1 })
    const notePath = join(vaultPath, 'Imports', 'Pocket', 'Deep & Useful.md')
    expect(existsSync(notePath)).toBe(true)
    const content = readFileSync(notePath, 'utf-8')
    expect(content).toContain('source: pocket')
    expect(content).toContain('status: unread')
    expect(content).toContain('Source: https://example.com/deep?x=1&y=2')

    expect(getAllNotes(vaultPath).map((note) => note.filePath).sort()).toEqual([
      'Imports/Pocket/Deep & Useful.md',
      'Imports/Pocket/Range.md'
    ])
    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Imports/Pocket/Deep & Useful.md')
    expect(row?.properties).toMatchObject({
      title: 'Deep & Useful',
      source: 'pocket',
      url: 'https://example.com/deep?x=1&y=2',
      status: 'unread'
    })
    expect(row?.properties.tags).toEqual(expect.arrayContaining(['pocket', 'read-later', 'focus', 'long-form']))

    const duplicate = await importPocketBookmarks(pocketPath, vaultPath)
    expect(duplicate).toMatchObject({ imported: 0, indexed: 0, skipped: 3 })
  })
})
