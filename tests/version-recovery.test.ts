import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { moveFileToVaultTrash, saveVersionSnapshot } from '../packages/main/src/services/version-recovery'

function writeTestFile(vaultPath: string, relPath: string, content: string): string {
  const filePath = join(vaultPath, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

describe('version recovery helpers', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-version-recovery-'))
  })

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('saves a Markdown snapshot that HistoryPanel can discover before sync overwrites the file', () => {
    const filePath = writeTestFile(vaultPath, 'Projects/Roadmap.md', '# Roadmap\n\nlocal draft')

    const snapshotPath = saveVersionSnapshot(vaultPath, filePath)

    expect(snapshotPath).toBeTruthy()
    expect(existsSync(snapshotPath!)).toBe(true)
    expect(readFileSync(snapshotPath!, 'utf-8')).toContain('local draft')
    const historyEntries = readdirSync(join(vaultPath, '.history', 'Projects'))
    expect(historyEntries.some((entry) => entry.startsWith('Roadmap_') && entry.endsWith('.md'))).toBe(true)
  })

  it('moves files to trash with original path metadata before sync deletes the local copy', () => {
    const filePath = writeTestFile(vaultPath, 'Projects/Ghost.md', '# Ghost\n')

    const trashPath = moveFileToVaultTrash(vaultPath, filePath, 'sync_remote_delete')

    expect(trashPath).toBeTruthy()
    expect(existsSync(filePath)).toBe(false)
    expect(readFileSync(trashPath!, 'utf-8')).toBe('# Ghost\n')
    const metadata = JSON.parse(readFileSync(`${trashPath}.json`, 'utf-8')) as { originalPath: string; reason: string }
    expect(metadata.originalPath).toBe('Projects/Ghost.md')
    expect(metadata.reason).toBe('sync_remote_delete')
  })
})
