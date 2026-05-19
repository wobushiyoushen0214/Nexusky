import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import { basename, relative } from 'path'
import type Database from 'better-sqlite3'
import { getDatabase } from './database'
import matter from 'gray-matter'

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

export interface OutgoingLinkIndex {
  targetTitle: string
  targetPath?: string
  context: string
  resolved: boolean
}

export interface UnlinkedMentionIndex {
  sourceTitle: string
  sourcePath: string
  context: string
  mention: string
}

export function indexNote(vaultPath: string, filePath: string): void {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const rawContent = readFileSync(filePath, 'utf-8')
  const hash = createHash('md5').update(rawContent).digest('hex')

  const existing = db.prepare('SELECT content_hash FROM notes WHERE file_path = ?').get(relPath) as { content_hash: string } | undefined
  if (existing?.content_hash === hash) return

  const { data: frontmatter, content } = matter(rawContent)
  const stat = statSync(filePath)
  const title = (frontmatter.title as string) || extractTitle(content, filePath)
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
  const deleteAliases = db.prepare('DELETE FROM note_aliases WHERE note_id = ?')
  const insertAlias = db.prepare('INSERT OR IGNORE INTO note_aliases (note_id, alias) VALUES (?, ?)')

  const links = extractLinks(content)
  const aliases = extractAliases(frontmatter)
  const fmTags = Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : []
  const inlineTags = extractTags(content)
  const tags = [...new Set([...fmTags, ...inlineTags])]
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
    deleteAliases.run(id)
    for (const alias of aliases) {
      insertAlias.run(id, alias)
    }
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
  resolveLinks(db, id, title, aliases)
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

export function getOutgoingLinks(vaultPath: string, noteId: string): OutgoingLinkIndex[] {
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT l.target_title as targetTitle, n.file_path as targetPath, l.context,
           CASE WHEN n.id IS NULL THEN 0 ELSE 1 END as resolved
    FROM links l
    LEFT JOIN notes n ON n.id = l.target_note_id
    WHERE l.source_note_id = ?
    ORDER BY resolved DESC, l.target_title ASC
  `).all(noteId) as { targetTitle: string; targetPath: string | null; context: string | null; resolved: number }[]
  return rows.map((row) => ({
    targetTitle: row.targetTitle,
    targetPath: row.targetPath || undefined,
    context: row.context || '',
    resolved: row.resolved === 1
  }))
}

export function getBacklinks(vaultPath: string, noteId: string): { sourceTitle: string; sourcePath: string; context: string }[] {
  const db = getDatabase(vaultPath)
  const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(noteId) as { title: string } | undefined
  if (!note) return []

  const aliases = getNoteLookupAliases(db, noteId, note.title)
  if (aliases.length === 0) {
    return db.prepare(`
      SELECT n.title as sourceTitle, n.file_path as sourcePath, l.context
      FROM links l
      JOIN notes n ON n.id = l.source_note_id
      WHERE l.target_note_id = ? AND l.source_note_id != ?
    `).all(noteId, noteId) as { sourceTitle: string; sourcePath: string; context: string }[]
  }
  return db.prepare(`
    SELECT n.title as sourceTitle, n.file_path as sourcePath, l.context
    FROM links l
    JOIN notes n ON n.id = l.source_note_id
    WHERE (l.target_note_id = ? OR l.target_title IN (${aliases.map(() => '?').join(',')}))
      AND l.source_note_id != ?
  `).all(noteId, ...aliases, noteId) as { sourceTitle: string; sourcePath: string; context: string }[]
}

export function getUnlinkedMentions(vaultPath: string, noteId: string): UnlinkedMentionIndex[] {
  const db = getDatabase(vaultPath)
  const note = db.prepare('SELECT title, file_path FROM notes WHERE id = ?').get(noteId) as { title: string; file_path: string } | undefined
  if (!note) return []

  const aliases = getNoteLookupAliases(db, noteId, note.title, note.file_path)
  if (aliases.length === 0) return []

  const rows = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, f.content
    FROM notes n
    JOIN notes_fts_map m ON m.note_id = n.id
    JOIN notes_fts f ON f.rowid = m.rowid
    WHERE n.id != ?
    ORDER BY n.updated_at DESC
  `).all(noteId) as { id: string; title: string; filePath: string; content: string }[]

  const hasExplicitLink = db.prepare(`
    SELECT 1
    FROM links
    WHERE source_note_id = ?
      AND (target_note_id = ? OR target_title IN (${aliases.map(() => '?').join(',')}))
    LIMIT 1
  `)

  const mentions: UnlinkedMentionIndex[] = []
  for (const row of rows) {
    if (hasExplicitLink.get(row.id, noteId, ...aliases)) continue
    const match = findPlainMention(row.content, aliases)
    if (!match) continue
    mentions.push({
      sourceTitle: row.title,
      sourcePath: row.filePath,
      context: createMentionContext(row.content, match.index),
      mention: match.alias
    })
  }
  return mentions
}

