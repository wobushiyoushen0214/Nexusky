import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import { basename, relative } from 'path'
import type Database from 'better-sqlite3'
import { getDatabase } from './database'

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export interface NoteIndex {
  id: string
  title: string
  filePath: string
  createdAt: number
  updatedAt: number
  contentHash: string
}

export interface LinkIndex {
  sourceNoteId: string
  targetTitle: string
  context: string
}

export function indexNote(vaultPath: string, filePath: string): void {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const content = readFileSync(filePath, 'utf-8')
  const hash = createHash('md5').update(content).digest('hex')

  const existing = db.prepare('SELECT content_hash FROM notes WHERE file_path = ?').get(relPath) as { content_hash: string } | undefined
  if (existing?.content_hash === hash) return

  const stat = statSync(filePath)
  const title = extractTitle(content, filePath)
  const id = createHash('md5').update(relPath).digest('hex')

  const upsert = db.prepare(`
    INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      updated_at = excluded.updated_at,
      content_hash = excluded.content_hash
  `)

  const deleteLinks = db.prepare('DELETE FROM links WHERE source_note_id = ?')
  const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context) VALUES (?, ?, ?)')

  const links = extractLinks(content)

  const transaction = db.transaction(() => {
    upsert.run(id, title, relPath, Math.floor(stat.birthtimeMs), Math.floor(stat.mtimeMs), hash)
    deleteLinks.run(id)
    for (const link of links) {
      insertLink.run(id, link.targetTitle, link.context)
    }
  })

  transaction()
  resolveLinks(db, id, title)
}

export function removeNoteIndex(vaultPath: string, filePath: string): void {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  db.prepare('DELETE FROM notes WHERE file_path = ?').run(relPath)
}

export function getAllNotes(vaultPath: string): NoteIndex[] {
  const db = getDatabase(vaultPath)
  return db.prepare('SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt, content_hash as contentHash FROM notes ORDER BY updated_at DESC').all() as NoteIndex[]
}

export function getBacklinks(vaultPath: string, noteId: string): { sourceTitle: string; sourcePath: string; context: string }[] {
  const db = getDatabase(vaultPath)
  const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(noteId) as { title: string } | undefined
  if (!note) return []

  return db.prepare(`
    SELECT n.title as sourceTitle, n.file_path as sourcePath, l.context
    FROM links l
    JOIN notes n ON n.id = l.source_note_id
    WHERE l.target_title = ? AND l.source_note_id != ?
  `).all(note.title, noteId) as { sourceTitle: string; sourcePath: string; context: string }[]
}

export function getGraphData(vaultPath: string): { nodes: { id: string; title: string }[]; edges: { source: string; target: string }[] } {
  const db = getDatabase(vaultPath)
  const nodes = db.prepare('SELECT id, title FROM notes').all() as { id: string; title: string }[]
  const edges = db.prepare(`
    SELECT l.source_note_id as source, n.id as target
    FROM links l
    JOIN notes n ON n.title = l.target_title
    WHERE l.target_note_id IS NOT NULL OR n.id IS NOT NULL
  `).all() as { source: string; target: string }[]

  return { nodes, edges }
}

function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return basename(filePath, '.md')
}

function extractLinks(content: string): { targetTitle: string; context: string }[] {
  const links: { targetTitle: string; context: string }[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    let match: RegExpExecArray | null
    WIKILINK_REGEX.lastIndex = 0
    while ((match = WIKILINK_REGEX.exec(line)) !== null) {
      links.push({
        targetTitle: match[1].trim(),
        context: line.trim().slice(0, 200)
      })
    }
  }

  return links
}

function resolveLinks(db: Database.Database, noteId: string, noteTitle: string): void {
  db.prepare(`
    UPDATE links SET target_note_id = ?
    WHERE target_title = ? AND target_note_id IS NULL
  `).run(noteId, noteTitle)

  db.prepare(`
    UPDATE links SET target_note_id = (SELECT id FROM notes WHERE title = target_title)
    WHERE source_note_id = ? AND target_note_id IS NULL
  `).run(noteId)
}
