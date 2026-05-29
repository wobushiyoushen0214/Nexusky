import { SyncProvider, SyncFileInfo, SyncResult } from './provider'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync, copyFileSync } from 'fs'
import { join, relative, dirname, extname } from 'path'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { store } from '../store'
import { decideSyncSide } from './conflict-detection'

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

function collectFiles(dirPath: string): string[] {
  const results: string[] = []
  if (!existsSync(dirPath)) return results
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.md') results.push(full)
    }
  }
  walk(dirPath)
  return results
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

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const base = getICloudBasePath()
    if (!base) return []

    const files = collectFiles(base)
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

    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }

    const remoteFiles = await this.listRemoteFiles()
    const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]))

    const localFiles = collectFiles(vaultPath)
    result.total = localFiles.length

    for (const filePath of localFiles) {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath)
      const localHash = createHash('md5').update(content).digest('hex')
      const remote = remoteMap.get(relPath)

      if (!remote) {
        const ok = await this.pushFile(vaultPath, filePath)
        if (ok) result.pushed++
        else result.errors.push(`push failed: ${relPath}`)
        remoteMap.delete(relPath)
        continue
      }

      const localMtimeMs = statSync(filePath).mtimeMs
      const remoteMtimeMs = new Date(remote.updatedAt).getTime()
      const side = decideSyncSide({
        localHash,
        remoteHash: remote.hash,
        localMtimeMs,
        remoteMtimeMs
      })

      if (side === 'conflict') {
        result.conflicts.push({ path: relPath, localHash, remoteHash: remote.hash, remoteUpdatedAt: remote.updatedAt })
      } else if (side === 'pull') {
        const ok = await this.pullFile(vaultPath, relPath)
        if (ok) result.pulled++
        else result.errors.push(`pull failed: ${relPath}`)
      } else if (side === 'push') {
        const ok = await this.pushFile(vaultPath, filePath)
        if (ok) result.pushed++
        else result.errors.push(`push failed: ${relPath}`)
      }
      remoteMap.delete(relPath)
    }

    for (const [relPath] of remoteMap) {
      const fullPath = join(vaultPath, relPath)
      if (!existsSync(fullPath)) {
        const ok = await this.pullFile(vaultPath, relPath)
        if (ok) result.pulled++
        else result.errors.push(`pull failed: ${relPath}`)
        result.total++
      }
    }

    return result
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
