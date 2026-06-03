import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('vault file mutation service', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-vault-mutation-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('previews and applies an update mutation with stable content hashes', async () => {
    const {
      applyVaultFileMutation,
      createVaultFileUpdateMutation,
      hashContent,
      previewVaultFileMutation
    } = await import('../packages/main/src/services/vault-mutation')
    const absolutePath = join(vaultPath, 'Topic.md')
    writeFileSync(absolutePath, '# Topic\n\nbefore\n', 'utf-8')

    const mutation = createVaultFileUpdateMutation({
      filePath: 'Topic.md',
      absolutePath,
      beforeContent: '# Topic\n\nbefore\n',
      afterContent: '# Topic\n\nafter\n'
    })
    const preview = previewVaultFileMutation(mutation, 'Update topic')

    expect(preview).toMatchObject({
      filePath: 'Topic.md',
      summary: 'Update topic',
      before: '# Topic\n\nbefore\n',
      after: '# Topic\n\nafter\n',
      createsFile: false,
      deletesFile: false
    })
    expect(preview.beforeHash).toBe(hashContent('# Topic\n\nbefore\n'))
    expect(preview.afterHash).toBe(hashContent('# Topic\n\nafter\n'))

    applyVaultFileMutation(vaultPath, mutation)

    expect(readFileSync(absolutePath, 'utf-8')).toBe('# Topic\n\nafter\n')
  })

  it('restores a created file by moving it to the vault trash', async () => {
    const {
      applyVaultFileMutation,
      createVaultFileCreateMutation,
      restoreVaultFileMutationBeforeState
    } = await import('../packages/main/src/services/vault-mutation')
    const absolutePath = join(vaultPath, 'New.md')
    const mutation = createVaultFileCreateMutation({
      filePath: 'New.md',
      absolutePath,
      afterContent: '# New\n\n'
    })

    applyVaultFileMutation(vaultPath, mutation)
    expect(existsSync(absolutePath)).toBe(true)

    restoreVaultFileMutationBeforeState(vaultPath, mutation)

    expect(existsSync(absolutePath)).toBe(false)
    const trashEntries = readdirSync(join(vaultPath, '.trash'))
    expect(trashEntries.some((entry) => entry.endsWith('_New.md'))).toBe(true)
  })
})
