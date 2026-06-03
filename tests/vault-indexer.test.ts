import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'

describe('vault indexer service', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-vault-indexer-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('collects markdown files while skipping hidden folders', async () => {
    const { collectMarkdownFiles } = await import('../packages/main/src/services/vault-indexer')
    mkdirSync(join(vaultPath, 'Folder'), { recursive: true })
    mkdirSync(join(vaultPath, '.hidden'), { recursive: true })
    writeFileSync(join(vaultPath, 'Root.md'), '# Root')
    writeFileSync(join(vaultPath, 'Folder', 'Nested.md'), '# Nested')
    writeFileSync(join(vaultPath, '.hidden', 'Hidden.md'), '# Hidden')

    const files = collectMarkdownFiles(vaultPath).map((file) => file.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')).sort()

    expect(files).toEqual(['Folder/Nested.md', 'Root.md'])
  })

  it('indexes a vault and removes stale note rows', async () => {
    const { getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')
    const { indexVault } = await import('../packages/main/src/services/vault-indexer')
    const first = join(vaultPath, 'First.md')
    const second = join(vaultPath, 'Second.md')
    writeFileSync(first, '# First\n\n[[Second]] #tag')
    writeFileSync(second, '# Second')

    const progress: { current: number; total: number }[] = []
    expect(await indexVault(vaultPath, (event) => progress.push(event))).toEqual({ indexed: 2 })
    const notes = getAllNotes(vaultPath)
    const firstNote = notes.find((note) => note.title === 'First')
    expect(notes.map((note) => note.title).sort()).toEqual(['First', 'Second'])
    expect(firstNote ? getOutgoingLinks(vaultPath, firstNote.id)[0]?.resolved : false).toBe(true)
    expect(progress.at(-1)).toEqual({ current: 2, total: 2 })

    unlinkSync(second)
    expect(await indexVault(vaultPath)).toEqual({ indexed: 1 })
    expect(getAllNotes(vaultPath).map((note) => note.title)).toEqual(['First'])
  })

  it('preserves note identity and note-backed metadata when a file moves', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const { getAllNotes } = await import('../packages/main/src/services/indexer')
    const { getMemoryPath } = await import('../packages/main/src/services/memory')
    const { indexVault } = await import('../packages/main/src/services/vault-indexer')
    const oldPath = join(vaultPath, 'Original.md')
    const newDir = join(vaultPath, 'Moved')
    const newPath = join(newDir, 'Renamed.md')
    const content = '# Stable Note\n\nKeep this identity.'
    writeFileSync(oldPath, content)

    await indexVault(vaultPath)
    const original = getAllNotes(vaultPath)[0]
    const db = getDatabase(vaultPath)
    db.prepare(`
      INSERT INTO kanban_tasks (id, column_id, title, source_note_id, source_file_path)
      VALUES ('task-identity', 'col-todo', 'Linked task', ?, ?)
    `).run(original.id, original.filePath)
    writeFileSync(getMemoryPath(vaultPath, original.id), JSON.stringify({
      noteId: original.id,
      title: original.title,
      folder: '_root',
      contentHash: original.contentHash,
      concepts: ['Identity'],
      topics: ['Indexing'],
      summary: 'Stable note identity',
      createdAt: 1,
      updatedAt: 1
    }), 'utf-8')

    mkdirSync(newDir, { recursive: true })
    renameSync(oldPath, newPath)
    await indexVault(vaultPath)

    const moved = getAllNotes(vaultPath)
    const task = db.prepare("SELECT source_note_id as sourceNoteId, source_file_path as sourceFilePath FROM kanban_tasks WHERE id = 'task-identity'").get() as { sourceNoteId: string; sourceFilePath: string }
    expect(moved).toHaveLength(1)
    expect(moved[0]).toMatchObject({ id: original.id, title: 'Stable Note', filePath: 'Moved/Renamed.md' })
    expect(existsSync(getMemoryPath(vaultPath, original.id))).toBe(true)
    expect(task).toEqual({ sourceNoteId: original.id, sourceFilePath: 'Moved/Renamed.md' })
  })
})
