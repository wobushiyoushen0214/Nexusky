import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
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
})
