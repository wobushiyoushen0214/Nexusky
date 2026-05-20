import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import type { IpcMainEvent } from 'electron'
import { join } from 'path'
import { registerFileIPC } from './ipc/file.ipc'
import { registerVaultIPC } from './ipc/vault.ipc'
import { registerDbIPC } from './ipc/db.ipc'
import { registerAiIPC } from './ipc/ai.ipc'
import { registerTemplateIPC } from './ipc/template.ipc'
import { registerCloudIPC } from './ipc/cloud.ipc'
import { registerExportIPC } from './ipc/export.ipc'
import { registerPluginIPC } from './ipc/plugin.ipc'
import { store } from './services/store'
import { setupAutoUpdater } from './services/updater'
import { logger } from './services/logger'
import { startWebClipperServer, stopWebClipperServer } from './services/web-clipper'

process.on('uncaughtException', (error) => {
  logger.error('uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)))
})

let mainWindow: BrowserWindow | null = null
const windows = new Set<BrowserWindow>()

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

const boundsTimers = new Map<number, ReturnType<typeof setTimeout>>()
function saveWindowBounds(window: BrowserWindow): void {
  const existingTimer = boundsTimers.get(window.id)
  if (existingTimer) clearTimeout(existingTimer)
  const timer = setTimeout(() => {
    if (window.isDestroyed()) return
    const isMaximized = window.isMaximized()
    if (!isMaximized) {
      const bounds = window.getBounds()
      store.set('windowBounds', { ...bounds, isMaximized: false })
    } else {
      const existing = getSavedBounds()
      store.set('windowBounds', { ...existing, isMaximized: true })
    }
    boundsTimers.delete(window.id)
  }, 500)
  boundsTimers.set(window.id, timer)
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const saved = getSavedBounds()

  const window = new BrowserWindow({
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
      nodeIntegration: false,
      spellcheck: true
    }
  })

  if (saved.isMaximized) {
    window.maximize()
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  windows.add(window)
  mainWindow = window

  window.on('focus', () => {
    mainWindow = window
  })

  window.on('resize', () => saveWindowBounds(window))
  window.on('move', () => saveWindowBounds(window))
  window.on('maximize', () => saveWindowBounds(window))
  window.on('unmaximize', () => saveWindowBounds(window))

  window.on('close', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('app:before-close')
    }
  })

  window.on('closed', () => {
    windows.delete(window)
    const timer = boundsTimers.get(window.id)
    if (timer) clearTimeout(timer)
    boundsTimers.delete(window.id)
    if (mainWindow === window) {
      mainWindow = BrowserWindow.getFocusedWindow() || windows.values().next().value || null
    }
  })

  return window
}

function getEventWindow(event: IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || mainWindow
}

app.whenReady().then(() => {
  registerFileIPC()
  registerVaultIPC()
  registerDbIPC()
  registerAiIPC()
  registerTemplateIPC()
  registerCloudIPC()
  registerExportIPC()
  registerPluginIPC()
  setupAutoUpdater()
  startWebClipperServer()

  ipcMain.on('window:minimize', (event) => getEventWindow(event)?.minimize())
  ipcMain.on('window:maximize', (event) => {
    const window = getEventWindow(event)
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })
  ipcMain.on('window:close', (event) => getEventWindow(event)?.close())
  ipcMain.on('window:new', () => createWindow())

  ipcMain.on('theme:change', (_event, _theme: string) => {
    // Reserved for future use
  })

  createWindow()

  globalShortcut.register('CommandOrControl+Shift+N', () => {
    const window = mainWindow || createWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send('quick-capture')
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
  stopWebClipperServer()
  globalShortcut.unregisterAll()
  store.flush()
})
