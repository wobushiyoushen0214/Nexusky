import { ipcMain, BrowserWindow } from 'electron'
import { store } from '../services/store'
import {
  pushFile,
  pullFile,
  syncAll,
  pullAll,
  getSyncHealth,
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
import { OneDriveConfig, startOneDriveAuth } from '../services/cloud/onedrive-provider'
import { ICloudSyncProvider } from '../services/cloud/icloud-provider'
import { WebDavConfig, normalizeWebDavConfig } from '../services/cloud/webdav-provider'
import { S3Config, normalizeS3Config } from '../services/cloud/s3-provider'

export function registerCloudIPC(): void {
  ipcMain.handle('cloud:get-sync-health', (_event, params?: { vaultPath?: string }) => {
    return getSyncHealth(params?.vaultPath)
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
    const config = store.get('onedriveConfig') as Partial<OneDriveConfig> | undefined
    if (!config) return null
    return { clientId: config.clientId, folder: config.folder, hasToken: !!config.accessToken }
  })

  ipcMain.handle('cloud:save-onedrive-config', (_event, params: { clientId: string; folder: string }) => {
    const existing = (store.get('onedriveConfig') as Partial<OneDriveConfig> | undefined) || {}
    store.set('onedriveConfig', { ...existing, clientId: params.clientId, folder: params.folder })
  })

  ipcMain.handle('cloud:get-webdav-config', () => {
    const config = normalizeWebDavConfig(store.get('webdavConfig') as Partial<WebDavConfig> | undefined)
    return {
      url: config.url,
      username: config.username,
      folder: config.folder,
      hasPassword: !!config.password
    }
  })

  ipcMain.handle('cloud:save-webdav-config', (_event, params: WebDavConfig) => {
    const existing = normalizeWebDavConfig(store.get('webdavConfig') as Partial<WebDavConfig> | undefined)
    store.set('webdavConfig', normalizeWebDavConfig({
      ...params,
      password: params.password || existing.password || ''
    }))
  })

  ipcMain.handle('cloud:get-s3-config', () => {
    const config = normalizeS3Config(store.get('s3Config') as Partial<S3Config> | undefined)
    return {
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      prefix: config.prefix,
      hasAccessKeyId: !!config.accessKeyId,
      hasSecretAccessKey: !!config.secretAccessKey
    }
  })

  ipcMain.handle('cloud:save-s3-config', (_event, params: S3Config) => {
    const existing = normalizeS3Config(store.get('s3Config') as Partial<S3Config> | undefined)
    store.set('s3Config', normalizeS3Config({
      ...params,
      accessKeyId: params.accessKeyId || existing.accessKeyId,
      secretAccessKey: params.secretAccessKey || existing.secretAccessKey
    }))
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
