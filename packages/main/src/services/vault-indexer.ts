import { readdirSync } from 'fs'
import { extname, join } from 'path'
import { getDatabase } from './database'
import { indexNote } from './indexer'
import { invalidateVaultQueryCache } from './db-query-cache'

export interface VaultIndexProgress {
  current: number
  total: number
}

export interface VaultIndexResult {
  indexed: number
}

export function collectMarkdownFiles(dirPath: string): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (extname(entry.name).toLowerCase() === '.md') {
        results.push(fullPath)
      }
    }
  }

  walk(dirPath)
  return results
}

export function cleanupStaleNoteIndexes(vaultPath: string, files: string[]): number {
  const db = getDatabase(vaultPath)
  const allNotes = db.prepare('SELECT id, file_path FROM notes').all() as { id: string; file_path: string }[]
  const existingRelPaths = new Set(files.map((file) => file.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')))
  const staleNotes = allNotes.filter((note) => !existingRelPaths.has(note.file_path))
  if (staleNotes.length === 0) return 0

  const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?')
  const deleteFtsMap = db.prepare('DELETE FROM notes_fts_map WHERE note_id = ?')
  const deleteLinks = db.prepare('DELETE FROM links WHERE source_note_id = ? OR target_note_id = ?')
  for (const note of staleNotes) {
    const ftsRow = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?').get(note.id) as { rowid: number } | undefined
    if (ftsRow) {
      db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(ftsRow.rowid)
      deleteFtsMap.run(note.id)
    }
    deleteLinks.run(note.id, note.id)
    deleteNote.run(note.id)
  }
  invalidateVaultQueryCache(vaultPath)
  return staleNotes.length
}

export async function indexVault(vaultPath: string, onProgress?: (progress: VaultIndexProgress) => void): Promise<VaultIndexResult> {
  const files = collectMarkdownFiles(vaultPath)

  const batchSize = 20
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    for (const file of batch) {
      indexNote(vaultPath, file)
    }
    onProgress?.({ current: Math.min(i + batchSize, files.length), total: files.length })
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  if (files.length === 0) onProgress?.({ current: 0, total: 0 })
  cleanupStaleNoteIndexes(vaultPath, files)
  return { indexed: files.length }
}
