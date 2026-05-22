import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { extname } from 'path'
import { indexNote, removeNoteIndex } from './indexer'
import { indexNoteEmbeddings, invalidateNoteInCache } from './embedding'
import { getDatabase } from './database'
import { readFileSync } from 'fs'
import { generateMemory, readMemory, deleteMemory } from './memory'
import { cancelLongContextAnalysis, scheduleIndexedNoteLongContext, scheduleVaultLongContextMaintenance } from './long-context/background'

let watcher: FSWatcher | null = null
let currentVaultPath: string | null = null
let structureTimer: ReturnType<typeof setTimeout> | null = null
const changeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

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

  const indexAndNotify = (path: string, eventType: 'note_created' | 'note_updated' = 'note_updated') => {
    const existing = changeTimers.get(path)
    if (existing) clearTimeout(existing)
    changeTimers.set(path, setTimeout(() => {
      changeTimers.delete(path)
      try {
        indexNote(vaultPath, path)
        const { createHash } = require('crypto')
        const { relative } = require('path')
        const relPath = relative(vaultPath, path).replace(/\\/g, '/')
        const noteId = createHash('md5').update(relPath).digest('hex')
        invalidateNoteInCache(vaultPath, noteId)
        const content = readFileSync(path, 'utf-8')
        const contentHash = createHash('md5').update(content).digest('hex')
        indexNoteEmbeddings(vaultPath, noteId, content).catch(() => {})

        const existingMemory = readMemory(vaultPath, noteId)
        if (!existingMemory || existingMemory.contentHash !== contentHash) {
          const db = getDatabase(vaultPath)
          const note = db.prepare('SELECT title, file_path FROM notes WHERE id = ?').get(noteId) as { title: string; file_path: string } | undefined
          if (note) {
            generateMemory(vaultPath, noteId, note.title, note.file_path, content, contentHash).catch(() => {})
          }
        }
        scheduleIndexedNoteLongContext({
          vaultPath,
          filePath: path,
          eventType,
          trigger: 'watcher'
        })
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
      if (extname(path) === '.md') indexAndNotify(path, 'note_created')
    })
    .on('unlink', (path) => {
      notifyStructureChange()
      if (extname(path) === '.md') {
        try {
          const { createHash } = require('crypto')
          const { relative } = require('path')
          const relPath = relative(vaultPath, path).replace(/\\/g, '/')
          const noteId = createHash('md5').update(relPath).digest('hex')
          removeNoteIndex(vaultPath, path)
          invalidateNoteInCache(vaultPath, noteId)
          deleteMemory(vaultPath, noteId)
        } catch {}
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

  if (watcher) {
    watcher.close()
    watcher = null
  }
  currentVaultPath = null
}
