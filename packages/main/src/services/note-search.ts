import { getDatabase } from './database'
import type { NoteSearchResult } from '@shared/types/ipc'

type SearchNoteRow = NoteSearchResult & {
  updatedAt: number
}

export function searchNotes(vaultPath: string, query: string): NoteSearchResult[] {
  const db = getDatabase(vaultPath)
  const normalizedQuery = query.trim().replace(/\\/g, '/')
  const pattern = `%${normalizedQuery}%`
  const titleRows = db.prepare(`
    SELECT id, title, file_path as filePath, NULL as aliasMatch, updated_at as updatedAt
    FROM notes
    WHERE title LIKE ?
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(pattern) as SearchNoteRow[]
  const aliasRows = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, a.alias as aliasMatch, n.updated_at as updatedAt
    FROM note_aliases a
    JOIN notes n ON n.id = a.note_id
    WHERE a.alias LIKE ?
    ORDER BY n.updated_at DESC
    LIMIT 20
  `).all(pattern) as SearchNoteRow[]
  const pathRows = db.prepare(`
    SELECT id, title, file_path as filePath, NULL as aliasMatch, updated_at as updatedAt
    FROM notes
    WHERE file_path LIKE ?
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(pattern) as SearchNoteRow[]

  const merged = new Map<string, SearchNoteRow & { rank: number }>()
  for (const row of titleRows) {
    merged.set(row.id, { ...row, aliasMatch: undefined, rank: 0 })
  }
  for (const row of aliasRows) {
    if (!merged.has(row.id)) {
      merged.set(row.id, { ...row, rank: 1 })
    }
  }
  for (const row of pathRows) {
    if (!merged.has(row.id)) {
      merged.set(row.id, { ...row, aliasMatch: undefined, rank: 2 })
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => a.rank - b.rank || b.updatedAt - a.updatedAt)
    .slice(0, 20)
    .map(({ updatedAt: _updatedAt, rank: _rank, ...row }) => row)
}
