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
})
