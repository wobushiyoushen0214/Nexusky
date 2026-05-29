import { SyncProvider, SyncFileInfo, SyncResult } from './provider'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync, unlinkSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { store } from '../store'
import { readManifest, writeManifest } from './sync-manifest'
import { planSync, manifestFromLocal } from './sync-reconcile'
import { executeSyncPlan, toLocalFileInfos } from './sync-execute'
import { collectSyncLocalFiles } from './sync-files'

const ICLOUD_CONTAINER = 'iCloud~com~nexusky~notes'

function getICloudBasePath(): string | null {
  const custom = store.get('icloudPath') as string | undefined
  if (custom && existsSync(custom)) return custom

  const defaultPath = join(
    homedir(),
    'Library',
    'Mobile Documents',
    ICLOUD_CONTAINER,
    'Documents'
  )
  if (existsSync(defaultPath)) return defaultPath

  const genericPath = join(
    homedir(),
    'Library',
    'Mobile Documents',
    'com~apple~CloudDocs',
    'Nexusky'
  )
  if (existsSync(genericPath)) return genericPath

  return null
}

export class ICloudSyncProvider implements SyncProvider {
  readonly type = 'icloud' as const
  readonly name = 'iCloud Drive'

  getBasePath(): string | null {
    return getICloudBasePath()
  }

  isConfigured(): boolean {
    return getICloudBasePath() !== null
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const base = getICloudBasePath()
    if (!base) {
      return { ok: false, error: '未找到 iCloud Drive 路径。请确保已登录 iCloud 并启用 iCloud Drive。' }
    }
    return { ok: true }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const base = getICloudBasePath()
    if (!base) return false

    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const destPath = join(base, relPath)
    mkdirSync(dirname(destPath), { recursive: true })
    copyFileSync(filePath, destPath)
    return true
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const base = getICloudBasePath()
    if (!base) return false

    const srcPath = join(base, relPath)
    if (!existsSync(srcPath)) return false

    const destPath = join(vaultPath, relPath)
    mkdirSync(dirname(destPath), { recursive: true })
    copyFileSync(srcPath, destPath)
    return true
  }

  async deleteRemote(relPath: string): Promise<boolean> {
    const base = getICloudBasePath()
    if (!base) return false
    try {
      const target = join(base, relPath)
      if (existsSync(target)) unlinkSync(target)
      return true
    } catch {
      return false
    }
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const base = getICloudBasePath()
    if (!base) return []

    const files = collectSyncLocalFiles(base)
    return files.map((f) => {
      const relPath = relative(base, f).replace(/\\/g, '/')
      const content = readFileSync(f)
      const hash = createHash('md5').update(content).digest('hex')
      const stat = statSync(f)
      return { path: relPath, hash, updatedAt: stat.mtime.toISOString() }
    })
  }

  async syncAll(vaultPath: string): Promise<SyncResult> {
    const base = getICloudBasePath()
    if (!base) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['iCloud Drive 不可用'] }

    const remoteFiles = await this.listRemoteFiles()
    const localFiles = toLocalFileInfos(vaultPath, collectSyncLocalFiles(vaultPath))
    const manifest = readManifest(vaultPath, this.type)
    const plan = planSync({ localFiles, remoteFiles, manifest })
    const outcome = await executeSyncPlan(vaultPath, plan, this)
    if (outcome.errors.length === 0) {
      writeManifest(vaultPath, this.type, manifestFromLocal(toLocalFileInfos(vaultPath, collectSyncLocalFiles(vaultPath))))
    }
    return {
      total: localFiles.length,
      pushed: outcome.pushed,
      pulled: outcome.pulled,
      conflicts: plan.conflicts,
      errors: outcome.errors
    }
  }

  async pullAll(vaultPath: string): Promise<SyncResult> {
    const base = getICloudBasePath()
    if (!base) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['iCloud Drive 不可用'] }

    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    const remoteFiles = await this.listRemoteFiles()
    result.total = remoteFiles.length

    for (const remote of remoteFiles) {
      const fullPath = join(vaultPath, remote.path)
      let needPull = false

      if (!existsSync(fullPath)) {
        needPull = true
      } else {
        const content = readFileSync(fullPath)
        const localHash = createHash('md5').update(content).digest('hex')
        if (localHash !== remote.hash) needPull = true
      }

      if (needPull) {
        const ok = await this.pullFile(vaultPath, remote.path)
        if (ok) result.pulled++
        else result.errors.push(`pull failed: ${remote.path}`)
      }
    }

    return result
  }
}
