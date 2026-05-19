import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('findNoteForAiTool', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-ai-note-lookup-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('finds notes by title, alias, path, and wikilink form', async () => {
    const { indexNote } = await import('../packages/main/src/services/indexer')
    const { findNoteForAiTool } = await import('../packages/main/src/services/ai/note-lookup')

    mkdirSync(join(vaultPath, 'Folder'), { recursive: true })
    const filePath = join(vaultPath, 'Folder', 'Target.md')
    writeFileSync(filePath, [
      '---',
      'aliases:',
      '  - Alias Name',
      '---',
      '# Target',
      '',
      'Body.'
    ].join('\n'))
    indexNote(vaultPath, filePath)

    expect(findNoteForAiTool(vaultPath, 'Target')?.filePath).toBe('Folder/Target.md')
    expect(findNoteForAiTool(vaultPath, 'target')?.filePath).toBe('Folder/Target.md')
    expect(findNoteForAiTool(vaultPath, 'Alias Name')?.filePath).toBe('Folder/Target.md')
    expect(findNoteForAiTool(vaultPath, 'alias name')?.filePath).toBe('Folder/Target.md')
    expect(findNoteForAiTool(vaultPath, 'Folder/Target.md')?.filePath).toBe('Folder/Target.md')
    expect(findNoteForAiTool(vaultPath, '[[Folder/Target#Heading|label]]')?.filePath).toBe('Folder/Target.md')
  })

  it('does not guess between duplicate filenames without a path', async () => {
    const { indexNote } = await import('../packages/main/src/services/indexer')
    const { findNoteForAiTool } = await import('../packages/main/src/services/ai/note-lookup')

    mkdirSync(join(vaultPath, 'A'), { recursive: true })
    mkdirSync(join(vaultPath, 'B'), { recursive: true })
    const first = join(vaultPath, 'A', 'Topic.md')
    const second = join(vaultPath, 'B', 'Topic.md')
    writeFileSync(first, '# Topic\n\nA')
    writeFileSync(second, '# Topic\n\nB')
    indexNote(vaultPath, first)
    indexNote(vaultPath, second)

    expect(findNoteForAiTool(vaultPath, 'Topic')).toBeNull()
    expect(findNoteForAiTool(vaultPath, 'B/Topic')?.filePath).toBe('B/Topic.md')
  })
})
