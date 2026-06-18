import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { isVersionNewer } from './version'
import { getTelemetryPrefs, logger, setTelemetryPrefs } from './logger'
import { safeOpenExternal } from './external-url'
import { setAppLanguage } from './app-language'
import type { AppLanguage, UpdaterRecoveryCode, UpdaterRecoveryError } from '@shared/types/ipc'

let updateAvailable = false
const RELEASES_FALLBACK_URL = 'https://github.com/wobushiyoushen0214/Nexusky/releases'

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    updateAvailable = isVersionNewer(info.version, app.getVersion())
    if (!updateAvailable) return

    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:available', { version: info.version })
      }
    }
  })

  autoUpdater.on('update-not-available', () => {
    updateAvailable = false
  })

  autoUpdater.on('download-progress', (progress) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:progress', { percent: progress.percent })
      }
    }
  })

  autoUpdater.on('update-downloaded', () => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:downloaded')
      }
    }
  })

  autoUpdater.on('error', (err) => {
    broadcastUpdaterError('update_runtime_error', err)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      const available = isVersionNewer(version, app.getVersion())
      updateAvailable = available
      return { available, version: available ? version : undefined }
    } catch (error) {
      return { available: false, error: broadcastUpdaterError('update_check_failed', error) }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: broadcastUpdaterError('update_download_failed', error) }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:set-language', (_event, params: { language?: AppLanguage }) => {
    return { language: setAppLanguage(params?.language) }
  })

  ipcMain.handle('app:open-external', async (_event, params: { url: string }) => {
    await safeOpenExternal(params?.url)
  })

  ipcMain.handle('telemetry:get-prefs', () => {
    return getTelemetryPrefs()
  })

  ipcMain.handle('telemetry:set-prefs', (_event, params: { enabled: boolean }) => {
    return setTelemetryPrefs({ enabled: params?.enabled === true })
  })

  // Check for updates 30 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      broadcastUpdaterError('update_check_failed', error)
    })
  }, 30000)
}

export function buildUpdaterRecoveryError(code: UpdaterRecoveryCode, error: unknown): UpdaterRecoveryError {
  const rawMessage = error instanceof Error ? error.message : String(error || '')
  return {
    code,
    message: rawMessage.trim() || 'Update failed. Download the latest release manually.',
    fallbackUrl: RELEASES_FALLBACK_URL
  }
}

function broadcastUpdaterError(code: UpdaterRecoveryCode, error: unknown): UpdaterRecoveryError {
  const payload = buildUpdaterRecoveryError(code, error)
  logger.error('Auto-updater error', error)
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:error', payload)
    }
  }
  return payload
}
