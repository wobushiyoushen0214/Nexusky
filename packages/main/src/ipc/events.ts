import { BrowserWindow } from 'electron'

export function notifyVaultFilesChanged(changedPaths: string[] = []): void {
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('vault:files-changed', changedPaths)
  }
}
