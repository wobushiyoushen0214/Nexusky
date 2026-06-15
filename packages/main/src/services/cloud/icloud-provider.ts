import { SyncProvider, SyncFileInfo, SyncResult } from './provider'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync, unlinkSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { store } from '../store'
import { logger } from '../logger'
import { readManifest, writeManifest } from './sync-manifest'
import { planSync, manifestFromLocal } from './sync-reconcile'
import { executeSyncPlan, toLocalFileInfos } from './sync-execute'
import { collectSyncLocalFiles } from './sync-files'
import { saveVersionSnapshot } from '../version-recovery'

const ICLOUD_CONTAINER = 'iCloud~com~nexusky~notes'

function getICloudBasePath(): string | null {
  const custom = store.get('icloudPath') as string | undefined
  if (custom && existsSync(custom)) {
    logger.info('iCloud: using custom path', { path: custom })
    return custom
  }

  // 尝试多种 iCloud 路径
  const paths = [
    // 1. 专用容器（如果应用有专用容器）
    join(homedir(), 'Library', 'Mobile Documents', ICLOUD_CONTAINER, 'Documents'),

    // 2. 通用 iCloud Drive 根目录下的 Nexusky 文件夹
    join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Nexusky'),

    // 3. 用户可能会在 iCloud Drive 根目录创建其他名称
    join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Notes'),

    // 4. 某些系统可能使用这个路径
    join(homedir(), 'Library', 'Mobile Documents', 'iCloud~com~apple~CloudDocs', 'Nexusky'),
  ]

  for (const path of paths) {
    try {
      if (existsSync(path)) {
        logger.info('iCloud: auto-detected path', { path })
        return path
      }
    } catch (error) {
      logger.warn('iCloud: cannot access path', { path, error })
    }
  }

  logger.warn('iCloud: no accessible path found. Paths tried:', { paths })
  return null
}

export class ICloudSyncProvider implements SyncProvider {
  readonly type = 'icloud' as const
  readonly name = 'iCloud Drive'

  getBasePath(): string | null {
    return getICloudBasePath()
  }

  getAttemptedPaths(): string[] {
    return [
      join(homedir(), 'Library', 'Mobile Documents', ICLOUD_CONTAINER, 'Documents'),
      join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Nexusky'),
      join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Notes'),
      join(homedir(), 'Library', 'Mobile Documents', 'iCloud~com~apple~CloudDocs', 'Nexusky'),
    ]
  }

  isConfigured(): boolean {
    return getICloudBasePath() !== null
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const base = getICloudBasePath()
    if (!base) {
      const hint = `未找到 iCloud Drive 路径。请确保：
1. 已登录 iCloud
2. 已启用 iCloud Drive
3. 授予 Nexusky "完全磁盘访问权限"（系统偏好设置 > 安全性与隐私 > 隐私 > 完全磁盘访问权限）
4. 或手动指定一个 iCloud Drive 路径`
      logger.warn('iCloud testConnection failed', { hint })
      return { ok: false, error: hint }
    }

    try {
      // 尝试读取目录以确认访问权限
      const { readdirSync } = require('fs')
      readdirSync(base)
      logger.info('iCloud testConnection success', { base })
      return { ok: true }
    } catch (error) {
      const errorMsg = `无法访问 iCloud Drive 路径 (${base})。请授予 Nexusky "完全磁盘访问权限"。`
      logger.error('iCloud testConnection error', { base, error })
      return { ok: false, error: errorMsg }
    }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const base = getICloudBasePath()
    if (!base) {
      logger.warn('iCloud push failed: base path not available')
      return false
    }

    try {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const destPath = join(base, relPath)
      mkdirSync(dirname(destPath), { recursive: true })
      copyFileSync(filePath, destPath)
      logger.info('iCloud push successful', { relPath })
      return true
    } catch (error) {
      logger.error('iCloud push failed', { filePath, error })
      return false
    }
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const base = getICloudBasePath()
    if (!base) {
      logger.warn('iCloud pull failed: base path not available')
      return false
    }

    try {
      const srcPath = join(base, relPath)
      if (!existsSync(srcPath)) {
        logger.warn('iCloud pull failed: remote file not found', { relPath })
        return false
      }

      const destPath = join(vaultPath, relPath)
      if (existsSync(destPath)) {
        saveVersionSnapshot(vaultPath, destPath)
      }
      mkdirSync(dirname(destPath), { recursive: true })
      copyFileSync(srcPath, destPath)
      logger.info('iCloud pull successful', { relPath })
      return true
    } catch (error) {
      logger.error('iCloud pull failed', { relPath, error })
      return false
    }
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
    if (!base) {
      logger.warn('iCloud listRemoteFiles failed: base path not available')
      return []
    }

    try {
      const files = collectSyncLocalFiles(base)
      return files.map((f) => {
        const relPath = relative(base, f).replace(/\\/g, '/')
        const content = readFileSync(f)
        const hash = createHash('md5').update(content).digest('hex')
        const stat = statSync(f)
        return { path: relPath, hash, updatedAt: stat.mtime.toISOString() }
      })
    } catch (error) {
      logger.error('iCloud listRemoteFiles failed', { error })
      return []
    }
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
