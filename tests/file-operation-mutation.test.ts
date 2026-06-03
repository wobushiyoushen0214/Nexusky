import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('file operation mutation service', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-file-operation-mutation-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('resolves absolute paths inside the vault without treating them as relative paths', async () => {
    const { resolveVaultPath } = await import('../packages/main/src/services/file-operation-mutation')
    const absolutePath = join(vaultPath, 'Project.md')

    expect(resolveVaultPath(vaultPath, absolutePath)).toBe(absolutePath)
    expect(resolveVaultPath(vaultPath, join(vaultPath, '..', 'escape.md'))).toBeNull()
  })

  it('renames markdown through the shared operation pipeline and updates wikilinks', async () => {
    const { renameVaultMarkdownWithLinkUpdates } = await import('../packages/main/src/services/file-operation-mutation')
    const sourcePath = join(vaultPath, 'Rename.md')
    const targetPath = join(vaultPath, 'Renamed.md')
    writeFileSync(sourcePath, '# Rename\n', 'utf-8')
    writeFileSync(join(vaultPath, 'Linker.md'), 'See [[Rename]] and [[Rename#Details|details]]', 'utf-8')

    const result = await renameVaultMarkdownWithLinkUpdates({
      vaultPath,
      sourcePath,
      targetPath,
      source: 'agent',
      reason: 'test_rename'
    })

    expect(result.ok).toBe(true)
    expect(existsSync(sourcePath)).toBe(false)
    expect(existsSync(targetPath)).toBe(true)
    expect(readFileSync(join(vaultPath, 'Linker.md'), 'utf-8')).toBe('See [[Renamed]] and [[Renamed#Details|details]]')
    expect(result.afterHashes.map((entry) => entry.filePath)).toContain('Linker.md')
    expect(readFileSync(join(vaultPath, '.nexusky', 'file-operations.jsonl'), 'utf-8')).toContain('"kind":"rename"')
  })

  it('moves deleted files to trash with metadata and audit trail', async () => {
    const { deleteVaultPath } = await import('../packages/main/src/services/file-operation-mutation')
    const filePath = join(vaultPath, 'Delete.md')
    writeFileSync(filePath, 'delete me', 'utf-8')

    const result = await deleteVaultPath({
      vaultPath,
      filePath,
      source: 'file_ipc',
      reason: 'test_delete'
    })

    expect(result.ok).toBe(true)
    expect(existsSync(filePath)).toBe(false)
    expect(result.trashPath && existsSync(result.trashPath)).toBe(true)
    expect(result.trashPath && readFileSync(`${result.trashPath}.json`, 'utf-8')).toContain('"originalPath":"Delete.md"')
    expect(readFileSync(join(vaultPath, '.nexusky', 'file-operations.jsonl'), 'utf-8')).toContain('"risk":"delete"')
  })

  it('rejects move targets that already exist without overwriting user data', async () => {
    const { moveVaultPath } = await import('../packages/main/src/services/file-operation-mutation')
    const sourcePath = join(vaultPath, 'A.md')
    const targetPath = join(vaultPath, 'B.md')
    writeFileSync(sourcePath, 'source', 'utf-8')
    writeFileSync(targetPath, 'target', 'utf-8')

    const result = await moveVaultPath({ vaultPath, sourcePath, targetPath })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('target_file_exists')
    expect(readFileSync(sourcePath, 'utf-8')).toBe('source')
    expect(readFileSync(targetPath, 'utf-8')).toBe('target')
  })
})
