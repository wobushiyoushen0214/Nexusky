import { existsSync, readdirSync } from 'fs'
import { basename, join, relative } from 'path'
import { getDatabase } from '../database'

export interface AiNoteLookupResult {
  title: string
  filePath: string
  absolutePath: string
}

function normalizeQuery(input: string): string {
  let value = input.trim()
  const wikiMatch = value.match(/^\[\[([\s\S]+)\]\]$/)
  if (wikiMatch) value = wikiMatch[1]
  value = value.split('|')[0].split('#')[0].trim().replace(/\\/g, '/')
  return value.replace(/\.md$/i, '')
}

function notePathTarget(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\.md$/i, '')
}

function toResult(vaultPath: string, row: { title: string; file_path: string }): AiNoteLookupResult {
  return {
    title: row.title,
    filePath: row.file_path,
    absolutePath: join(vaultPath, row.file_path)
  }
}

function singleResult(vaultPath: string, rows: { title: string; file_path: string }[]): AiNoteLookupResult | null {
  return rows.length === 1 ? toResult(vaultPath, rows[0]) : null
}

export function findNoteForAiTool(vaultPath: string, query: string): AiNoteLookupResult | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return null

  const db = getDatabase(vaultPath)

  const byTitle = db.prepare('SELECT title, file_path FROM notes WHERE title = ? LIMIT 2').all(normalized) as { title: string; file_path: string }[]
  if (byTitle.length === 1) return toResult(vaultPath, byTitle[0])

  const byAlias = db.prepare(`
    SELECT n.title, n.file_path
    FROM note_aliases a
    JOIN notes n ON n.id = a.note_id
    WHERE a.alias = ?
    LIMIT 2
  `).all(normalized) as { title: string; file_path: string }[]
  if (byAlias.length === 1) return toResult(vaultPath, byAlias[0])

  const pathQuery = normalized.toLowerCase()
  const notes = db.prepare('SELECT title, file_path FROM notes').all() as { title: string; file_path: string }[]
  const byPath = notes.filter((note) => notePathTarget(note.file_path).toLowerCase() === pathQuery)
  const pathResult = singleResult(vaultPath, byPath)
  if (pathResult) return pathResult

  const byFileName = notes.filter((note) => basename(note.file_path, '.md').toLowerCase() === pathQuery)
  const fileNameResult = singleResult(vaultPath, byFileName)
  if (fileNameResult) return fileNameResult

  return scanVaultForNote(vaultPath, normalized)
}

function scanVaultForNote(vaultPath: string, query: string): AiNoteLookupResult | null {
  const matches: AiNoteLookupResult[] = []
  const target = query.toLowerCase()

  function scanDir(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scanDir(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relPath = relative(vaultPath, fullPath).replace(/\\/g, '/')
          const relTarget = notePathTarget(relPath).toLowerCase()
          const nameTarget = basename(entry.name, '.md').toLowerCase()
          if (relTarget === target || nameTarget === target) {
            matches.push({ title: basename(entry.name, '.md'), filePath: relPath, absolutePath: fullPath })
          }
        }
      }
    } catch {}
  }

  if (existsSync(vaultPath)) scanDir(vaultPath)
  return matches.length === 1 ? matches[0] : null
}
