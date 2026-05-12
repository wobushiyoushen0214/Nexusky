import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { extname } from 'path'

let watcher: FSWatcher | null = null

export function startWatching(vaultPath: string): void {
  stopWatching()

  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\.|node_modules/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })

  let structureTimer: ReturnType<typeof setTimeout> | null = null
  const changeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  const notifyStructureChange = () => {
    if (structureTimer) clearTimeout(structureTimer)
    structureTimer = setTimeout(() => {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('vault:files-changed')
        }
      }
    }, 500)
  }

  const notifyFileContent = (path: string) => {
    const existing = changeTimers.get(path)
    if (existing) clearTimeout(existing)
    changeTimers.set(path, setTimeout(() => {
      changeTimers.delete(path)
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('file:changed', path)
        }
      }
    }, 300))
  }

  watcher
    .on('add', (path) => {
      notifyStructureChange()
      if (extname(path) === '.md') notifyFileContent(path)
    })
    .on('unlink', notifyStructureChange)
    .on('addDir', notifyStructureChange)
    .on('unlinkDir', notifyStructureChange)
    .on('change', (path) => {
      if (extname(path) === '.md') {
        notifyFileContent(path)
      }
    })
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