export function getGraphData(vaultPath: string): { nodes: { id: string; title: string; filePath?: string; type: 'file' | 'folder' }[]; edges: { source: string; target: string }[] } {
  const db = getDatabase(vaultPath)
  const notes = db.prepare('SELECT id, title, file_path FROM notes').all() as { id: string; title: string; file_path: string }[]
  const aliases = db.prepare('SELECT note_id, alias FROM note_aliases').all() as { note_id: string; alias: string }[]

  const noteIds = new Set(notes.map((n) => n.id))

  // Build titleToId with collision detection — ambiguous titles are excluded
  const titleToId = new Map<string, string>()
  const ambiguousTitles = new Set<string>()
  for (const n of notes) {
    if (titleToId.has(n.title) && titleToId.get(n.title) !== n.id) {
      ambiguousTitles.add(n.title)
    } else {
      titleToId.set(n.title, n.id)
    }
    const fileName = n.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '')
    if (titleToId.has(fileName) && titleToId.get(fileName) !== n.id) {
      ambiguousTitles.add(fileName)
    } else if (!titleToId.has(fileName)) {
      titleToId.set(fileName, n.id)
    }
  }
  for (const alias of aliases) {
    if (titleToId.has(alias.alias) && titleToId.get(alias.alias) !== alias.note_id) {
      ambiguousTitles.add(alias.alias)
    } else if (!titleToId.has(alias.alias)) {
      titleToId.set(alias.alias, alias.note_id)
    }
  }
  for (const t of ambiguousTitles) titleToId.delete(t)

  // Prefer resolved target_note_id; fall back to titleToId only for unresolved links
  const links = db.prepare('SELECT source_note_id, target_note_id, target_title FROM links').all() as { source_note_id: string; target_note_id: string | null; target_title: string }[]
  const edgeSet = new Set<string>()
  const edges: { source: string; target: string }[] = []
  for (const l of links) {
    const targetId = (l.target_note_id && noteIds.has(l.target_note_id)) ? l.target_note_id : titleToId.get(l.target_title)
    if (targetId && targetId !== l.source_note_id) {
      const key = `${l.source_note_id}->${targetId}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ source: l.source_note_id, target: targetId })
      }
    }
  }

  const folderMap = new Map<string, string>()
  for (const n of notes) {
    const parts = n.file_path.split('/')
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/')
      if (!folderMap.has(folder)) {
        folderMap.set(folder, `folder:${folder}`)
      }
    }
  }

  const folderNodes = Array.from(folderMap.entries()).map(([path, id]) => ({
    id,
    title: path.split('/').pop() || path,
    filePath: path,
    type: 'folder' as const,
  }))

  for (const n of notes) {
    const parts = n.file_path.split('/')
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/')
      const folderId = folderMap.get(folder)
      if (folderId) {
        edges.push({ source: folderId, target: n.id })
      }
    }
  }

  const fileNodes = notes.map((n) => ({ id: n.id, title: n.title, filePath: n.file_path, type: 'file' as const }))

  return { nodes: [...folderNodes, ...fileNodes], edges }
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

function extractAliases(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.aliases ?? frontmatter.alias
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const aliases = values
    .flatMap((value) => String(value).split(','))
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
  return Array.from(new Set(aliases))
}

function getNoteLookupAliases(db: Database.Database, noteId: string, title: string, filePath?: string): string[] {
  const notePath = filePath || (db.prepare('SELECT file_path FROM notes WHERE id = ?').get(noteId) as { file_path: string } | undefined)?.file_path || ''
  const fileTitle = notePath ? basename(notePath, '.md') : ''
  const rows = db.prepare('SELECT alias FROM note_aliases WHERE note_id = ?').all(noteId) as { alias: string }[]
  return Array.from(new Set([title, fileTitle, ...rows.map((row) => row.alias)].map((value) => value.trim()).filter((value) => value.length >= 2)))
}

function findPlainMention(content: string, aliases: string[]): { alias: string; index: number } | null {
  const lowerContent = content.toLowerCase()
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length)
  for (const alias of sortedAliases) {
    const lowerAlias = alias.toLowerCase()
    let index = lowerContent.indexOf(lowerAlias)
    while (index >= 0) {
      const before = content.slice(Math.max(0, index - 2), index)
      const after = content.slice(index + alias.length, index + alias.length + 2)
      const insideWikiLink = before === '[[' && (after.startsWith(']') || after.startsWith('|'))
      if (!insideWikiLink) return { alias, index }
      index = lowerContent.indexOf(lowerAlias, index + alias.length)
    }
  }
  return null
}

function createMentionContext(content: string, index: number): string {
  const lineStart = content.lastIndexOf('\n', index) + 1
  const nextBreak = content.indexOf('\n', index)
  const lineEnd = nextBreak >= 0 ? nextBreak : content.length
  const line = content.slice(lineStart, lineEnd).trim()
  if (line.length <= 220) return line

  const localIndex = index - lineStart
  const start = Math.max(0, localIndex - 90)
  const end = Math.min(line.length, localIndex + 130)
  return `${start > 0 ? '...' : ''}${line.slice(start, end).trim()}${end < line.length ? '...' : ''}`
}

export function resolveAllLinks(vaultPath: string): void {
  const db = getDatabase(vaultPath)
  db.prepare(`
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '') = links.target_title
      UNION
      SELECT note_id FROM note_aliases WHERE alias = links.target_title
      LIMIT 1
    )
    WHERE target_note_id IS NULL
  `).run()
}

function resolveLinks(db: Database.Database, noteId: string, noteTitle: string, noteAliases: string[] = []): void {
  const note = db.prepare('SELECT file_path FROM notes WHERE id = ?').get(noteId) as { file_path: string } | undefined
  const fileName = note ? note.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '') : ''
  const aliases = Array.from(new Set([noteTitle, fileName, ...noteAliases].filter(Boolean)))

  for (const alias of aliases) {
    db.prepare(`
      UPDATE links SET target_note_id = ?
      WHERE target_title = ? AND target_note_id IS NULL
    `).run(noteId, alias)
  }

  db.prepare(`
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '') = links.target_title
      UNION
      SELECT note_id FROM note_aliases WHERE alias = links.target_title
      LIMIT 1
    )
    WHERE source_note_id = ? AND target_note_id IS NULL
  `).run(noteId)
}

const TAG_REGEX = /(?:^|[^&\w一-鿿])#([a-zA-Z一-鿿][\w一-鿿-]*)/g

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
