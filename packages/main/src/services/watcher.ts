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
    depth: 10,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let changeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  const notifyChange = (path: string) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('vault:files-changed')
          if (path.endsWith('.md')) {
            win.webContents.send('file:changed', path)
          }
        }
      }
    }, 500)
  }

  const notifyFileChange = (path: string) => {
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
    .on('add', notifyChange)
    .on('unlink', notifyChange)
    .on('addDir', notifyChange)
    .on('unlinkDir', notifyChange)
    .on('change', (path) => {
      if (extname(path) === '.md') {
        notifyFileChange(path)
      }
    })
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
