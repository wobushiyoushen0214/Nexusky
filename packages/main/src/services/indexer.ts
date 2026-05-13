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
  const deleteTags = db.prepare('DELETE FROM note_tags WHERE note_id = ?')
  const findOrCreateTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
  const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?')
  const insertNoteTag = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')

  const links = extractLinks(content)
  const tags = extractTags(content)
  const tasks = extractTasks(content)

  const upsertFtsMap = db.prepare('INSERT OR IGNORE INTO notes_fts_map (note_id) VALUES (?)')
  const getFtsRowid = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?')
  const deleteFts = db.prepare('DELETE FROM notes_fts WHERE rowid = ?')
  const insertFts = db.prepare('INSERT INTO notes_fts (rowid, title, content) VALUES (?, ?, ?)')
  const deleteTasks = db.prepare('DELETE FROM tasks WHERE note_id = ?')
  const insertTask = db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, ?)')

  const transaction = db.transaction(() => {
    upsert.run(id, title, relPath, Math.floor(stat.birthtimeMs), Math.floor(stat.mtimeMs), hash)
    deleteLinks.run(id)
    for (const link of links) {
      insertLink.run(id, link.targetTitle, link.context)
    }
    deleteTags.run(id)
    for (const tag of tags) {
      findOrCreateTag.run(tag)
      const row = getTagId.get(tag) as { id: number } | undefined
      if (row) insertNoteTag.run(id, row.id)
    }
    deleteTasks.run(id)
    for (const task of tasks) {
      insertTask.run(id, task.text, task.done ? 1 : 0)
    }

    upsertFtsMap.run(id)
    const ftsRow = getFtsRowid.get(id) as { rowid: number } | undefined
    if (ftsRow) {
      deleteFts.run(ftsRow.rowid)
      insertFts.run(ftsRow.rowid, title, content)
    }
  })

  transaction()
  resolveLinks(db, id, title)
}

export function removeNoteIndex(vaultPath: string, filePath: string): void {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const note = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
  if (note) {
    const ftsRow = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?').get(note.id) as { rowid: number } | undefined
    if (ftsRow) {
      db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(ftsRow.rowid)
      db.prepare('DELETE FROM notes_fts_map WHERE note_id = ?').run(note.id)
    }
  }
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
  const nodes = db.prepare('SELECT id, title, file_path FROM notes').all() as { id: string; title: string; file_path: string }[]

  const titleToId = new Map<string, string>()
  for (const n of nodes) {
    titleToId.set(n.title, n.id)
    const fileName = n.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '')
    if (!titleToId.has(fileName)) titleToId.set(fileName, n.id)
  }

  const links = db.prepare('SELECT source_note_id, target_title FROM links').all() as { source_note_id: string; target_title: string }[]
  const edges: { source: string; target: string }[] = []
  for (const l of links) {
    const targetId = titleToId.get(l.target_title)
    if (targetId && targetId !== l.source_note_id) {
      edges.push({ source: l.source_note_id, target: targetId })
    }
  }

  return { nodes: nodes.map((n) => ({ id: n.id, title: n.title, filePath: n.file_path })), edges }
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

export function resolveAllLinks(vaultPath: string): void {
  const db = getDatabase(vaultPath)
  db.prepare(`
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '') = links.target_title
      LIMIT 1
    )
    WHERE target_note_id IS NULL
  `).run()
}

function resolveLinks(db: Database.Database, noteId: string, noteTitle: string): void {
  const note = db.prepare('SELECT file_path FROM notes WHERE id = ?').get(noteId) as { file_path: string } | undefined
  const fileName = note ? note.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '') : ''

  db.prepare(`
    UPDATE links SET target_note_id = ?
    WHERE target_title = ? AND target_note_id IS NULL
  `).run(noteId, noteTitle)

  if (fileName && fileName !== noteTitle) {
    db.prepare(`
      UPDATE links SET target_note_id = ?
      WHERE target_title = ? AND target_note_id IS NULL
    `).run(noteId, fileName)
  }

  db.prepare(`
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '') = links.target_title
      LIMIT 1
    )
    WHERE source_note_id = ? AND target_note_id IS NULL
  `).run(noteId)
}

const TAG_REGEX = /(?:^|\s)#([a-zA-Z一-鿿][\w一-鿿-]*)/g

function extractTags(content: string): string[] {
  const tags = new Set<string>()
  let match: RegExpExecArray | null
  TAG_REGEX.lastIndex = 0
  while ((match = TAG_REGEX.exec(content)) !== null) {
    tags.add(match[1])
  }
  return Array.from(tags)
}

export function getAllTags(vaultPath: string): { name: string; count: number }[] {
  const db = getDatabase(vaultPath)
  return db.prepare(`
    SELECT t.name, COUNT(nt.note_id) as count
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    GROUP BY t.id
    ORDER BY count DESC
  `).all() as { name: string; count: number }[]
}

export function getNotesByTag(vaultPath: string, tag: string): NoteIndex[] {
  const db = getDatabase(vaultPath)
  return db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, n.created_at as createdAt, n.updated_at as updatedAt, n.content_hash as contentHash
    FROM notes n
    JOIN note_tags nt ON nt.note_id = n.id
    JOIN tags t ON t.id = nt.tag_id
    WHERE t.name = ?
    ORDER BY n.updated_at DESC
  `).all(tag) as NoteIndex[]
}

function extractTasks(content: string): { text: string; done: boolean }[] {
  const tasks: { text: string; done: boolean }[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const todoMatch = line.match(/^[-*]\s+\[\s?\]\s+(.+)/)
    const doneMatch = line.match(/^[-*]\s+\[x\]\s+(.+)/i)
    if (todoMatch) tasks.push({ text: todoMatch[1].trim(), done: false })
    else if (doneMatch) tasks.push({ text: doneMatch[1].trim(), done: true })
  }
  return tasks
}

export function getAllTasks(vaultPath: string): { text: string; done: boolean; noteTitle: string; filePath: string }[] {
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT t.text, t.done, n.title as noteTitle, n.file_path as filePath
    FROM tasks t
    JOIN notes n ON n.id = t.note_id
    ORDER BY t.done ASC, n.updated_at DESC
  `).all() as { text: string; done: number; noteTitle: string; filePath: string }[]
  return rows.map((r) => ({ ...r, done: r.done === 1 }))
}
