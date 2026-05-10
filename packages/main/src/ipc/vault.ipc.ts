import { ipcMain, dialog } from 'electron'
import { store } from '../services/store'

export function registerVaultIPC(): void {
  ipcMain.handle('vault:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择笔记库目录'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const vaultPath = result.filePaths[0]
    store.set('vaultPath', vaultPath)
    return vaultPath
  })

  ipcMain.handle('vault:get', () => {
    return store.get('vaultPath') || null
  })
}
