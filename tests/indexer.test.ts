import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('indexer', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-test-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('should create database with correct schema', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('notes')
    expect(tableNames).toContain('links')
    expect(tableNames).toContain('tags')
    expect(tableNames).toContain('note_aliases')
    expect(tableNames).toContain('chunks')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('conversations')

    closeDatabase()
  })

  it('should index a markdown file', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'test.md')
    writeFileSync(filePath, '# Test Note\n\nHello world\n\n[[Other Note]]\n\n#tag1 #tag2')

    indexNote(vaultPath, filePath)

    const notes = getAllNotes(vaultPath)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Test Note')

    closeDatabase()
  })

  it('should skip re-indexing unchanged files', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'test.md')
    writeFileSync(filePath, '# Unchanged\n\nContent here')

    indexNote(vaultPath, filePath)
    indexNote(vaultPath, filePath)

    const db = getDatabase(vaultPath)
    const count = db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }
    expect(count.c).toBe(1)

    closeDatabase()
  })

  it('should find unlinked mentions without duplicating explicit backlinks', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getUnlinkedMentions } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Project.md')
    const plainMentionPath = join(vaultPath, 'Planning.md')
    const linkedMentionPath = join(vaultPath, 'Linked.md')

    writeFileSync(targetPath, '# Project\n\nCanonical project note.')
    writeFileSync(plainMentionPath, '# Planning\n\nProject needs a clearer roadmap.')
    writeFileSync(linkedMentionPath, '# Linked\n\nSee [[Project]] for details.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, plainMentionPath)
    indexNote(vaultPath, linkedMentionPath)

    const project = getAllNotes(vaultPath).find((note) => note.title === 'Project')
    expect(project).toBeTruthy()

    const mentions = getUnlinkedMentions(vaultPath, project!.id)
    expect(mentions).toHaveLength(1)
    expect(mentions[0].sourceTitle).toBe('Planning')
    expect(mentions[0].mention).toBe('Project')
    expect(mentions[0].context).toContain('Project needs')

    closeDatabase()
  })

  it('should return resolved and unresolved outgoing links', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Target.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(targetPath, '# Target\n\nLinked note.')
    writeFileSync(sourcePath, '# Source\n\nSee [[Target]] and [[Missing Note]] for context.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(source).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(2)
    expect(links.find((link) => link.targetTitle === 'Target')).toMatchObject({ targetPath: 'Target.md', resolved: true })
    expect(links.find((link) => link.targetTitle === 'Missing Note')).toMatchObject({ resolved: false })

    closeDatabase()
  })

  it('should resolve wikilinks through frontmatter aliases', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getBacklinks, getOutgoingLinks, getGraphData } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Canonical.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(targetPath, '---\naliases:\n  - Alias Name\n  - Short Alias\n---\n# Canonical\n\nTarget note.')
    writeFileSync(sourcePath, '# Source\n\nSee [[Alias Name]] for details.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const canonical = getAllNotes(vaultPath).find((note) => note.title === 'Canonical')
    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(canonical).toBeTruthy()
    expect(source).toBeTruthy()

    const outgoing = getOutgoingLinks(vaultPath, source!.id)
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0]).toMatchObject({ targetTitle: 'Alias Name', targetPath: 'Canonical.md', resolved: true })

    const backlinks = getBacklinks(vaultPath, canonical!.id)
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].sourceTitle).toBe('Source')

    const graph = getGraphData(vaultPath)
    expect(graph.edges).toContainEqual({ source: source!.id, target: canonical!.id })

    closeDatabase()
  })

  it('should build property table rows from frontmatter and index metadata', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const notePath = join(vaultPath, 'Project.md')
    writeFileSync(notePath, [
      '---',
      'title: Project Display',
      'aliases:',
      '  - Project Alias',
      'tags:',
      '  - research',
      'status: active',
      'priority: 2',
      'cssclasses:',
      '  - wide-page',
      '---',
      '# Project',
      '',
      'Body.'
    ].join('\n'))

    indexNote(vaultPath, notePath)

    const rows = getPropertyRows(vaultPath)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      title: 'Project Display',
      filePath: 'Project.md',
      properties: {
        title: 'Project Display',
        aliases: ['Project Alias'],
        tags: ['research'],
        status: 'active',
        priority: 2,
        cssclasses: ['wide-page']
      }
    })

    closeDatabase()
  })

  it('should index Obsidian Dataview inline fields as properties', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Project.md')
    const sourcePath = join(vaultPath, 'Source.md')
    writeFileSync(targetPath, [
      '# Project',
      '',
      'title:: Inline Project',
      'alias:: Inline Alias',
      'status:: active',
      'priority:: 2',
      'published:: true',
      'tags:: #research, active',
      'cssclass:: wide-page'
    ].join('\n'))
    writeFileSync(sourcePath, '# Source\n\nSee [[Inline Alias]] for context.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const project = getAllNotes(vaultPath).find((note) => note.filePath === 'Project.md')
    const source = getAllNotes(vaultPath).find((note) => note.filePath === 'Source.md')
    expect(project).toBeTruthy()
    expect(source).toBeTruthy()
    expect(project!.title).toBe('Inline Project')

    expect(getOutgoingLinks(vaultPath, source!.id)[0]).toMatchObject({ targetPath: 'Project.md', resolved: true })

    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Project.md')
    expect(row).toMatchObject({
      properties: {
        title: 'Inline Project',
        aliases: ['Inline Alias'],
        tags: ['active', 'research'],
        status: 'active',
        priority: 2,
        published: true,
        cssclasses: ['wide-page']
      }
    })

    closeDatabase()
  })
})
