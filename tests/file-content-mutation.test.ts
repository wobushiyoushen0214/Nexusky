import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('file content mutation service', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-file-content-mutation-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('reads content with a hash and applies a guarded update through VaultMutation', async () => {
    const { applyVaultContentMutation, readVaultFileWithHash } = await import('../packages/main/src/services/file-content-mutation')
    const filePath = join(vaultPath, 'Links.md')
    writeFileSync(filePath, '# Links\n\nMention Project\n', 'utf-8')

    const read = await readVaultFileWithHash(vaultPath, filePath)
    expect(read).toMatchObject({
      filePath: 'Links.md',
      content: '# Links\n\nMention Project\n'
    })

    const result = await applyVaultContentMutation({
      vaultPath,
      filePath,
      content: '# Links\n\nMention [[Project]]\n',
      expectedBeforeHash: read.hash
    })

    expect(result).toMatchObject({
      success: true,
      filePath: 'Links.md',
      created: false,
      beforeHash: read.hash
    })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Links\n\nMention [[Project]]\n')
    expect(readdirSync(join(vaultPath, '.history')).some((entry) => entry.startsWith('Links_') && entry.endsWith('.md'))).toBe(true)
  })

  it('rejects stale guarded updates without overwriting external edits', async () => {
    const { applyVaultContentMutation, readVaultFileWithHash } = await import('../packages/main/src/services/file-content-mutation')
    const filePath = join(vaultPath, 'Links.md')
    writeFileSync(filePath, '# Links\n\nMention Project\n', 'utf-8')
    const read = await readVaultFileWithHash(vaultPath, filePath)

    writeFileSync(filePath, '# Links\n\nUser changed this file\n', 'utf-8')
    const result = await applyVaultContentMutation({
      vaultPath,
      filePath,
      content: '# Links\n\nMention [[Project]]\n',
      expectedBeforeHash: read.hash
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('预览后文件已变化')
    expect(readFileSync(filePath, 'utf-8')).toBe('# Links\n\nUser changed this file\n')
  })

  it('creates new content only when creation is explicitly allowed', async () => {
    const { applyVaultContentMutation } = await import('../packages/main/src/services/file-content-mutation')
    const filePath = join(vaultPath, 'Project.md')

    const rejected = await applyVaultContentMutation({
      vaultPath,
      filePath,
      content: '# Project\n\n'
    })
    expect(rejected.success).toBe(false)
    expect(existsSync(filePath)).toBe(false)

    const created = await applyVaultContentMutation({
      vaultPath,
      filePath,
      content: '# Project\n\n',
      allowCreate: true
    })
    expect(created).toMatchObject({
      success: true,
      filePath: 'Project.md',
      created: true
    })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Project\n\n')
  })
})
