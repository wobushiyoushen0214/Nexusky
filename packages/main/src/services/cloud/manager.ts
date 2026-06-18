import { SyncProvider, SyncProviderType, SyncResult } from './provider'
import { ICloudSyncProvider } from './icloud-provider'
import { OneDriveSyncProvider } from './onedrive-provider'
import { WebDavSyncProvider } from './webdav-provider'
import { S3SyncProvider } from './s3-provider'
import { store } from '../store'
import { join } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { closeDatabase } from '../database'
import { decideSyncSide, md5 } from './conflict-detection'
import { buildCloudSyncPreflightRisks } from '../vault-health'
import type { CloudSyncHealth, CloudSyncHealthStatus } from '@shared/types/ipc'
import { getErrorMessage } from '../../../../shared/src/utils/errors'

const offlineQueue: { vaultPath: string; filePath: string }[] =
  (store.get('offlineQueue') as { vaultPath: string; filePath: string }[] | undefined) || []
let isOnline = true

function persistQueue(): void {
  store.set('offlineQueue', offlineQueue)
}

export function setOnlineStatus(online: boolean): void {
  isOnline = online
  if (online) flushOfflineQueue()
}

async function flushOfflineQueue(): Promise<void> {
  while (offlineQueue.length > 0) {
    const item = offlineQueue.shift()!
    const provider = getActiveProvider()
    if (!provider) break
    try {
      await provider.pushFile(item.vaultPath, item.filePath)
    } catch {
      offlineQueue.unshift(item)
      break
    }
  }
  persistQueue()
}

export function getOfflineQueueSize(): number {
  return offlineQueue.length
}

const providers = new Map<SyncProviderType, SyncProvider>([
  ['icloud', new ICloudSyncProvider()],
  ['onedrive', new OneDriveSyncProvider()],
  ['webdav', new WebDavSyncProvider()],
  ['s3', new S3SyncProvider()]
])

function normalizeProviderType(value: unknown): SyncProviderType {
  return providers.has(value as SyncProviderType) ? value as SyncProviderType : 'icloud'
}

export function getActiveProviderType(): SyncProviderType {
  return normalizeProviderType(store.get('syncProvider'))
}

export function setActiveProviderType(type: SyncProviderType): void {
  store.set('syncProvider', normalizeProviderType(type))
}

export function getActiveProvider(): SyncProvider | null {
  const type = getActiveProviderType()
  const provider = providers.get(type)
  if (!provider || !provider.isConfigured()) return null
  return provider
}

export function getProvider(type: SyncProviderType): SyncProvider {
  return providers.get(type)!
}

export function getAllProviders(): { type: SyncProviderType; name: string; configured: boolean }[] {
  return Array.from(providers.entries()).map(([type, p]) => ({
    type,
    name: p.name,
    configured: p.isConfigured()
  }))
}

function getSyncHealthStoreKey(vaultPath?: string): string {
  return vaultPath ? `syncHealth:${vaultPath}` : 'syncHealth:global'
}

function normalizeSyncHealthStatus(result?: SyncResult): CloudSyncHealthStatus {
  if (!result) return 'idle'
  if (result.errors.length > 0) return 'error'
  if (result.conflicts.length > 0) return 'conflict'
  return 'ok'
}

function syncErrorResult(error: unknown, fallback: string): SyncResult {
  return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [getErrorMessage(error, fallback)] }
}

function defaultSyncHealth(vaultPath?: string): CloudSyncHealth {
  const activeProvider = getActiveProviderType()
  const provider = providers.get(activeProvider)
  return {
    activeProvider,
    activeProviderName: provider?.name || activeProvider,
    activeProviderConfigured: !!provider?.isConfigured(),
    offlineQueueSize: getOfflineQueueSize(),
    status: 'idle',
    lastRunAt: null,
    lastDirection: null,
    total: 0,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    errors: 0,
    lastError: null,
    preflightRisks: [],
    ...(store.get(getSyncHealthStoreKey(vaultPath)) as Partial<CloudSyncHealth> | undefined)
  }
}

export function getSyncHealth(vaultPath?: string): CloudSyncHealth {
  const health = defaultSyncHealth(vaultPath)
  const activeProvider = getActiveProviderType()
  const provider = providers.get(activeProvider)
  return {
    ...health,
    activeProvider,
    activeProviderName: provider?.name || activeProvider,
    activeProviderConfigured: !!provider?.isConfigured(),
    offlineQueueSize: getOfflineQueueSize(),
    preflightRisks: buildCloudSyncPreflightRisks({
      ...health,
      activeProviderConfigured: !!provider?.isConfigured(),
      offlineQueueSize: getOfflineQueueSize()
    })
  }
}

