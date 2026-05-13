import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { indexNote, removeNoteIndex, getAllNotes, getBacklinks, getGraphData, getAllTags, getNotesByTag, getAllTasks } from '../services/indexer'
import { getDatabase, closeDatabase } from '../services/database'
import { semanticSearch, indexNoteEmbeddings } from '../services/embedding'
import { pushIndex } from '../services/cloud/manager'

export function registerDbIPC(): void {
  ipcMain.handle('db:index-vault', async (_event, params: { vaultPath: string }) => {
    const files = collectMarkdownFiles(params.vaultPath)
    const db = getDatabase(params.vaultPath)

    // Clean up stale records for files that no longer exist
    const allNotes = db.prepare('SELECT id, file_path FROM notes').all() as { id: string; file_path: string }[]
    const existingRelPaths = new Set(files.map((f) => f.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')))
    const staleNotes = allNotes.filter((n) => !existingRelPaths.has(n.file_path))
    if (staleNotes.length > 0) {
      const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?')
      const deleteFtsMap = db.prepare('DELETE FROM notes_fts_map WHERE note_id = ?')
      for (const note of staleNotes) {
        const ftsRow = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?').get(note.id) as { rowid: number } | undefined
        if (ftsRow) {
          db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(ftsRow.rowid)
          deleteFtsMap.run(note.id)
        }
        deleteNote.run(note.id)
      }
    }

    const BATCH_SIZE = 20
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      for (const file of batch) {
        indexNote(params.vaultPath, file)
      }
      if (i + BATCH_SIZE < files.length) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
    return { indexed: files.length }
  })

  ipcMain.handle('db:index-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    indexNote(params.vaultPath, params.filePath)
  })

  ipcMain.handle('db:remove-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    removeNoteIndex(params.vaultPath, params.filePath)
  })

  ipcMain.handle('db:get-all-notes', async (_event, params: { vaultPath: string }) => {
    return getAllNotes(params.vaultPath)
  })

  ipcMain.handle('db:get-recent-notes', async (_event, params: { vaultPath: string; limit?: number }) => {
    const db = getDatabase(params.vaultPath)
    const limit = params.limit || 50
    return db.prepare(
      'SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt FROM notes ORDER BY updated_at DESC LIMIT ?'
    ).all(limit)
  })

  ipcMain.handle('db:get-backlinks', async (_event, params: { vaultPath: string; noteId: string }) => {
    return getBacklinks(params.vaultPath, params.noteId)
  })

  ipcMain.handle('db:get-graph', async (_event, params: { vaultPath: string }) => {
    return getGraphData(params.vaultPath)
  })

  ipcMain.handle('db:search-notes', async (_event, params: { vaultPath: string; query: string }) => {
    const db = getDatabase(params.vaultPath)
    const pattern = `%${params.query}%`
    return db.prepare(`
      SELECT id, title, file_path as filePath
      FROM notes
      WHERE title LIKE ?
      ORDER BY updated_at DESC
      LIMIT 20
    `).all(pattern)
  })

  ipcMain.handle('db:semantic-search', async (_event, params: { vaultPath: string; query: string }) => {
    return semanticSearch(params.vaultPath, params.query)
  })

  ipcMain.handle('db:fulltext-search', async (_event, params: { vaultPath: string; query: string; regex?: boolean }) => {
    const db = getDatabase(params.vaultPath)
    const ftsQuery = params.query.replace(/['"]/g, '').trim()
    if (!ftsQuery) return []

    if (params.regex) {
      const files = collectMarkdownFiles(params.vaultPath)
      const results: { filePath: string; title: string; line: string; lineNumber: number }[] = []
      let re: RegExp
      try { re = new RegExp(ftsQuery, 'i') } catch { return [] }

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
        const title = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '') || relPath.replace(/\.md$/, '')

        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            results.push({ filePath: relPath, title, line: lines[i].trim(), lineNumber: i + 1 })
            if (results.length >= 50) return results
          }
        }
      }
      return results
    }

    try {
      return db.prepare(`
        SELECT n.file_path as filePath, n.title, snippet(notes_fts, 1, '<<', '>>', '...', 32) as line, 0 as lineNumber
        FROM notes_fts
        JOIN notes_fts_map m ON m.rowid = notes_fts.rowid
        JOIN notes n ON n.id = m.note_id
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT 50
      `).all(ftsQuery)
    } catch {
      const files = collectMarkdownFiles(params.vaultPath)
      const results: { filePath: string; title: string; line: string; lineNumber: number }[] = []
      const query = params.query.toLowerCase()

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
        const title = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '') || relPath.replace(/\.md$/, '')

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            results.push({ filePath: relPath, title, line: lines[i].trim(), lineNumber: i + 1 })
            if (results.length >= 50) return results
          }
        }
      }
      return results
    }
  })

  ipcMain.handle('db:get-tags', async (_event, params: { vaultPath: string }) => {
    return getAllTags(params.vaultPath)
  })

  ipcMain.handle('db:get-notes-by-tag', async (_event, params: { vaultPath: string; tag: string }) => {
    return getNotesByTag(params.vaultPath, params.tag)
  })

  ipcMain.handle('db:get-tasks', async (_event, params: { vaultPath: string }) => {
    return getAllTasks(params.vaultPath)
  })

  ipcMain.handle('db:embed-note', async (_event, params: { vaultPath: string; noteId: string; content: string }) => {
    await indexNoteEmbeddings(params.vaultPath, params.noteId, params.content)
  })

  ipcMain.handle('db:embed-vault', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const files = collectMarkdownFiles(params.vaultPath)
    const db = getDatabase(params.vaultPath)
    let embedded = 0
    const total = files.length

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const content = readFileSync(file, 'utf-8')
      const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
      const note = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
      if (note) {
        const hasEmbedding = db.prepare('SELECT 1 FROM chunks WHERE note_id = ? AND embedding IS NOT NULL LIMIT 1').get(note.id)
        if (!hasEmbedding) {
          await indexNoteEmbeddings(params.vaultPath, note.id, content)
          embedded++
        }
      }
      if (window && !window.isDestroyed() && i % 5 === 0) {
        window.webContents.send('embed:progress', { current: i + 1, total, embedded })
      }
    }
    pushIndex(params.vaultPath).catch(() => {})
    return { embedded }
  })

  ipcMain.handle('db:chat-history-load', async (_event, params: { vaultPath: string; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    if (params.sessionId) {
      const rows = db.prepare(
        'SELECT id, role, content, sources, created_at as createdAt FROM conversations WHERE session_id = ? ORDER BY created_at ASC LIMIT 200'
      ).all(params.sessionId) as { id: number; role: string; content: string; sources: string | null; createdAt: number }[]
      return rows.map((r) => ({ id: String(r.id), role: r.role, content: r.content, sources: r.sources ? JSON.parse(r.sources) : undefined }))
    }
    const rows = db.prepare(
      'SELECT id, role, content, sources, created_at as createdAt FROM conversations WHERE session_id IS NULL ORDER BY created_at ASC LIMIT 200'
    ).all() as { id: number; role: string; content: string; sources: string | null; createdAt: number }[]
    return rows.map((r) => ({ id: String(r.id), role: r.role, content: r.content, sources: r.sources ? JSON.parse(r.sources) : undefined }))
  })

  ipcMain.handle('db:chat-history-append', async (_event, params: { vaultPath: string; role: string; content: string; sources?: any[]; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare(
      'INSERT INTO conversations (role, content, sources, session_id) VALUES (?, ?, ?, ?)'
    ).run(params.role, params.content, params.sources ? JSON.stringify(params.sources) : null, params.sessionId || null)
    if (params.sessionId) {
      db.prepare('UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?').run(params.sessionId)
    }
  })

  ipcMain.handle('db:chat-history-clear', async (_event, params: { vaultPath: string; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    if (params.sessionId) {
      db.prepare('DELETE FROM conversations WHERE session_id = ?').run(params.sessionId)
    } else {
      db.prepare('DELETE FROM conversations WHERE session_id IS NULL').run()
    }
  })

  ipcMain.handle('db:chat-sessions-list', async (_event, params: { vaultPath: string }) => {
    const db = getDatabase(params.vaultPath)
    return db.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chat_sessions ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('db:chat-session-create', async (_event, params: { vaultPath: string; id: string; title: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('INSERT INTO chat_sessions (id, title) VALUES (?, ?)').run(params.id, params.title)
  })

  ipcMain.handle('db:chat-session-delete', async (_event, params: { vaultPath: string; sessionId: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('DELETE FROM conversations WHERE session_id = ?').run(params.sessionId)
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(params.sessionId)
  })

  ipcMain.handle('db:chat-session-rename', async (_event, params: { vaultPath: string; sessionId: string; title: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(params.title, params.sessionId)
  })
}

function collectMarkdownFiles(dirPath: string): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (extname(entry.name) === '.md') {
        results.push(fullPath)
      }
    }
  }

  walk(dirPath)
  return results
}
