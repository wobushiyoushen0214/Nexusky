import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { extname } from 'path'
import { indexNote, removeNoteIndex } from './indexer'
import { indexNoteEmbeddings, invalidateEmbeddingCache } from './embedding'
import { getDatabase } from './database'
import { readFileSync } from 'fs'

let watcher: FSWatcher | null = null
let currentVaultPath: string | null = null

export function startWatching(vaultPath: string): void {
  stopWatching()
  currentVaultPath = vaultPath

  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])(\.|node_modules|\.history)/,
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

  const indexAndNotify = (path: string) => {
    const existing = changeTimers.get(path)
    if (existing) clearTimeout(existing)
    changeTimers.set(path, setTimeout(() => {
      changeTimers.delete(path)
      try {
        indexNote(vaultPath, path)
        invalidateEmbeddingCache()
        const db = getDatabase(vaultPath)
        const { createHash } = require('crypto')
        const { relative } = require('path')
        const relPath = relative(vaultPath, path).replace(/\\/g, '/')
        const noteId = createHash('md5').update(relPath).digest('hex')
        const content = readFileSync(path, 'utf-8')
        indexNoteEmbeddings(vaultPath, noteId, content).catch(() => {})
      } catch {}
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('file:changed', path)
        }
      }
    }, 500))
  }

  watcher
    .on('add', (path) => {
      notifyStructureChange()
      if (extname(path) === '.md') indexAndNotify(path)
    })
    .on('unlink', (path) => {
      notifyStructureChange()
      if (extname(path) === '.md') {
        try {
          removeNoteIndex(vaultPath, path)
          invalidateEmbeddingCache()
        } catch {}
      }
    })
    .on('addDir', notifyStructureChange)
    .on('unlinkDir', notifyStructureChange)
    .on('change', (path) => {
      if (extname(path) === '.md') {
        indexAndNotify(path)
      }
    })
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
