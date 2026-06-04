import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { collectSyncLocalFiles, shouldSyncRelPath } from '../packages/main/src/services/cloud/sync-files'
import { executeSyncPlan, toLocalFileInfos, type SyncPlanExecutor } from '../packages/main/src/services/cloud/sync-execute'
import { planSync, type SyncManifest } from '../packages/main/src/services/cloud/sync-reconcile'
import { saveVersionSnapshot } from '../packages/main/src/services/version-recovery'
import type { SyncFileInfo } from '../packages/main/src/services/cloud/provider'

interface SyncDisasterFixtureModule {
  createSyncDisasterRecoveryFixture: (options: { out: string; force?: boolean }) => Promise<{
    outDir: string
    vaultPath: string
    remotePath: string
    manifest: SyncManifest
    scenarios: { id: string; relPath: string; expectedPlan: string }[]
  }>
  parseArgs: (argv: string[]) => Record<string, string | boolean>
}

class LocalDirectorySyncProvider implements SyncPlanExecutor {
  constructor(private readonly remotePath: string) {}

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const targetPath = join(this.remotePath, relPath)
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(filePath, targetPath)
    const localStat = await stat(filePath)
    await utimes(targetPath, localStat.mtime, localStat.mtime)
    return true
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const sourcePath = join(this.remotePath, relPath)
    const targetPath = join(vaultPath, relPath)
    if (existsSync(targetPath)) saveVersionSnapshot(vaultPath, targetPath)
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
    const remoteStat = await stat(sourcePath)
    await utimes(targetPath, remoteStat.mtime, remoteStat.mtime)
    return true
  }

  async deleteRemote(relPath: string): Promise<boolean> {
    await rm(join(this.remotePath, relPath), { force: true })
    return true
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const files: SyncFileInfo[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relPath = relative(this.remotePath, fullPath).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile() && shouldSyncRelPath(relPath)) {
          const content = await readFile(fullPath)
          const fileStat = await stat(fullPath)
          files.push({
            path: relPath,
            hash: createHash('md5').update(content).digest('hex'),
            updatedAt: fileStat.mtime.toISOString()
          })
        }
      }
    }
    await walk(this.remotePath)
    return files.sort((a, b) => a.path.localeCompare(b.path))
  }
}

let fixture!: SyncDisasterFixtureModule

beforeAll(async () => {
  fixture = (await import('../scripts/create-sync-disaster-recovery-fixture.mjs')) as unknown as SyncDisasterFixtureModule
})

describe('sync disaster recovery drill', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function tempFixtureRoot(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'nexusky-sync-drill-'))
    tempDirs.push(dir)
    return dir
  }

  it('creates a deterministic local vault and fake remote fixture', async () => {
    const out = await tempFixtureRoot()

    const result = await fixture.createSyncDisasterRecoveryFixture({ out, force: true })
    const metadata = JSON.parse(await readFile(join(out, '.nexusky-sync-disaster-fixture.json'), 'utf8')) as { scenarios: unknown[] }

    expect(result.scenarios.map((scenario) => scenario.expectedPlan).sort()).toEqual([
      'conflict',
      'deleteLocal',
      'deleteRemote',
      'pull',
      'push'
    ])
    expect(metadata.scenarios).toHaveLength(5)
    expect(await readFile(join(out, 'README.md'), 'utf8')).toContain('Sync Disaster Recovery Fixture')
    await expect(fixture.createSyncDisasterRecoveryFixture({ out })).rejects.toThrow('not empty')
    expect(fixture.parseArgs(['--out', '/tmp/drill', '--force'])).toEqual({ out: '/tmp/drill', force: true })
  })

  it('exercises delete, overwrite, stale remote, and conflict recovery paths', async () => {
    const out = await tempFixtureRoot()
    const result = await fixture.createSyncDisasterRecoveryFixture({ out, force: true })
    const provider = new LocalDirectorySyncProvider(result.remotePath)
    const localFiles = toLocalFileInfos(result.vaultPath, collectSyncLocalFiles(result.vaultPath))
    const remoteFiles = await provider.listRemoteFiles()

    const plan = planSync({
      localFiles,
      remoteFiles,
      manifest: result.manifest
    })

    expect(plan.deleteLocal).toEqual(['Notes/Remote Deleted.md'])
    expect(plan.deleteRemote).toEqual(['Notes/Local Deleted.md'])
    expect(plan.push).toEqual(['Notes/Remote Older.md'])
    expect(plan.pull).toEqual(['Notes/Remote Overwrite.md'])
    expect(plan.conflicts.map((conflict) => conflict.path)).toEqual(['Notes/Conflict.md'])

    const outcome = await executeSyncPlan(result.vaultPath, plan, provider)

    expect(outcome).toMatchObject({
      pushed: 1,
      pulled: 1,
      deletedRemote: 1,
      deletedLocal: 1,
      errors: []
    })

    const trashDir = join(result.vaultPath, '.trash')
    const trashEntry = (await readdir(trashDir)).find((entry) => entry.endsWith('_Remote Deleted.md'))
    expect(trashEntry).toBeTruthy()
    expect(await readFile(join(trashDir, trashEntry!), 'utf8')).toContain('Baseline copy before another device deleted it remotely')
    const trashMetadata = JSON.parse(await readFile(join(trashDir, `${trashEntry}.json`), 'utf8')) as { originalPath: string; reason: string }
    expect(trashMetadata).toMatchObject({
      originalPath: 'Notes/Remote Deleted.md',
      reason: 'sync_remote_delete'
    })

    expect(existsSync(join(result.remotePath, 'Notes/Local Deleted.md'))).toBe(false)
    expect(await readFile(join(result.remotePath, 'Notes/Remote Older.md'), 'utf8')).toContain('Newer local draft')

    expect(await readFile(join(result.vaultPath, 'Notes/Remote Overwrite.md'), 'utf8')).toContain('Newer remote edit')
    const historyEntries = await readdir(join(result.vaultPath, '.history', 'Notes'))
    const overwriteSnapshot = historyEntries.find((entry) => entry.startsWith('Remote Overwrite_') && entry.endsWith('.md'))
    expect(overwriteSnapshot).toBeTruthy()
    expect(await readFile(join(result.vaultPath, '.history', 'Notes', overwriteSnapshot!), 'utf8')).toContain('Local draft that should be recoverable')

    expect(await readFile(join(result.vaultPath, 'Notes/Conflict.md'), 'utf8')).toContain('Local concurrent edit')
    expect(await readFile(join(result.remotePath, 'Notes/Conflict.md'), 'utf8')).toContain('Remote concurrent edit')
  })
})
