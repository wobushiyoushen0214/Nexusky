import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { isVersionNewer } from './version'
import { getTelemetryPrefs, logger, setTelemetryPrefs } from './logger'
import { safeOpenExternal } from './external-url'

let updateAvailable = false

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
    logger.error('Auto-updater error', err)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      const available = isVersionNewer(version, app.getVersion())
      updateAvailable = available
      return { available, version: available ? version : undefined }
    } catch {
      return { available: false }
    }
  })

  ipcMain.handle('updater:download', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
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
    autoUpdater.checkForUpdates().catch(() => {})
  }, 30000)
}
