import { createHash } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { logger } from '../logger'
import type { LocalFileInfo, SyncPlan } from './sync-reconcile'
import { moveFileToVaultTrash } from '../version-recovery'

/** The subset of a provider needed to apply a sync plan. */
export interface SyncPlanExecutor {
  pushFile(vaultPath: string, filePath: string): Promise<boolean>
  pullFile(vaultPath: string, relPath: string): Promise<boolean>
  deleteRemote(relPath: string): Promise<boolean>
}

export interface SyncExecOutcome {
  pushed: number
  pulled: number
  deletedRemote: number
  deletedLocal: number
  errors: string[]
}

async function runConcurrent(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      await tasks[i]()
    }
  }
  const workers = Math.min(Math.max(1, concurrency), tasks.length || 1)
  await Promise.all(Array.from({ length: workers }, () => worker()))
}

/** Read a list of absolute file paths into reconcile inputs (relPath, hash, mtime). */
export function toLocalFileInfos(vaultPath: string, filePaths: string[]): LocalFileInfo[] {
  const infos: LocalFileInfo[] = []
  for (const filePath of filePaths) {
    try {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath)
      infos.push({
        relPath,
        hash: createHash('md5').update(content).digest('hex'),
        mtimeMs: statSync(filePath).mtimeMs
      })
    } catch {
      // A file that vanished between listing and hashing is simply skipped.
    }
  }
  return infos
}

/**
 * Apply a SyncPlan: push/pull/deleteRemote run concurrently; local deletions
 * run afterwards on the filesystem. Returns per-action counts and errors.
 */
export async function executeSyncPlan(
  vaultPath: string,
  plan: SyncPlan,
  provider: SyncPlanExecutor,
  concurrency = 5
): Promise<SyncExecOutcome> {
  const outcome: SyncExecOutcome = { pushed: 0, pulled: 0, deletedRemote: 0, deletedLocal: 0, errors: [] }

  const tasks: (() => Promise<void>)[] = []
  for (const relPath of plan.push) {
    tasks.push(async () => {
      if (await provider.pushFile(vaultPath, join(vaultPath, relPath))) outcome.pushed++
      else outcome.errors.push(`push failed: ${relPath}`)
    })
  }
  for (const relPath of plan.pull) {
    tasks.push(async () => {
      if (await provider.pullFile(vaultPath, relPath)) outcome.pulled++
      else outcome.errors.push(`pull failed: ${relPath}`)
    })
  }
  for (const relPath of plan.deleteRemote) {
    tasks.push(async () => {
      if (await provider.deleteRemote(relPath)) outcome.deletedRemote++
      else outcome.errors.push(`delete remote failed: ${relPath}`)
    })
  }
  await runConcurrent(tasks, concurrency)

  // Local deletions are filesystem ops; run after remote work, synchronously.
  for (const relPath of plan.deleteLocal) {
    try {
      const full = join(vaultPath, relPath)
      if (existsSync(full)) {
        const trashPath = moveFileToVaultTrash(vaultPath, full, 'sync_remote_delete')
        if (trashPath) {
          outcome.deletedLocal++
          logger.info('Sync moved local file to trash (deleted on another device)', { relPath })
        } else {
          outcome.errors.push(`delete local failed: ${relPath}`)
        }
      }
    } catch {
      outcome.errors.push(`delete local failed: ${relPath}`)
    }
  }

  return outcome
}
