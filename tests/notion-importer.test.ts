import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('notion importer', () => {
  let sourcePath: string
  let vaultPath: string

  beforeEach(() => {
    sourcePath = mkdtempSync(join(tmpdir(), 'nexusky-notion-source-'))
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-notion-vault-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(sourcePath, { recursive: true, force: true })
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('normalizes Notion page titles and converts local page links to wikilinks', async () => {
    const { convertNotionMarkdownLinks, notionTitleFromPath } = await import('../packages/main/src/services/notion-importer')

    expect(notionTitleFromPath('Project Plan 0123456789abcdef0123456789abcdef.md')).toBe('Project Plan')
    const result = convertNotionMarkdownLinks([
      '[Child](Child%20Page%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md)',
      '[Web](https://example.com)',
      '![Logo](assets/logo.png)'
    ].join('\n'))

    expect(result.converted).toBe(1)
    expect(result.content).toContain('[[Child Page|Child]]')
    expect(result.content).toContain('[Web](https://example.com)')
    expect(result.content).toContain('![Logo](assets/logo.png)')
  })

  it('imports Notion Markdown pages, CSV databases, and assets', async () => {
    const { importNotionExport } = await import('../packages/main/src/services/notion-importer')
    const { getAllNotes, getPropertyRows } = await import('../packages/main/src/services/indexer')

    mkdirSync(join(sourcePath, 'assets'), { recursive: true })
    writeFileSync(
      join(sourcePath, 'Project 0123456789abcdef0123456789abcdef.md'),
      '# Project\n\nSee [Child](Child%20Page%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md).\n\n![Logo](assets/logo.png)\n'
    )
    writeFileSync(join(sourcePath, 'Child Page aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md'), '# Child Page\n')
    writeFileSync(join(sourcePath, 'Tasks bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.csv'), 'Name,Status\n"Ship | Test",Done\n"Line\nBreak",Todo\n')
    writeFileSync(join(sourcePath, 'assets', 'logo.png'), 'png')

    const result = await importNotionExport(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 3, converted: 2, indexed: 3, assets: 1, skipped: 0 })
    const projectPath = join(vaultPath, 'Imports', 'Notion', 'Project.md')
    const tasksPath = join(vaultPath, 'Imports', 'Notion', 'Tasks.md')
    expect(existsSync(projectPath)).toBe(true)
    expect(existsSync(tasksPath)).toBe(true)
    expect(existsSync(join(vaultPath, 'Imports', 'Notion', 'assets', 'logo.png'))).toBe(true)

    const project = readFileSync(projectPath, 'utf-8')
    expect(project).toContain('source: notion')
    expect(project).toContain('[[Child Page|Child]]')

    const tasks = readFileSync(tasksPath, 'utf-8')
    expect(tasks).toContain('type: database')
    expect(tasks).toContain('| Name | Status |')
    expect(tasks).toContain('| Ship \\| Test | Done |')
    expect(tasks).toContain('Line<br>Break')

    expect(getAllNotes(vaultPath).map((note) => note.filePath).sort()).toEqual([
      'Imports/Notion/Child Page.md',
      'Imports/Notion/Project.md',
      'Imports/Notion/Tasks.md'
    ])
    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Imports/Notion/Tasks.md')
    expect(row?.properties).toMatchObject({ title: 'Tasks', source: 'notion', type: 'database' })
    expect(row?.properties.tags).toEqual(expect.arrayContaining(['notion', 'database']))
  })

  it('converts Notion HTML pages to indexed Markdown notes', async () => {
    const { convertNotionHtmlToMarkdown, importNotionExport } = await import('../packages/main/src/services/notion-importer')
    const { getAllNotes, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const html = [
      '<html><head><title>Fallback</title></head><body>',
      '<h1>HTML Page 1234567890abcdef1234567890abcdef</h1>',
      '<p>See <a href="Child%20HTML%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html">Child page</a> and <a href="https://example.com">web</a>.</p>',
      '<ul><li>First item</li><li>Second &amp; item</li></ul>',
      '<img src="assets/logo.png" alt="Logo">',
      '</body></html>'
    ].join('\n')
    const converted = convertNotionHtmlToMarkdown(html, 'Fallback')
    expect(converted.title).toBe('HTML Page')
    expect(converted.content).toContain('source: notion')
    expect(converted.content).toContain('[[Child HTML|Child page]]')
    expect(converted.content).toContain('[web](https://example.com)')
    expect(converted.content).toContain('- Second & item')
    expect(converted.content).toContain('![Logo](assets/logo.png)')

    writeFileSync(join(sourcePath, 'HTML Page 1234567890abcdef1234567890abcdef.html'), html)
    writeFileSync(join(sourcePath, 'Child HTML aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.html'), '<h1>Child HTML</h1><p>Body</p>')

    const result = await importNotionExport(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 2, indexed: 2, assets: 0, skipped: 0 })
    expect(result.converted).toBeGreaterThanOrEqual(2)
    expect(existsSync(join(vaultPath, 'Imports', 'Notion', 'HTML Page.md'))).toBe(true)
    expect(getAllNotes(vaultPath).map((note) => note.filePath).sort()).toEqual([
      'Imports/Notion/Child HTML.md',
      'Imports/Notion/HTML Page.md'
    ])
    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Imports/Notion/HTML Page.md')
    expect(row?.properties).toMatchObject({ title: 'HTML Page', source: 'notion', type: 'page' })
  })
})
