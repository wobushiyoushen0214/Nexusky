import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('applyAiEditMutation', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-ai-edit-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('applies an AI edit through the vault mutation writer and saves a history snapshot', async () => {
    const { applyAiEditMutation } = await import('../packages/main/src/services/ai/edit-application')
    const { hashContent } = await import('../packages/main/src/services/vault-mutation')
    const filePath = join(vaultPath, 'Topic.md')
    writeFileSync(filePath, '# Topic\n\nbefore\n', 'utf-8')

    const result = await applyAiEditMutation({
      vaultPath,
      filePath,
      content: '# Topic\n\nafter\n',
      expectedBeforeHash: hashContent('# Topic\n\nbefore\n')
    })

    expect(result).toMatchObject({
      success: true,
      filePath: 'Topic.md',
      created: false,
      beforeHash: hashContent('# Topic\n\nbefore\n'),
      afterHash: hashContent('# Topic\n\nafter\n')
    })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Topic\n\nafter\n')
    expect(readdirSync(join(vaultPath, '.history')).some((entry) => entry.startsWith('Topic_') && entry.endsWith('.md'))).toBe(true)
  })

  it('rejects a stale AI edit preview without changing the file', async () => {
    const { applyAiEditMutation } = await import('../packages/main/src/services/ai/edit-application')
    const { hashContent } = await import('../packages/main/src/services/vault-mutation')
    const filePath = join(vaultPath, 'Topic.md')
    writeFileSync(filePath, '# Topic\n\nchanged elsewhere\n', 'utf-8')

    const result = await applyAiEditMutation({
      vaultPath,
      filePath,
      content: '# Topic\n\nAI after\n',
      expectedBeforeHash: hashContent('# Topic\n\nbefore\n')
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('预览后文件已变化')
    expect(readFileSync(filePath, 'utf-8')).toBe('# Topic\n\nchanged elsewhere\n')
  })

  it('creates a new AI edit note only when creation is explicitly allowed', async () => {
    const { applyAiEditMutation } = await import('../packages/main/src/services/ai/edit-application')
    const filePath = join(vaultPath, 'Draft.md')

    const rejected = await applyAiEditMutation({
      vaultPath,
      filePath,
      content: '# Draft\n\nbody\n'
    })
    expect(rejected.success).toBe(false)
    expect(existsSync(filePath)).toBe(false)

    const created = await applyAiEditMutation({
      vaultPath,
      filePath,
      content: '# Draft\n\nbody\n',
      allowCreate: true
    })
    expect(created).toMatchObject({
      success: true,
      filePath: 'Draft.md',
      created: true
    })
    expect(readFileSync(filePath, 'utf-8')).toBe('# Draft\n\nbody\n')
  })
})
