import { SyncProvider, SyncProviderType, SyncResult } from './provider'
import { SupabaseSyncProvider } from './supabase-provider'
import { ICloudSyncProvider } from './icloud-provider'
import { OneDriveSyncProvider } from './onedrive-provider'
import { store } from '../store'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { closeDatabase } from '../database'

const providers: Map<SyncProviderType, SyncProvider> = new Map([
  ['supabase', new SupabaseSyncProvider()],
  ['icloud', new ICloudSyncProvider()],
  ['onedrive', new OneDriveSyncProvider()]
])

export function getActiveProviderType(): SyncProviderType {
  return (store.get('syncProvider') as SyncProviderType) || 'supabase'
}

export function setActiveProviderType(type: SyncProviderType): void {
  store.set('syncProvider', type)
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

export async function pushFile(vaultPath: string, filePath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  return provider.pushFile(vaultPath, filePath)
}

export async function pullFile(vaultPath: string, relPath: string): Promise<boolean> {
  const provider = getActiveProvider()
  if (!provider) return false
  return provider.pullFile(vaultPath, relPath)
}

export async function syncAll(vaultPath: string): Promise<SyncResult> {
  const provider = getActiveProvider()
  if (!provider) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置同步后端'] }
  return provider.syncAll(vaultPath)
}

export async function pullAll(vaultPath: string): Promise<SyncResult> {
  const provider = getActiveProvider()
  if (!provider) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置同步后端'] }
  return provider.pullAll(vaultPath)
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

export async function syncIndex(vaultPath: string): Promise<{ pushed: boolean; pulled: boolean }> {
  const provider = getActiveProvider()
  if (!provider) return { pushed: false, pulled: false }

  const localDbPath = join(vaultPath, '.nexusky', 'index.db')
  const localExists = existsSync(localDbPath)
  const localMtime = localExists ? statSync(localDbPath).mtimeMs : 0

  const remoteFiles = await provider.listRemoteFiles()
  const remoteDb = remoteFiles.find((f) => f.path === '.nexusky/index.db')

  if (!remoteDb && localExists) {
    closeDatabase()
    const ok = await provider.pushFile(vaultPath, localDbPath)
    return { pushed: ok, pulled: false }
  }

  if (remoteDb && !localExists) {
    closeDatabase()
    const ok = await provider.pullFile(vaultPath, '.nexusky/index.db')
    return { pushed: false, pulled: ok }
  }

  if (remoteDb && localExists) {
    const remoteMtime = new Date(remoteDb.updatedAt).getTime()
    if (remoteMtime > localMtime) {
      closeDatabase()
      const ok = await provider.pullFile(vaultPath, '.nexusky/index.db')
      return { pushed: false, pulled: ok }
    } else if (localMtime > remoteMtime + 5000) {
      closeDatabase()
      const ok = await provider.pushFile(vaultPath, localDbPath)
      return { pushed: ok, pulled: false }
    }
  }

  return { pushed: false, pulled: false }
}
