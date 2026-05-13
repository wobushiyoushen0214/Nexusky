import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { registerFileIPC } from './ipc/file.ipc'
import { registerVaultIPC } from './ipc/vault.ipc'
import { registerDbIPC } from './ipc/db.ipc'
import { registerAiIPC } from './ipc/ai.ipc'
import { registerTemplateIPC } from './ipc/template.ipc'
import { registerCloudIPC } from './ipc/cloud.ipc'
import { registerExportIPC } from './ipc/export.ipc'
import { store } from './services/store'
import { setupAutoUpdater } from './services/updater'

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

let mainWindow: BrowserWindow | null = null

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function getSavedBounds(): Partial<WindowBounds> {
  return (store.get('windowBounds') as WindowBounds) || {}
}

let boundsTimer: ReturnType<typeof setTimeout> | null = null
function saveWindowBounds(): void {
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    if (!mainWindow) return
    const isMaximized = mainWindow.isMaximized()
    if (!isMaximized) {
      const bounds = mainWindow.getBounds()
      store.set('windowBounds', { ...bounds, isMaximized: false })
    } else {
      const existing = getSavedBounds()
      store.set('windowBounds', { ...existing, isMaximized: true })
    }
  }, 500)
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const saved = getSavedBounds()

  mainWindow = new BrowserWindow({
    width: saved.width || 1400,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: false,
    trafficLightPosition: isMac ? { x: 16, y: 12 } : undefined,
    backgroundColor: '#1e1e1e',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (saved.isMaximized) {
    mainWindow.maximize()
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

  mainWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:before-close')
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerFileIPC()
  registerVaultIPC()
  registerDbIPC()
  registerAiIPC()
  registerTemplateIPC()
  registerCloudIPC()
  registerExportIPC()
  setupAutoUpdater()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  ipcMain.on('theme:change', (_event, _theme: string) => {
    // Reserved for future use
  })

  createWindow()

  globalShortcut.register('CommandOrControl+Shift+N', () => {
    if (!mainWindow) {
      createWindow()
    }
    if (mainWindow!.isMinimized()) mainWindow!.restore()
    mainWindow!.show()
    mainWindow!.focus()
    mainWindow!.webContents.send('quick-capture')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  store.flush()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  store.flush()
})
