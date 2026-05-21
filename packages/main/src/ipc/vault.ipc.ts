import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { store } from '../services/store'
import { startWatching } from '../services/watcher'
import { syncIndex } from '../services/cloud/manager'
import { closeDatabase } from '../services/database'
import { invalidateVaultQueryCache } from '../services/db-query-cache'

function addToRecentVaults(vaultPath: string): void {
  const recent = (store.get('recentVaults') as string[]) || []
  const updated = [vaultPath, ...recent.filter((p) => p !== vaultPath)].slice(0, 8)
  store.set('recentVaults', updated)
}

function resetVaultRuntimeState(): void {
  closeDatabase()
  invalidateVaultQueryCache()
}

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
    resetVaultRuntimeState()
    store.set('vaultPath', vaultPath)
    addToRecentVaults(vaultPath)
    startWatching(vaultPath)
    return vaultPath
  })

  ipcMain.handle('vault:create', async (_event, params: { name: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择笔记库存放位置'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const parentDir = result.filePaths[0]
    const vaultPath = join(parentDir, params.name)

    if (!existsSync(vaultPath)) {
      mkdirSync(vaultPath, { recursive: true })
    }

    resetVaultRuntimeState()
    writeFileSync(
      join(vaultPath, '欢迎.md'),
      `# 欢迎使用 Nexusky\n\n这是你的新笔记空间「${params.name}」。\n\n开始写下你的第一篇笔记吧。\n`,
      'utf-8'
    )

    store.set('vaultPath', vaultPath)
    addToRecentVaults(vaultPath)
    startWatching(vaultPath)
    return vaultPath
  })

  ipcMain.handle('vault:get', () => {
    const path = store.get('vaultPath') as string | null
    if (path) {
      startWatching(path)
      syncIndex(path).catch(() => {})
    }
    return path || null
  })

  ipcMain.handle('vault:get-recent', () => {
    return (store.get('recentVaults') as string[]) || []
  })

  ipcMain.handle('vault:clear-current', () => {
    resetVaultRuntimeState()
    store.set('vaultPath', null)
  })
}
