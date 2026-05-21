import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

describe('note search', () => {
  let vaultPath = ''

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
  })

  function createVault(): string {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-note-search-'))
    return vaultPath
  }

  it('finds notes by nested file path for Obsidian path wikilinks', async () => {
    const { indexNote } = await import('../packages/main/src/services/indexer')
    const { searchNotes } = await import('../packages/main/src/services/note-search')
    const vault = createVault()
    mkdirSync(join(vault, 'Folder'), { recursive: true })
    const notePath = join(vault, 'Folder', 'Target.md')
    writeFileSync(notePath, '# Target\n\nNested note.')

    indexNote(vault, notePath)

    expect(searchNotes(vault, 'Folder/Target')).toMatchObject([
      { title: 'Target', filePath: 'Folder/Target.md', aliasMatch: undefined }
    ])
  })
})
