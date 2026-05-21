import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('obsidian importer', () => {
  let sourcePath: string
  let vaultPath: string

  beforeEach(() => {
    sourcePath = mkdtempSync(join(tmpdir(), 'nexusky-obsidian-source-'))
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-obsidian-vault-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(sourcePath, { recursive: true, force: true })
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('imports and indexes frontmatter, Dataview fields, aliases, and callouts', async () => {
    const { importObsidianVault } = await import('../packages/main/src/services/obsidian-importer')
    const { getAllNotes, getOutgoingLinks, getPropertyRows } = await import('../packages/main/src/services/indexer')

    writeFileSync(join(sourcePath, 'Project.md'), [
      '---',
      'title: Project Display',
      'aliases:',
      '  - Project Alias',
      'tags:',
      '  - research',
      '---',
      '# Project',
      '',
      'status:: active',
      'priority:: 2',
      'published:: true',
      '> [!note] Imported',
      '> Callout body.'
    ].join('\n'))
    writeFileSync(join(sourcePath, 'Source.md'), '# Source\n\nSee [[Project Alias]].')

    const result = await importObsidianVault(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 2, converted: 1, indexed: 2 })

    const notes = getAllNotes(vaultPath)
    const project = notes.find((note) => note.filePath === 'Project.md')
    const source = notes.find((note) => note.filePath === 'Source.md')
    expect(project).toBeTruthy()
    expect(source).toBeTruthy()
    expect(project!.title).toBe('Project Display')

    const outgoing = getOutgoingLinks(vaultPath, source!.id)
    expect(outgoing[0]).toMatchObject({ targetPath: 'Project.md', resolved: true })

    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Project.md')
    expect(row).toMatchObject({
      properties: {
        title: 'Project Display',
        aliases: ['Project Alias'],
        tags: ['research'],
        status: 'active',
        priority: 2,
        published: true
      }
    })
  })

  it('keeps hidden user content while skipping Obsidian internals', async () => {
    const { importObsidianVault } = await import('../packages/main/src/services/obsidian-importer')
    const { getAllNotes } = await import('../packages/main/src/services/indexer')

    mkdirSync(join(sourcePath, '.attachments'), { recursive: true })
    mkdirSync(join(sourcePath, '.obsidian'), { recursive: true })
    writeFileSync(join(sourcePath, '.attachments', 'diagram.png'), 'image')
    writeFileSync(join(sourcePath, '.hidden-note.md'), '# Hidden Note\n\nPrivate context.')
    writeFileSync(join(sourcePath, '.obsidian', 'app.json'), '{}')

    const result = await importObsidianVault(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 2, converted: 0, indexed: 1 })
    expect(existsSync(join(vaultPath, '.attachments', 'diagram.png'))).toBe(true)
    expect(existsSync(join(vaultPath, '.obsidian', 'app.json'))).toBe(false)
    expect(getAllNotes(vaultPath).some((note) => note.filePath === '.hidden-note.md')).toBe(true)
  })

  it('preserves Obsidian Canvas files and creates indexed markdown maps', async () => {
    const { importObsidianVault } = await import('../packages/main/src/services/obsidian-importer')
    const { getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    mkdirSync(join(sourcePath, 'Folder'), { recursive: true })
    writeFileSync(join(sourcePath, 'Project.md'), '# Project\n\nProject note.')
    writeFileSync(join(sourcePath, 'Folder', 'Next.md'), '# Next\n\nNext note.')
    writeFileSync(join(sourcePath, 'Research.canvas'), JSON.stringify({
      nodes: [
        { id: 'a', type: 'file', file: 'Project.md' },
        { id: 'b', type: 'file', file: 'Folder/Next.md' },
        { id: 'c', type: 'text', text: '# Question\n\nWhat should we connect next?' }
      ],
      edges: [
        { fromNode: 'a', toNode: 'b', label: 'leads to' },
        { fromNode: 'c', toNode: 'a' }
      ]
    }))

    const result = await importObsidianVault(sourcePath, vaultPath)

    expect(result).toMatchObject({ imported: 4, converted: 1, indexed: 3 })
    expect(existsSync(join(vaultPath, 'Research.canvas'))).toBe(true)
    expect(existsSync(join(vaultPath, 'Research.canvas.md'))).toBe(true)

    const notes = getAllNotes(vaultPath)
    const canvasNote = notes.find((note) => note.filePath === 'Research.canvas.md')
    expect(canvasNote).toBeTruthy()
    expect(canvasNote!.title).toBe('Research Canvas')

    const links = getOutgoingLinks(vaultPath, canvasNote!.id)
    expect(Array.from(new Set(links.map((link) => link.targetPath))).sort()).toEqual(['Folder/Next.md', 'Project.md'])
    expect(links.every((link) => link.resolved)).toBe(true)
  })
})
