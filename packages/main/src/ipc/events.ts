import { BrowserWindow } from 'electron'

export function notifyVaultFilesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('vault:files-changed')
  }
}
