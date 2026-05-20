import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from 'fs'
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
    const { getAllNotes } = await import('../packages/main/src/services/indexer')
    const { indexVault } = await import('../packages/main/src/services/vault-indexer')
    const first = join(vaultPath, 'First.md')
    const second = join(vaultPath, 'Second.md')
    writeFileSync(first, '# First\n\n[[Second]] #tag')
    writeFileSync(second, '# Second')

    const progress: { current: number; total: number }[] = []
    expect(await indexVault(vaultPath, (event) => progress.push(event))).toEqual({ indexed: 2 })
    expect(getAllNotes(vaultPath).map((note) => note.title).sort()).toEqual(['First', 'Second'])
    expect(progress.at(-1)).toEqual({ current: 2, total: 2 })

    unlinkSync(second)
    expect(await indexVault(vaultPath)).toEqual({ indexed: 1 })
    expect(getAllNotes(vaultPath).map((note) => note.title)).toEqual(['First'])
  })
})
