import { access, mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getWorkflowSampleVault, type WorkflowSampleVaultId } from '../../../shared/src/workflow-samples'
import { getWorkflowSampleSupportFiles } from '../../../shared/src/workflow-sample-support'
import { indexNote } from './indexer'

export interface CreateWorkflowSampleVaultResult {
  vaultPath: string
  files: number
  indexed: number
}

export async function createWorkflowSampleVault(parentDir: string, id: WorkflowSampleVaultId): Promise<CreateWorkflowSampleVaultResult | null> {
  const sample = getWorkflowSampleVault(id)
  if (!sample) return null

  const vaultPath = await uniqueVaultPath(parentDir, sample.defaultVaultName)
  await mkdir(vaultPath, { recursive: true })
  let indexed = 0
  const files = [...sample.files, ...getWorkflowSampleSupportFiles(id)]

  for (const file of files) {
    const targetPath = join(vaultPath, ...file.path.split('/'))
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, file.content, 'utf-8')
    if (targetPath.endsWith('.md')) {
      try {
        indexNote(vaultPath, targetPath)
        indexed += 1
      } catch {}
    }
  }

  return {
    vaultPath,
    files: files.length,
    indexed
  }
}

async function uniqueVaultPath(parentDir: string, baseName: string): Promise<string> {
  for (let index = 0; index < 1000; index++) {
    const suffix = index === 0 ? '' : ` ${index + 1}`
    const candidate = join(parentDir, `${baseName}${suffix}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  return join(parentDir, `${baseName} ${Date.now()}`)
}
