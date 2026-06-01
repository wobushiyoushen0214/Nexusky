import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { executeSyncPlan, toLocalFileInfos } from '../packages/main/src/services/cloud/sync-execute'
import type { SyncPlan } from '../packages/main/src/services/cloud/sync-reconcile'

function emptyPlan(): SyncPlan {
  return { push: [], pull: [], deleteRemote: [], deleteLocal: [], conflicts: [] }
}

describe('executeSyncPlan', () => {
  let vaultPath: string
  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-sync-exec-'))
  })
  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('invokes push/pull/deleteRemote and counts results', async () => {
    const calls = { push: [] as string[], pull: [] as string[], del: [] as string[] }
    const provider = {
      pushFile: async (_v: string, fp: string) => { calls.push.push(fp); return true },
      pullFile: async (_v: string, rp: string) => { calls.pull.push(rp); return true },
      deleteRemote: async (rp: string) => { calls.del.push(rp); return true }
    }
    const plan: SyncPlan = { push: ['a.md'], pull: ['b.md'], deleteRemote: ['c.md'], deleteLocal: [], conflicts: [] }
    const outcome = await executeSyncPlan(vaultPath, plan, provider)
    expect(outcome.pushed).toBe(1)
    expect(outcome.pulled).toBe(1)
    expect(outcome.deletedRemote).toBe(1)
    expect(calls.push[0]).toBe(join(vaultPath, 'a.md'))
    expect(calls.pull).toEqual(['b.md'])
    expect(calls.del).toEqual(['c.md'])
  })

  it('moves local files referenced by deleteLocal to vault trash for recovery', async () => {
    const target = join(vaultPath, 'old.md')
    writeFileSync(target, 'bye')
    const provider = {
      pushFile: async () => true,
      pullFile: async () => true,
      deleteRemote: async () => true
    }
    const plan: SyncPlan = { ...emptyPlan(), deleteLocal: ['old.md'] }
    const outcome = await executeSyncPlan(vaultPath, plan, provider)
    expect(existsSync(target)).toBe(false)
    expect(outcome.deletedLocal).toBe(1)
    const trashDir = join(vaultPath, '.trash')
    const trashed = readdirSync(trashDir).find((entry) => entry.endsWith('_old.md'))
    expect(trashed).toBeTruthy()
    expect(readFileSync(join(trashDir, trashed!), 'utf-8')).toBe('bye')
    expect(readFileSync(join(trashDir, `${trashed}.json`), 'utf-8')).toContain('"reason":"sync_remote_delete"')
  })

  it('records an error when an operation fails', async () => {
    const provider = {
      pushFile: async () => false,
      pullFile: async () => true,
      deleteRemote: async () => true
    }
    const plan: SyncPlan = { ...emptyPlan(), push: ['x.md'] }
    const outcome = await executeSyncPlan(vaultPath, plan, provider)
    expect(outcome.pushed).toBe(0)
    expect(outcome.errors).toHaveLength(1)
  })

  it('toLocalFileInfos hashes existing files and skips missing ones', () => {
    writeFileSync(join(vaultPath, 'f.md'), 'hello')
    const infos = toLocalFileInfos(vaultPath, [join(vaultPath, 'f.md'), join(vaultPath, 'missing.md')])
    expect(infos).toHaveLength(1)
    expect(infos[0].relPath).toBe('f.md')
    expect(infos[0].hash).toHaveLength(32)
  })
})
