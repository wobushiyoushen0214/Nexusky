import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app, shell } from 'electron'

let updateAvailable = false

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true
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
    console.error('Auto-updater error:', err.message)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version }
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

  ipcMain.handle('app:open-external', (_event, params: { url: string }) => {
    shell.openExternal(params.url)
  })

  // Check for updates 30 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 30000)
}