function recordSyncHealth(vaultPath: string, direction: 'sync' | 'pull', result: SyncResult): void {
  const activeProvider = getActiveProviderType()
  const provider = providers.get(activeProvider)
  const health: CloudSyncHealth = {
    activeProvider,
    activeProviderName: provider?.name || activeProvider,
    activeProviderConfigured: !!provider?.isConfigured(),
    offlineQueueSize: getOfflineQueueSize(),
    status: normalizeSyncHealthStatus(result),
    lastRunAt: Date.now(),
    lastDirection: direction,
    total: result.total,
    pushed: result.pushed,
    pulled: result.pulled,
    conflicts: result.conflicts.length,
    errors: result.errors.length,
    lastError: result.errors[0] || null,
    preflightRisks: []
  }
  health.preflightRisks = buildCloudSyncPreflightRisks(health)
  store.set(getSyncHealthStoreKey(vaultPath), health)
}

export function getSyncExclude(): string[] {
  return (store.get('syncExclude') as string[]) || []
}

export function setSyncExclude(paths: string[]): void {
  store.set('syncExclude', paths)
}

function isExcluded(relPath: string): boolean {
  const excludes = getSyncExclude()
  return excludes.some((ex) => relPath.startsWith(ex + '/') || relPath === ex)
}

export async function pushFile(vaultPath: string, filePath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  const relPath = filePath.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
  if (isExcluded(relPath)) return false
  if (!isOnline) {
    offlineQueue.push({ vaultPath, filePath })
    persistQueue()
    return false
  }
  try {
    return await provider.pushFile(vaultPath, filePath)
  } catch {
    offlineQueue.push({ vaultPath, filePath })
    persistQueue()
    return false
  }
}

export async function pullFile(vaultPath: string, relPath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  return provider.pullFile(vaultPath, relPath)
}

export async function syncAll(vaultPath: string): Promise<SyncResult> {
  const provider = getActiveProvider()
  let result: SyncResult
  try {
    result = provider
      ? await provider.syncAll(vaultPath)
      : { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置同步后端'] }
  } catch (error: unknown) {
    result = syncErrorResult(error, '同步失败')
  }
  recordSyncHealth(vaultPath, 'sync', result)
  return result
}

export async function pullAll(vaultPath: string): Promise<SyncResult> {
  const provider = getActiveProvider()
  let result: SyncResult
  try {
    result = provider
      ? await provider.pullAll(vaultPath)
      : { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置同步后端'] }
  } catch (error: unknown) {
    result = syncErrorResult(error, '拉取失败')
  }
  recordSyncHealth(vaultPath, 'pull', result)
  return result
}

export async function pushIndex(vaultPath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  const dbPath = join(vaultPath, '.nexusky', 'index.db')
  if (!existsSync(dbPath)) return false
  closeDatabase()
  return provider.pushFile(vaultPath, dbPath)
}

export async function pullIndex(vaultPath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  const relPath = '.nexusky/index.db'
  closeDatabase()
  return provider.pullFile(vaultPath, relPath)
}

export async function syncIndex(vaultPath: string): Promise<{ pushed: boolean; pulled: boolean; conflict: boolean }> {
  const provider = getActiveProvider()
  if (!provider) return { pushed: false, pulled: false, conflict: false }

  const localDbPath = join(vaultPath, '.nexusky', 'index.db')
  const localExists = existsSync(localDbPath)
  const localMtime = localExists ? statSync(localDbPath).mtimeMs : 0
  const localHash = localExists ? md5(readFileSync(localDbPath)) : ''

  const remoteFiles = await provider.listRemoteFiles()
  const remoteDb = remoteFiles.find((f) => f.path === '.nexusky/index.db')

  if (!remoteDb && localExists) {
    closeDatabase()
    const ok = await provider.pushFile(vaultPath, localDbPath)
    return { pushed: ok, pulled: false, conflict: false }
  }

  if (remoteDb && !localExists) {
    closeDatabase()
    const ok = await provider.pullFile(vaultPath, '.nexusky/index.db')
    return { pushed: false, pulled: ok, conflict: false }
  }

  if (remoteDb && localExists) {
    const remoteMtime = new Date(remoteDb.updatedAt).getTime()
    const side = decideSyncSide({
      localHash,
      remoteHash: remoteDb.hash,
      localMtimeMs: localMtime,
      remoteMtimeMs: remoteMtime
    })
    if (side === 'noop') return { pushed: false, pulled: false, conflict: false }
    if (side === 'conflict') return { pushed: false, pulled: false, conflict: true }
    if (side === 'pull') {
      closeDatabase()
      const ok = await provider.pullFile(vaultPath, '.nexusky/index.db')
      return { pushed: false, pulled: ok, conflict: false }
    }
    closeDatabase()
    const ok = await provider.pushFile(vaultPath, localDbPath)
    return { pushed: ok, pulled: false, conflict: false }
  }

  return { pushed: false, pulled: false, conflict: false }
}
