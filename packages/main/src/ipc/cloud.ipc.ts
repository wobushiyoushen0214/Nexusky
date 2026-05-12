import { ipcMain, BrowserWindow } from 'electron'
import { store } from '../services/store'
import { resetClient, CloudConfig } from '../services/cloud/client'
import { initializeCloud } from '../services/cloud/setup'
import { signIn, signUp, signOut, getUser } from '../services/cloud/auth'
import {
  pushFile,
  pullFile,
  syncAll,
  pullAll,
  pushIndex,
  pullIndex,
  syncIndex,
  getSyncExclude,
  setSyncExclude,
  setOnlineStatus,
  getOfflineQueueSize,
  getActiveProviderType,
  setActiveProviderType,
  getAllProviders,
  getProvider
} from '../services/cloud/manager'
import { SyncProviderType } from '../services/cloud/provider'
import { startOneDriveAuth } from '../services/cloud/onedrive-provider'
import { ICloudSyncProvider } from '../services/cloud/icloud-provider'

export function registerCloudIPC(): void {
  ipcMain.handle('cloud:get-config', () => {
    return store.get('cloudConfig') || { supabaseUrl: '', supabaseKey: '', serviceRoleKey: '', enabled: false }
  })

  ipcMain.handle('cloud:save-config', (_event, params: { config: CloudConfig }) => {
    store.set('cloudConfig', params.config)
    resetClient()
  })

  ipcMain.handle('cloud:init', async () => {
    return initializeCloud()
  })

  ipcMain.handle('cloud:sign-in', async (_event, params: { email: string; password: string }) => {
    return signIn(params.email, params.password)
  })

  ipcMain.handle('cloud:sign-up', async (_event, params: { email: string; password: string }) => {
    return signUp(params.email, params.password)
  })

  ipcMain.handle('cloud:sign-out', async () => {
    await signOut()
  })

  ipcMain.handle('cloud:get-user', async () => {
    return getUser()
  })

  ipcMain.handle('cloud:sync', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await syncAll(params.vaultPath)
    if (window && !window.isDestroyed()) {
      window.webContents.send('cloud:sync-done', { pushed: result.pushed, pulled: result.pulled, conflicts: result.conflicts.length })
    }
    return result
  })

  ipcMain.handle('cloud:push-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    return pushFile(params.vaultPath, params.filePath)
  })

  ipcMain.handle('cloud:pull-file', async (_event, params: { vaultPath: string; relPath: string }) => {
    return pullFile(params.vaultPath, params.relPath)
  })

  ipcMain.handle('cloud:pull-all', async (_event, params: { vaultPath: string }) => {
    return pullAll(params.vaultPath)
  })

  ipcMain.handle('cloud:get-sync-provider', () => {
    return getActiveProviderType()
  })

  ipcMain.handle('cloud:set-sync-provider', (_event, params: { provider: SyncProviderType }) => {
    setActiveProviderType(params.provider)
  })

  ipcMain.handle('cloud:get-all-providers', () => {
    return getAllProviders()
  })

  ipcMain.handle('cloud:test-connection', async (_event, params: { provider: SyncProviderType }) => {
    const p = getProvider(params.provider)
    return p.testConnection()
  })

  ipcMain.handle('cloud:onedrive-auth', async (_event, params: { clientId: string }) => {
    return startOneDriveAuth(params.clientId)
  })

  ipcMain.handle('cloud:get-onedrive-config', () => {
    const config = store.get('onedriveConfig') as any
    if (!config) return null
    return { clientId: config.clientId, folder: config.folder, hasToken: !!config.accessToken }
  })

  ipcMain.handle('cloud:save-onedrive-config', (_event, params: { clientId: string; folder: string }) => {
    const existing = (store.get('onedriveConfig') as any) || {}
    store.set('onedriveConfig', { ...existing, clientId: params.clientId, folder: params.folder })
  })

  ipcMain.handle('cloud:get-icloud-path', () => {
    const provider = getProvider('icloud') as ICloudSyncProvider
    return provider.getBasePath()
  })

  ipcMain.handle('cloud:set-icloud-path', (_event, params: { path: string }) => {
    store.set('icloudPath', params.path)
  })

  ipcMain.handle('cloud:push-index', async (_event, params: { vaultPath: string }) => {
    return pushIndex(params.vaultPath)
  })

  ipcMain.handle('cloud:pull-index', async (_event, params: { vaultPath: string }) => {
    return pullIndex(params.vaultPath)
  })

  ipcMain.handle('cloud:sync-index', async (_event, params: { vaultPath: string }) => {
    return syncIndex(params.vaultPath)
  })

  ipcMain.handle('cloud:get-sync-exclude', () => {
    return getSyncExclude()
  })

  ipcMain.handle('cloud:set-sync-exclude', (_event, params: { paths: string[] }) => {
    setSyncExclude(params.paths)
  })

  ipcMain.handle('cloud:set-online', (_event, params: { online: boolean }) => {
    setOnlineStatus(params.online)
  })

  ipcMain.handle('cloud:get-queue-size', () => {
    return getOfflineQueueSize()
  })

  ipcMain.handle('cloud:resolve-conflict', async (_event, params: { vaultPath: string; path: string; resolution: 'local' | 'remote' }) => {
    if (params.resolution === 'local') {
      const { join } = require('path')
      const fullPath = join(params.vaultPath, params.path)
      return pushFile(params.vaultPath, fullPath)
    } else {
      return pullFile(params.vaultPath, params.path)
    }
  })
}
