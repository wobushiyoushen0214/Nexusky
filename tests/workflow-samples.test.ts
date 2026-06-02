import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { SAMPLE_WORKFLOW_VAULTS, WORKFLOW_SAMPLE_VAULT_IDS, getWorkflowSampleVault } from '../packages/shared/src/workflow-samples'
import { getWorkflowSampleSupportFiles } from '../packages/shared/src/workflow-sample-support'
import { createWorkflowSampleVault } from '../packages/main/src/services/workflow-samples'
import { closeDatabase } from '../packages/main/src/services/database'
import { getAllNotes } from '../packages/main/src/services/indexer'

let tempDir: string | null = null

describe('workflow sample vaults', () => {
  afterEach(() => {
    closeDatabase()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('defines one real Markdown sample vault for every planned professional workflow', () => {
    expect(SAMPLE_WORKFLOW_VAULTS.map((sample) => sample.id)).toEqual([...WORKFLOW_SAMPLE_VAULT_IDS])

    for (const sample of SAMPLE_WORKFLOW_VAULTS) {
      expect(sample.files.length).toBeGreaterThanOrEqual(5)
      expect(sample.files.some((file) => file.path === 'README.md')).toBe(true)
      expect(sample.files.every((file) => file.path.endsWith('.md'))).toBe(true)
      expect(sample.files.some((file) => file.content.includes('weekly-review'))).toBe(true)
      expect(sample.files.some((file) => file.content.includes('- [ ]'))).toBe(true)
      expect(sample.files.some((file) => /\[\[[^\]]+\]\]/.test(file.content))).toBe(true)
      expect(sample.files.some((file) => file.content.includes('[[Maintenance/Workflow Rules]]'))).toBe(true)
      const supportFiles = getWorkflowSampleSupportFiles(sample.id)
      expect(supportFiles.some((file) => file.path === 'Maintenance/Workflow Rules.md')).toBe(true)
      expect(supportFiles.some((file) => file.path === `.nexusky/templates/${sample.id}.json`)).toBe(true)
    }

    expect(getWorkflowSampleVault('research')?.files.some((file) => file.path.startsWith('Literature/'))).toBe(true)
    expect(getWorkflowSampleVault('writing')?.files.some((file) => file.path.startsWith('Drafts/'))).toBe(true)
    expect(getWorkflowSampleVault('developer')?.files.some((file) => file.path.startsWith('ADR/'))).toBe(true)
    expect(getWorkflowSampleVault('learning')?.files.some((file) => file.path.startsWith('Courses/'))).toBe(true)
  })

  it('writes and indexes a selected sample vault without overwriting an existing one', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'nexusky-workflow-sample-'))

    const first = await createWorkflowSampleVault(tempDir, 'developer')
    const second = await createWorkflowSampleVault(tempDir, 'developer')

    expect(first).toEqual(expect.objectContaining({ files: 7, indexed: 6 }))
    expect(second).toEqual(expect.objectContaining({ files: 7, indexed: 6 }))
    expect(first?.vaultPath).not.toBe(second?.vaultPath)
    expect(first?.vaultPath.endsWith('Nexusky Developer Sample')).toBe(true)
    expect(second?.vaultPath.endsWith('Nexusky Developer Sample 2')).toBe(true)

    const adrPath = join(first!.vaultPath, 'ADR', 'ADR-0001 Local SQLite Index.md')
    expect(existsSync(adrPath)).toBe(true)
    expect(readFileSync(adrPath, 'utf-8')).toContain('type: adr')
    expect(readFileSync(join(first!.vaultPath, 'Maintenance', 'Workflow Rules.md'), 'utf-8')).toContain('## Health')
    const templatePack = JSON.parse(readFileSync(join(first!.vaultPath, '.nexusky', 'templates', 'developer.json'), 'utf-8')) as { templates: { id: string }[] }
    expect(templatePack.templates.map((template) => template.id)).toEqual(['developer-adr', 'developer-debug-note', 'developer-review'])
    expect(getAllNotes(first!.vaultPath).map((note) => note.filePath).sort()).toContain('API/Publish Export Contract.md')
  })
})
