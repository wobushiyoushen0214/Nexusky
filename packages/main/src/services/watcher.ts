import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { extname } from 'path'
import { indexNote, removeNoteIndex } from './indexer'
import { indexNoteSearchChunks, invalidateNoteInCache } from './search-index'
import { getDatabase } from './database'
import { logger } from './logger'
import { readFileSync } from 'fs'
import { generateMemory, readMemory, deleteMemory } from './memory'
import { getAppLanguage } from './app-language'
import { refreshInferredLinksFromMemory } from './memory-links'
import { cancelLongContextAnalysis, scheduleIndexedNoteLongContext, scheduleVaultLongContextMaintenance } from './long-context/background'

let watcher: FSWatcher | null = null
let currentVaultPath: string | null = null
let structureTimer: ReturnType<typeof setTimeout> | null = null
const changeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
const unlinkTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

export function startWatching(vaultPath: string): void {
  stopWatching()
  currentVaultPath = vaultPath
  scheduleVaultLongContextMaintenance(vaultPath)

  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])(\.|node_modules|\.history)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })

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

  const notifyGraphRefresh = () => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('vault:files-changed')
      }
    }
  }

  const indexAndNotify = (path: string, eventType: 'note_created' | 'note_updated' = 'note_updated') => {
    const pendingUnlink = unlinkTimers.get(path)
    if (pendingUnlink) {
      clearTimeout(pendingUnlink)
      unlinkTimers.delete(path)
    }
    const existing = changeTimers.get(path)
    if (existing) clearTimeout(existing)
    changeTimers.set(path, setTimeout(() => {
      changeTimers.delete(path)
      try {
        const noteId = indexNote(vaultPath, path)
        const { createHash } = require('crypto')
        invalidateNoteInCache(vaultPath, noteId)
        const content = readFileSync(path, 'utf-8')
        const contentHash = createHash('md5').update(content).digest('hex')
        indexNoteSearchChunks(vaultPath, noteId, content).catch(() => {})

        const existingMemory = readMemory(vaultPath, noteId)
        if (!existingMemory || existingMemory.contentHash !== contentHash) {
          const db = getDatabase(vaultPath)
          const note = db.prepare('SELECT title, file_path FROM notes WHERE id = ?').get(noteId) as { title: string; file_path: string } | undefined
          if (note) {
            generateMemory(vaultPath, noteId, note.title, note.file_path, content, contentHash, getAppLanguage())
              .then((memory) => {
                if (!memory) return
                refreshInferredLinksFromMemory(vaultPath)
                notifyGraphRefresh()
              })
              .catch(() => {})
          }
        }
        scheduleIndexedNoteLongContext({
          vaultPath,
          filePath: path,
          eventType,
          trigger: 'watcher'
        })
      } catch (err) {
        // Don't swallow silently: a dropped index write (e.g. SQLITE_BUSY)
        // would otherwise leave the note unindexed with no trace.
        logger.warn('Failed to index note from watcher', { path, error: String(err) })
      }
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
      if (extname(path) === '.md') indexAndNotify(path, 'note_created')
    })
    .on('unlink', (path) => {
      notifyStructureChange()
      if (extname(path) === '.md') {
        const existing = unlinkTimers.get(path)
        if (existing) clearTimeout(existing)
        unlinkTimers.set(path, setTimeout(() => {
          unlinkTimers.delete(path)
          try {
            const removedNoteId = removeNoteIndex(vaultPath, path)
            if (!removedNoteId) return
            invalidateNoteInCache(vaultPath, removedNoteId)
            deleteMemory(vaultPath, removedNoteId)
          } catch {}
        }, 1500))
      }
    })
    .on('addDir', notifyStructureChange)
    .on('unlinkDir', notifyStructureChange)
    .on('change', (path) => {
      if (extname(path) === '.md') {
        indexAndNotify(path, 'note_updated')
      }
    })
}

export function stopWatching(): void {
  if (currentVaultPath) cancelLongContextAnalysis(currentVaultPath)
  if (structureTimer) {
    clearTimeout(structureTimer)
    structureTimer = null
  }
  for (const timer of changeTimers.values()) {
    clearTimeout(timer)
  }
  changeTimers.clear()
  for (const timer of unlinkTimers.values()) {
    clearTimeout(timer)
  }
  unlinkTimers.clear()

  if (watcher) {
    watcher.close()
    watcher = null
  }
  currentVaultPath = null
}
