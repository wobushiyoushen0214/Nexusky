import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerFileIPC } from './ipc/file.ipc'
import { registerVaultIPC } from './ipc/vault.ipc'
import { registerDbIPC } from './ipc/db.ipc'
import { registerAiIPC } from './ipc/ai.ipc'
import { registerTemplateIPC } from './ipc/template.ipc'
import { registerCloudIPC } from './ipc/cloud.ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    backgroundColor: '#1e2030',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
