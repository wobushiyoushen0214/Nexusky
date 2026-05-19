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

export function extractNoteReferenceHeading(input: string): string | null {
  let value = input.trim()
  const wikiMatch = value.match(/^\[\[([\s\S]+)\]\]$/)
  if (wikiMatch) value = wikiMatch[1]
  const target = value.split('|')[0]
  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return null
  const heading = target.slice(hashIndex + 1).trim()
  return heading || null
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+#+$/, '').trim().toLowerCase()
}

export function extractMarkdownHeadingSection(content: string, heading: string): string | null {
  const target = normalizeHeadingText(heading)
  if (!target) return null

  const lines = content.split('\n')
  let start = -1
  let level = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) continue
    if (normalizeHeadingText(match[2]) === target) {
      start = i
      level = match[1].length
      break
    }
  }

  if (start < 0) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= level) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join('\n').trim()
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

function dedupeResults(results: AiNoteLookupResult[]): AiNoteLookupResult[] {
  const seen = new Set<string>()
  const unique: AiNoteLookupResult[] = []
  for (const result of results) {
    if (seen.has(result.filePath)) continue
    seen.add(result.filePath)
    unique.push(result)
  }
  return unique
}

export function findNoteForAiTool(vaultPath: string, query: string): AiNoteLookupResult | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return null

  const db = getDatabase(vaultPath)

  const byTitle = db.prepare('SELECT title, file_path FROM notes WHERE title = ? LIMIT 2').all(normalized) as { title: string; file_path: string }[]
  if (byTitle.length === 1) return toResult(vaultPath, byTitle[0])

  const byTitleCaseInsensitive = db.prepare('SELECT title, file_path FROM notes WHERE lower(title) = lower(?) LIMIT 2').all(normalized) as { title: string; file_path: string }[]
  if (byTitleCaseInsensitive.length === 1) return toResult(vaultPath, byTitleCaseInsensitive[0])

  const byAlias = db.prepare(`
    SELECT n.title, n.file_path
    FROM note_aliases a
    JOIN notes n ON n.id = a.note_id
    WHERE a.alias = ?
    LIMIT 2
  `).all(normalized) as { title: string; file_path: string }[]
  if (byAlias.length === 1) return toResult(vaultPath, byAlias[0])

  const byAliasCaseInsensitive = db.prepare(`
    SELECT n.title, n.file_path
    FROM note_aliases a
    JOIN notes n ON n.id = a.note_id
    WHERE lower(a.alias) = lower(?)
    LIMIT 2
  `).all(normalized) as { title: string; file_path: string }[]
  if (byAliasCaseInsensitive.length === 1) return toResult(vaultPath, byAliasCaseInsensitive[0])

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

export function findNoteCandidatesForAiTool(vaultPath: string, query: string, limit = 5): AiNoteLookupResult[] {
  const normalized = normalizeQuery(query)
  if (!normalized) return []

  const db = getDatabase(vaultPath)
  const matches: AiNoteLookupResult[] = []
  const titleRows = db.prepare('SELECT title, file_path FROM notes WHERE title = ? OR lower(title) = lower(?) LIMIT 20').all(normalized, normalized) as { title: string; file_path: string }[]
  matches.push(...titleRows.map((row) => toResult(vaultPath, row)))

  const aliasRows = db.prepare(`
    SELECT n.title, n.file_path
    FROM note_aliases a
    JOIN notes n ON n.id = a.note_id
    WHERE a.alias = ? OR lower(a.alias) = lower(?)
    LIMIT 20
  `).all(normalized, normalized) as { title: string; file_path: string }[]
  matches.push(...aliasRows.map((row) => toResult(vaultPath, row)))

  const pathQuery = normalized.toLowerCase()
  const notes = db.prepare('SELECT title, file_path FROM notes').all() as { title: string; file_path: string }[]
  const pathRows = notes.filter((note) => (
    notePathTarget(note.file_path).toLowerCase() === pathQuery ||
    basename(note.file_path, '.md').toLowerCase() === pathQuery
  ))
  matches.push(...pathRows.map((row) => toResult(vaultPath, row)))
  matches.push(...scanVaultForNotes(vaultPath, normalized))

  return dedupeResults(matches).slice(0, limit)
}

function scanVaultForNote(vaultPath: string, query: string): AiNoteLookupResult | null {
  const matches = scanVaultForNotes(vaultPath, query)
  return matches.length === 1 ? matches[0] : null
}

function scanVaultForNotes(vaultPath: string, query: string): AiNoteLookupResult[] {
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
  return matches
}
