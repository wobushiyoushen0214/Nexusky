import { createHash } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { basename, join, relative } from 'path'
import type Database from 'better-sqlite3'
import { getDatabase } from './database'
import matter from 'gray-matter'
import type { GraphData, GraphEdge, GraphEdgeLinkType, GraphMode, GraphNode, PropertyTableRow, PropertyValue } from '@shared/types/ipc'
import { stripMarkdownComments } from '../../../shared/src/markdown/comments'
import { invalidateVaultQueryCache, invalidateVaultQueryCacheForIndexedFile } from './db-query-cache'

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const DATAVIEW_FIELD_REGEX = /^\s*(?:[-*+]\s+(?:\[[^\]\r\n]?\]\s+)?)?([^:\n]+?)::\s*(.*?)\s*$/
const NOTE_PROPERTIES_VERSION = 1

interface IndexerStatements {
  selectHash: Database.Statement
  selectMoveCandidate: Database.Statement
  moveNotePath: Database.Statement
  updateKanbanSourcePath: Database.Statement
  updateContextEventPath: Database.Statement
  updateRelationSourcePath: Database.Statement
  updateRelationTargetPath: Database.Statement
  updateThemeMembershipPath: Database.Statement
  upsertNote: Database.Statement
  deleteLinks: Database.Statement
  insertLink: Database.Statement
  deleteTags: Database.Statement
  findOrCreateTag: Database.Statement
  getTagId: Database.Statement
  insertNoteTag: Database.Statement
  deleteAliases: Database.Statement
  insertAlias: Database.Statement
  upsertFtsMap: Database.Statement
  getFtsRowid: Database.Statement
  deleteFts: Database.Statement
  insertFts: Database.Statement
  deleteTasks: Database.Statement
  insertTask: Database.Statement
}

const indexerStatementsCache = new WeakMap<Database.Database, IndexerStatements>()

function getIndexerStatements(db: Database.Database): IndexerStatements {
  const cached = indexerStatementsCache.get(db)
  if (cached) return cached
  const prepared: IndexerStatements = {
    selectHash: db.prepare('SELECT id, content_hash, properties_version FROM notes WHERE file_path = ?'),
    selectMoveCandidate: db.prepare(`
      SELECT id, file_path
      FROM notes
      WHERE content_hash = ? AND file_path != ?
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    moveNotePath: db.prepare('UPDATE notes SET file_path = ? WHERE id = ?'),
    updateKanbanSourcePath: db.prepare('UPDATE kanban_tasks SET source_file_path = ? WHERE source_note_id = ?'),
    updateContextEventPath: db.prepare("UPDATE context_events SET entity_path = ? WHERE entity_type = 'note' AND entity_id = ?"),
    updateRelationSourcePath: db.prepare("UPDATE ai_relations SET source_path = ? WHERE source_type = 'note' AND source_id = ?"),
    updateRelationTargetPath: db.prepare("UPDATE ai_relations SET target_path = ? WHERE target_type = 'note' AND target_id = ?"),
    updateThemeMembershipPath: db.prepare("UPDATE theme_memberships SET entity_path = ? WHERE entity_type = 'note' AND entity_id = ?"),
    upsertNote: db.prepare(`
      INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash, properties_json, properties_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        content_hash = excluded.content_hash,
        properties_json = excluded.properties_json,
        properties_version = excluded.properties_version
    `),
    deleteLinks: db.prepare('DELETE FROM links WHERE source_note_id = ?'),
    insertLink: db.prepare('INSERT INTO links (source_note_id, target_title, context, line) VALUES (?, ?, ?, ?)'),
    deleteTags: db.prepare('DELETE FROM note_tags WHERE note_id = ?'),
    findOrCreateTag: db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)'),
    getTagId: db.prepare('SELECT id FROM tags WHERE name = ?'),
    insertNoteTag: db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)'),
    deleteAliases: db.prepare('DELETE FROM note_aliases WHERE note_id = ?'),
    insertAlias: db.prepare('INSERT OR IGNORE INTO note_aliases (note_id, alias) VALUES (?, ?)'),
    upsertFtsMap: db.prepare('INSERT OR IGNORE INTO notes_fts_map (note_id) VALUES (?)'),
    getFtsRowid: db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?'),
    deleteFts: db.prepare('DELETE FROM notes_fts WHERE rowid = ?'),
    insertFts: db.prepare('INSERT INTO notes_fts (rowid, title, content) VALUES (?, ?, ?)'),
    deleteTasks: db.prepare('DELETE FROM tasks WHERE note_id = ?'),
    insertTask: db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, ?)'),
  }
  indexerStatementsCache.set(db, prepared)
  return prepared
}
const NOTE_FILE_TITLE_SQL = "REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '')"
const NOTE_PATH_TARGET_SQL = "CASE WHEN lower(file_path) LIKE '%.md' THEN substr(file_path, 1, length(file_path) - 3) ELSE file_path END"
const EXACT_LINK_TARGET_EXISTS_SQL = `
  SELECT id FROM notes WHERE title = links.target_title
  UNION
  SELECT id FROM notes WHERE ${NOTE_FILE_TITLE_SQL} = links.target_title
  UNION
  SELECT id FROM notes WHERE ${NOTE_PATH_TARGET_SQL} = links.target_title
  UNION
  SELECT note_id FROM note_aliases WHERE alias = links.target_title
`
const CASE_INSENSITIVE_LINK_TARGET_SQL = `
  WITH candidates(id) AS (
    SELECT id FROM notes WHERE lower(title) = lower(links.target_title)
    UNION
    SELECT id FROM notes WHERE lower(${NOTE_FILE_TITLE_SQL}) = lower(links.target_title)
    UNION
    SELECT id FROM notes WHERE lower(${NOTE_PATH_TARGET_SQL}) = lower(links.target_title)
    UNION
    SELECT note_id FROM note_aliases WHERE lower(alias) = lower(links.target_title)
  )
  SELECT id FROM candidates
  WHERE (SELECT COUNT(*) FROM candidates) = 1
  LIMIT 1
`

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
  line: number
  context: string
  resolved: boolean
}

export interface UnlinkedMentionIndex {
  sourceTitle: string
  sourcePath: string
  line: number
  context: string
  mention: string
}

export interface OutgoingUnlinkedMentionIndex {
  targetTitle: string
  targetPath: string
  line: number
  context: string
  mention: string
}

function findMovedNoteCandidate(
  vaultPath: string,
  relPath: string,
  contentHash: string,
  stmts: IndexerStatements
): { id: string; file_path: string } | undefined {
  const candidate = stmts.selectMoveCandidate.get(contentHash, relPath) as { id: string; file_path: string } | undefined
  if (!candidate) return undefined
  if (existsSync(join(vaultPath, candidate.file_path))) return undefined
  return candidate
}

function updateIndexedNotePathReferences(stmts: IndexerStatements, noteId: string, relPath: string): void {
  stmts.updateKanbanSourcePath.run(relPath, noteId)
  stmts.updateContextEventPath.run(relPath, noteId)
  stmts.updateRelationSourcePath.run(relPath, noteId)
  stmts.updateRelationTargetPath.run(relPath, noteId)
  stmts.updateThemeMembershipPath.run(relPath, noteId)
}

export function indexNote(vaultPath: string, filePath: string): string {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const rawContent = readFileSync(filePath, 'utf-8')
  const hash = createHash('md5').update(rawContent).digest('hex')

  const stmts = getIndexerStatements(db)
  const existing = stmts.selectHash.get(relPath) as { id: string; content_hash: string; properties_version?: number } | undefined
  if (existing?.content_hash === hash && (existing.properties_version || 0) >= NOTE_PROPERTIES_VERSION) return existing.id
  const moveCandidate = !existing
    ? findMovedNoteCandidate(vaultPath, relPath, hash, stmts)
    : undefined

  const { data: frontmatter, content } = matter(rawContent)
  const visibleContent = stripMarkdownComments(content, { preserveLineBreaks: true })
  const inlineProperties = extractDataviewInlineFields(visibleContent)
  const stat = statSync(filePath)
  const inlineTitle = normalizePropertyScalar(inlineProperties.title)
  const title = (frontmatter.title as string) || (typeof inlineTitle === 'string' ? inlineTitle : undefined) || extractTitle(visibleContent, filePath)
  const id = existing?.id || moveCandidate?.id || createHash('md5').update(relPath).digest('hex')

  const links = extractLinks(visibleContent)
  const aliases = Array.from(new Set([...extractAliases(frontmatter), ...extractInlineAliases(inlineProperties)]))
  const fmTags = normalizeTagNames(frontmatter.tags)
  const inlineTags = extractTags(visibleContent)
  const dataviewTags = normalizeTagNames(inlineProperties.tags)
  const tags = [...new Set([...fmTags, ...inlineTags, ...dataviewTags])]
  const tasks = extractTasks(visibleContent)
  const properties = buildIndexedProperties({ title, aliases, tags, frontmatter, inlineProperties })
  const propertiesJson = JSON.stringify(properties)

  const transaction = db.transaction(() => {
    if (moveCandidate) {
      stmts.moveNotePath.run(relPath, id)
      updateIndexedNotePathReferences(stmts, id, relPath)
    }
    stmts.upsertNote.run(id, title, relPath, Math.floor(stat.birthtimeMs), Math.floor(stat.mtimeMs), hash, propertiesJson, NOTE_PROPERTIES_VERSION)
    stmts.deleteLinks.run(id)
    for (const link of links) {
      stmts.insertLink.run(id, link.targetTitle, link.context, link.line)
    }
    stmts.deleteTags.run(id)
    stmts.deleteAliases.run(id)
    for (const alias of aliases) {
      stmts.insertAlias.run(id, alias)
    }
    for (const tag of tags) {
      stmts.findOrCreateTag.run(tag)
      const row = stmts.getTagId.get(tag) as { id: number } | undefined
      if (row) stmts.insertNoteTag.run(id, row.id)
    }
    stmts.deleteTasks.run(id)
    for (const task of tasks) {
      stmts.insertTask.run(id, task.text, task.done ? 1 : 0)
    }

    stmts.upsertFtsMap.run(id)
    const ftsRow = stmts.getFtsRowid.get(id) as { rowid: number } | undefined
    if (ftsRow) {
      stmts.deleteFts.run(ftsRow.rowid)
      stmts.insertFts.run(ftsRow.rowid, title, visibleContent)
    }
  })

  transaction()
  resolveLinks(db, id, title, aliases)
  invalidateVaultQueryCacheForIndexedFile(vaultPath, { noteId: id, filePath: relPath })
  return id
}

export function removeNoteIndex(vaultPath: string, filePath: string): string | null {
  const db = getDatabase(vaultPath)
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const note = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
  if (!note) return null
  const ftsRow = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?').get(note.id) as { rowid: number } | undefined
  if (ftsRow) {
    db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(ftsRow.rowid)
    db.prepare('DELETE FROM notes_fts_map WHERE note_id = ?').run(note.id)
  }
  db.prepare('DELETE FROM notes WHERE file_path = ?').run(relPath)
  invalidateVaultQueryCacheForIndexedFile(vaultPath, { noteId: note.id, filePath: relPath })
  return note.id
}

export function getAllNotes(vaultPath: string): NoteIndex[] {
  const db = getDatabase(vaultPath)
  return db.prepare('SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt, content_hash as contentHash FROM notes ORDER BY updated_at DESC').all() as NoteIndex[]
}

export function getPropertyRows(vaultPath: string): PropertyTableRow[] {
  const db = getDatabase(vaultPath)
  const notes = db.prepare(`
    SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt, properties_json as propertiesJson
    FROM notes
    ORDER BY updated_at DESC
  `).all() as { id: string; title: string; filePath: string; createdAt: number; updatedAt: number; propertiesJson?: string }[]

  const aliasesByNote = new Map<string, string[]>()
  for (const row of db.prepare('SELECT note_id as noteId, alias FROM note_aliases ORDER BY alias ASC').all() as { noteId: string; alias: string }[]) {
    aliasesByNote.set(row.noteId, [...(aliasesByNote.get(row.noteId) || []), row.alias])
  }

  const tagsByNote = new Map<string, string[]>()
  for (const row of db.prepare(`
    SELECT nt.note_id as noteId, t.name
    FROM note_tags nt
    JOIN tags t ON t.id = nt.tag_id
    ORDER BY t.name ASC
  `).all() as { noteId: string; name: string }[]) {
    tagsByNote.set(row.noteId, [...(tagsByNote.get(row.noteId) || []), row.name])
  }

  return notes.map((note) => {
    const properties = parseStoredProperties(note.propertiesJson)
    properties.title = normalizePropertyValue(properties.title) ?? note.title
    properties.aliases = aliasesByNote.get(note.id) || normalizeListProperty(properties.aliases ?? properties.alias)
    properties.tags = tagsByNote.get(note.id) || normalizeTagNames(properties.tags)
    properties.cssclasses = normalizeCssClasses(properties.cssclasses ?? properties.cssclass)

    return {
      id: note.id,
      title: note.title,
      filePath: note.filePath,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      properties
    }
  })
}

export function getOutgoingLinks(vaultPath: string, noteId: string): OutgoingLinkIndex[] {
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT l.target_title as targetTitle, n.file_path as targetPath, l.context, l.line,
           CASE WHEN n.id IS NULL THEN 0 ELSE 1 END as resolved
    FROM links l
    LEFT JOIN notes n ON n.id = l.target_note_id
    WHERE l.source_note_id = ?
    ORDER BY resolved DESC, l.target_title ASC
  `).all(noteId) as { targetTitle: string; targetPath: string | null; context: string | null; line: number; resolved: number }[]
  return rows.map((row) => ({
    targetTitle: row.targetTitle,
    targetPath: row.targetPath || undefined,
    line: row.line || 1,
    context: row.context || '',
    resolved: row.resolved === 1
  }))
}

export function getBacklinks(vaultPath: string, noteId: string): { sourceTitle: string; sourcePath: string; line: number; context: string }[] {
  const db = getDatabase(vaultPath)
  const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(noteId) as { title: string } | undefined
  if (!note) return []

  const aliases = getNoteLookupAliases(db, noteId, note.title)
  if (aliases.length === 0) {
    return db.prepare(`
      SELECT n.title as sourceTitle, n.file_path as sourcePath, l.context, l.line
      FROM links l
      JOIN notes n ON n.id = l.source_note_id
      WHERE l.target_note_id = ? AND l.source_note_id != ?
    `).all(noteId, noteId) as { sourceTitle: string; sourcePath: string; context: string; line: number }[]
  }
  return db.prepare(`
    SELECT n.title as sourceTitle, n.file_path as sourcePath, l.context, l.line
    FROM links l
    JOIN notes n ON n.id = l.source_note_id
    WHERE (l.target_note_id = ? OR l.target_title IN (${aliases.map(() => '?').join(',')}))
      AND l.source_note_id != ?
  `).all(noteId, ...aliases, noteId) as { sourceTitle: string; sourcePath: string; context: string; line: number }[]
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
      line: getLineNumberAtIndex(row.content, match.index),
      context: createMentionContext(row.content, match.index),
      mention: match.alias
    })
  }
  return mentions
}

export function getOutgoingUnlinkedMentions(vaultPath: string, noteId: string): OutgoingUnlinkedMentionIndex[] {
  const db = getDatabase(vaultPath)
  const source = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, f.content
    FROM notes n
    JOIN notes_fts_map m ON m.note_id = n.id
    JOIN notes_fts f ON f.rowid = m.rowid
    WHERE n.id = ?
  `).get(noteId) as { id: string; title: string; filePath: string; content: string } | undefined
  if (!source) return []

  const candidates = db.prepare(`
    SELECT id, title, file_path as filePath
    FROM notes
    WHERE id != ?
    ORDER BY updated_at DESC
  `).all(noteId) as { id: string; title: string; filePath: string }[]

  const mentions: OutgoingUnlinkedMentionIndex[] = []
  for (const candidate of candidates) {
    const aliases = getNoteLookupAliases(db, candidate.id, candidate.title, candidate.filePath)
    if (aliases.length === 0) continue
    const hasExplicitLink = db.prepare(`
      SELECT 1
      FROM links
      WHERE source_note_id = ?
        AND (target_note_id = ? OR target_title IN (${aliases.map(() => '?').join(',')}))
      LIMIT 1
    `).get(noteId, candidate.id, ...aliases)
    if (hasExplicitLink) continue
    const match = findPlainMention(source.content, aliases)
    if (!match) continue
    mentions.push({
      targetTitle: candidate.title,
      targetPath: candidate.filePath,
      line: getLineNumberAtIndex(source.content, match.index),
      context: createMentionContext(source.content, match.index),
      mention: match.alias
    })
  }
  return mentions
}

interface GraphNoteRow {
  id: string
  title: string
  file_path: string
}

interface AggregatedGraphEdge {
  source: string
  target: string
  linkType: GraphEdgeLinkType
  weight: number
}

function normalizeGraphFolderPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function getGraphFolderId(path: string): string {
  return `folder:${path || '.'}`
}

function getGraphFolderTitle(path: string): string {
  if (!path) return '/'
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function getTopLevelGraphFolderPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.indexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

function getNotePathWithinGraphFolder(filePath: string, folderPath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  if (!folderPath) return normalized
  const prefix = `${folderPath}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null
}

function createFolderGraphNode(path: string, stats?: { noteCount?: number; directNoteCount?: number; childFolderCount?: number }): GraphNode {
  return {
    id: getGraphFolderId(path),
    title: getGraphFolderTitle(path),
    filePath: path,
    type: 'folder',
    ...stats,
  }
}

function getNoteFolderPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

function buildOverviewGraphData(notes: GraphNoteRow[], edges: GraphEdge[]): GraphData {
  const fileNodes: GraphNode[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    filePath: note.file_path,
    type: 'file',
    folder: getNoteFolderPath(note.file_path),
  }))
  return { nodes: fileNodes, edges }
}

function addAggregatedGraphEdge(
  edges: Map<string, AggregatedGraphEdge>,
  source: string,
  target: string,
  linkType: GraphEdgeLinkType,
  undirected = false,
): void {
  if (source === target) return
  let edgeSource = source
  let edgeTarget = target
  if (undirected && edgeTarget < edgeSource) {
    edgeSource = target
    edgeTarget = source
  }
  const key = `${edgeSource}->${edgeTarget}->${linkType}`
  const existing = edges.get(key)
  if (existing) {
    existing.weight += 1
    return
  }
  edges.set(key, { source: edgeSource, target: edgeTarget, linkType, weight: 1 })
}

function addGraphEdge(
  edges: GraphEdge[],
  edgeSet: Set<string>,
  edge: GraphEdge,
): void {
  if (edge.source === edge.target) return
  const key = `${edge.source}->${edge.target}->${edge.linkType}`
  if (edgeSet.has(key)) return
  edgeSet.add(key)
  edges.push(edge)
}

function buildGroupGraphData(notes: GraphNoteRow[], edges: GraphEdge[]): GraphData {
  const noteCountByFolder = new Map<string, number>()
  const folderPathByNoteId = new Map<string, string>()

  for (const note of notes) {
    const folderPath = getTopLevelGraphFolderPath(note.file_path)
    folderPathByNoteId.set(note.id, folderPath)
    noteCountByFolder.set(folderPath, (noteCountByFolder.get(folderPath) || 0) + 1)
  }

  const nodes = Array.from(noteCountByFolder.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, noteCount]) => createFolderGraphNode(path, { noteCount }))

  const aggregatedEdges = new Map<string, AggregatedGraphEdge>()
  for (const edge of edges) {
    if (edge.linkType !== 'inferred') continue
    const sourceFolder = folderPathByNoteId.get(edge.source)
    const targetFolder = folderPathByNoteId.get(edge.target)
    if (sourceFolder == null || targetFolder == null || sourceFolder === targetFolder) continue
    addAggregatedGraphEdge(
      aggregatedEdges,
      getGraphFolderId(sourceFolder),
      getGraphFolderId(targetFolder),
      'inferred',
      true,
    )
  }

  return { nodes, edges: Array.from(aggregatedEdges.values()) }
}

function buildFlatFolderGraphData(notes: GraphNoteRow[], edges: GraphEdge[], rootPath = ''): GraphData {
  const normalizedRootPath = normalizeGraphFolderPath(rootPath)
  const folderStats = new Map<string, { noteCount: number; directNoteCount: number; childFolders: Set<string> }>()
  const fileNodes: GraphNode[] = []
  const visibleNoteIds = new Set<string>()
  const ownershipEdges: GraphEdge[] = []
  const ownershipEdgeSet = new Set<string>()

  const ensureFolderStats = (path: string) => {
    const existing = folderStats.get(path)
    if (existing) return existing
    const stats = { noteCount: 0, directNoteCount: 0, childFolders: new Set<string>() }
    folderStats.set(path, stats)
    return stats
  }

  if (normalizedRootPath) {
    ensureFolderStats(normalizedRootPath)
  }

  for (const note of notes) {
    const remainder = getNotePathWithinGraphFolder(note.file_path, normalizedRootPath)
    if (remainder == null || !remainder) continue

    fileNodes.push({ id: note.id, title: note.title, filePath: note.file_path, type: 'file' })
    visibleNoteIds.add(note.id)

    const parts = remainder.split('/').filter(Boolean)
    const folderParts = parts.slice(0, -1)

    if (normalizedRootPath) {
      const rootStats = ensureFolderStats(normalizedRootPath)
      rootStats.noteCount += 1
      if (folderParts.length === 0) rootStats.directNoteCount += 1
      else rootStats.childFolders.add(folderParts[0])
    }

    for (let index = 0; index < folderParts.length; index += 1) {
      const relativeFolderPath = folderParts.slice(0, index + 1).join('/')
      const folderPath = normalizedRootPath ? `${normalizedRootPath}/${relativeFolderPath}` : relativeFolderPath
      const stats = ensureFolderStats(folderPath)
      stats.noteCount += 1
      if (index === folderParts.length - 1) stats.directNoteCount += 1
      else stats.childFolders.add(folderParts[index + 1])

      const parentPath = index === 0
        ? normalizedRootPath
        : normalizedRootPath
          ? `${normalizedRootPath}/${folderParts.slice(0, index).join('/')}`
          : folderParts.slice(0, index).join('/')
      if (parentPath) {
        addGraphEdge(ownershipEdges, ownershipEdgeSet, {
          source: getGraphFolderId(parentPath),
          target: getGraphFolderId(folderPath),
          linkType: 'folder',
        })
      }
    }

    if (folderParts.length > 0) {
      const parentFolderPath = normalizedRootPath
        ? `${normalizedRootPath}/${folderParts.join('/')}`
        : folderParts.join('/')
      addGraphEdge(ownershipEdges, ownershipEdgeSet, {
        source: getGraphFolderId(parentFolderPath),
        target: note.id,
        linkType: 'folder',
      })
    } else if (normalizedRootPath) {
      addGraphEdge(ownershipEdges, ownershipEdgeSet, {
        source: getGraphFolderId(normalizedRootPath),
        target: note.id,
        linkType: 'folder',
      })
    }
  }

  const folderNodes = Array.from(folderStats.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, stats]) => createFolderGraphNode(path, {
      noteCount: stats.noteCount,
      directNoteCount: stats.directNoteCount,
      childFolderCount: stats.childFolders.size,
    }))

  const relationEdges: GraphEdge[] = []
  const relationEdgeSet = new Set<string>()
  for (const edge of edges) {
    if (edge.linkType === 'folder') continue
    if (!visibleNoteIds.has(edge.source) || !visibleNoteIds.has(edge.target)) continue
    addGraphEdge(relationEdges, relationEdgeSet, edge)
  }

  fileNodes.sort((a, b) => a.title.localeCompare(b.title))

  return { nodes: [...folderNodes, ...fileNodes], edges: [...ownershipEdges, ...relationEdges] }
}

export function getGraphData(vaultPath: string, mode: GraphMode = 'folder', rootPath = ''): GraphData {
  const db = getDatabase(vaultPath)
  const notes = db.prepare('SELECT id, title, file_path FROM notes').all() as GraphNoteRow[]
  const aliases = db.prepare('SELECT note_id, alias FROM note_aliases').all() as { note_id: string; alias: string }[]

  const noteIds = new Set(notes.map((n) => n.id))

  const titleToId = new Map<string, string>()
  const ambiguousTitles = new Set<string>()
  for (const n of notes) {
    if (titleToId.has(n.title) && titleToId.get(n.title) !== n.id) {
      ambiguousTitles.add(n.title)
    } else {
      titleToId.set(n.title, n.id)
    }
    const fileName = n.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '')
    const pathTitle = normalizeNotePathTarget(n.file_path)
    if (titleToId.has(fileName) && titleToId.get(fileName) !== n.id) {
      ambiguousTitles.add(fileName)
    } else if (!titleToId.has(fileName)) {
      titleToId.set(fileName, n.id)
    }
    if (titleToId.has(pathTitle) && titleToId.get(pathTitle) !== n.id) {
      ambiguousTitles.add(pathTitle)
    } else if (!titleToId.has(pathTitle)) {
      titleToId.set(pathTitle, n.id)
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

  // Folder and semantic views consume memory-backed inferred links; connection drops inferred.
  const includeInferred = mode !== 'connection'
  const linkRows = (includeInferred
    ? db.prepare('SELECT source_note_id, target_note_id, target_title, link_type FROM links')
    : db.prepare("SELECT source_note_id, target_note_id, target_title, link_type FROM links WHERE link_type = 'explicit'")
  ).all() as { source_note_id: string; target_note_id: string | null; target_title: string; link_type: string }[]

  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  const noteEdgeNodeIds = new Set<string>()
  for (const l of linkRows) {
    const targetId = (l.target_note_id && noteIds.has(l.target_note_id)) ? l.target_note_id : titleToId.get(l.target_title)
    if (!targetId || targetId === l.source_note_id) continue
    const key = `${l.source_note_id}->${targetId}->${l.link_type}`
    if (edgeSet.has(key)) continue
    edgeSet.add(key)
    const linkType: GraphEdgeLinkType = l.link_type === 'inferred' ? 'inferred' : 'explicit'
    edges.push({ source: l.source_note_id, target: targetId, linkType })
    noteEdgeNodeIds.add(l.source_note_id)
    noteEdgeNodeIds.add(targetId)
  }

  if (mode === 'group') {
    return buildGroupGraphData(notes, edges)
  }

  if (mode === 'folder-scope') {
    return buildFlatFolderGraphData(notes, edges, rootPath)
  }

  if (mode === 'connection') {
    const connectedNotes = notes.filter((n) => noteEdgeNodeIds.has(n.id))
    const fileNodes: GraphNode[] = connectedNotes.map((n) => ({ id: n.id, title: n.title, filePath: n.file_path, type: 'file' }))
    return { nodes: fileNodes, edges }
  }

  if (mode === 'semantic') {
    const fileNodes: GraphNode[] = notes.map((n) => ({ id: n.id, title: n.title, filePath: n.file_path, type: 'file' }))
    return { nodes: fileNodes, edges }
  }

  return buildOverviewGraphData(notes, edges)
}

function buildIndexedProperties(params: {
  title: string
  aliases: string[]
  tags: string[]
  frontmatter: Record<string, unknown>
  inlineProperties: Record<string, PropertyValue>
}): Record<string, PropertyValue> {
  const properties = { ...params.inlineProperties, ...normalizeProperties(params.frontmatter) }
  properties.title = normalizePropertyValue(params.frontmatter.title) ?? params.inlineProperties.title ?? params.title
  properties.aliases = params.aliases
  properties.tags = params.tags
  properties.cssclasses = normalizeCssClasses(
    params.frontmatter.cssclasses ??
    params.frontmatter.cssclass ??
    params.inlineProperties.cssclasses ??
    params.inlineProperties.cssclass
  )
  return properties
}

function parseStoredProperties(value: unknown): Record<string, PropertyValue> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const properties: Record<string, PropertyValue> = {}
    for (const [key, raw] of Object.entries(parsed)) {
      const normalized = normalizePropertyValue(raw)
      if (normalized !== undefined) properties[key] = normalized
    }
    return properties
  } catch {
    return {}
  }
}

function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return basename(filePath, '.md')
}

function extractLinks(content: string): { targetTitle: string; context: string; line: number }[] {
  const links: { targetTitle: string; context: string; line: number }[] = []
  const lines = content.split('\n')
  let inFence = false

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (isMarkdownFenceLine(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    let match: RegExpExecArray | null
    WIKILINK_REGEX.lastIndex = 0
    while ((match = WIKILINK_REGEX.exec(stripMarkdownImageAltText(stripInlineCode(line)))) !== null) {
      const targetTitle = normalizeWikiLinkTarget(match[1])
      if (!targetTitle) continue
      links.push({
        targetTitle,
        context: line.trim().slice(0, 200),
        line: index + 1
      })
    }
  }

  return links
}

function normalizeWikiLinkTarget(target: string): string {
  return normalizeNotePathTarget(stripObsidianLinkFragment(target).replace(/\\/g, '/'))
}

function normalizeNotePathTarget(target: string): string {
  return target.replace(/\.md$/i, '')
}

function stripObsidianLinkFragment(target: string): string {
  return target
    .split('#')[0]
    .replace(/\^[A-Za-z0-9_-]+$/, '')
    .trim()
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

function extractInlineAliases(properties: Record<string, PropertyValue>): string[] {
  return normalizeListProperty(properties.aliases ?? properties.alias)
}

function extractDataviewInlineFields(content: string): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {}
  let inFence = false

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(DATAVIEW_FIELD_REGEX)
    if (!match) continue

    const key = match[1].trim()
    if (!key || key.includes('[') || key.includes(']')) continue

    const value = normalizeInlineFieldValue(match[2])
    if (value === undefined) continue
    mergeInlineProperty(result, key, value)
  }

  return result
}

function normalizeInlineFieldValue(raw: string): PropertyValue | undefined {
  const value = raw.trim()
  if (!value) return undefined

  const arrayMatch = value.match(/^\[(.*)\]$/)
  const listSource = arrayMatch ? arrayMatch[1] : value
  if (listSource.includes(',')) {
    const items = listSource
      .split(',')
      .map((item) => normalizeInlineScalar(item))
      .filter((item): item is string | number | boolean => item !== undefined)
    return items.length > 0 ? items : undefined
  }

  return normalizeInlineScalar(value)
}

function normalizeInlineScalar(raw: string): string | number | boolean | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'

  const numeric = Number(value)
  if (Number.isFinite(numeric) && /^[-+]?\d+(?:\.\d+)?$/.test(value)) return numeric

  return value
}

function mergeInlineProperty(target: Record<string, PropertyValue>, key: string, value: PropertyValue): void {
  if (!(key in target)) {
    target[key] = value
    return
  }

  const existing = target[key]
  const existingValues = Array.isArray(existing) ? existing : existing == null ? [] : [existing]
  const nextValues = Array.isArray(value) ? value : value == null ? [] : [value]
  target[key] = [...existingValues, ...nextValues]
}

function normalizeProperties(frontmatter: Record<string, unknown>): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    const normalized = normalizePropertyValue(value)
    if (normalized !== undefined) result[key] = normalized
  }
  return result
}

function normalizePropertyValue(value: unknown): PropertyValue | undefined {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizePropertyScalar(item))
      .filter((item): item is string | number | boolean => item !== undefined)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalizePropertyScalar(value: unknown): string | number | boolean | undefined {
  if (value == null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalizeListProperty(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeTagNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value.flatMap((item) => normalizeListProperty(item)) : normalizeListProperty(value)
  return values
    .flatMap((item) => item.split(/[\s,]+/))
    .map((item) => item.replace(/^#/, '').trim())
    .filter(Boolean)
}

function normalizeCssClasses(value: unknown): string[] {
  const values = Array.isArray(value) ? value.flatMap((item) => normalizeListProperty(item)) : normalizeListProperty(value)
  return values
    .flatMap((item) => item.split(/[\s,]+/))
    .map((item) => item.trim())
    .filter(Boolean)
}

function getNoteLookupAliases(db: Database.Database, noteId: string, title: string, filePath?: string): string[] {
  const notePath = filePath || (db.prepare('SELECT file_path FROM notes WHERE id = ?').get(noteId) as { file_path: string } | undefined)?.file_path || ''
  const fileTitle = notePath ? basename(notePath, '.md') : ''
  const pathTitle = notePath ? normalizeNotePathTarget(notePath) : ''
  const rows = db.prepare('SELECT alias FROM note_aliases WHERE note_id = ?').all(noteId) as { alias: string }[]
  return Array.from(new Set([title, fileTitle, pathTitle, ...rows.map((row) => row.alias)].map((value) => value.trim()).filter((value) => value.length >= 2)))
}

function findPlainMention(content: string, aliases: string[]): { alias: string; index: number } | null {
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length)
  for (const alias of sortedAliases) {
    const lowerAlias = alias.toLowerCase()
    const parts = content.split(/(\r\n|\n|\r)/)
    let offset = 0
    let inFence = false

    for (let partIndex = 0; partIndex < parts.length; partIndex += 2) {
      const line = parts[partIndex] || ''
      const ending = parts[partIndex + 1] || ''
      const trimmed = line.trim()
      if (isMarkdownFenceLine(trimmed)) {
        inFence = !inFence
        offset += line.length + ending.length
        continue
      }
      if (inFence) {
        offset += line.length + ending.length
        continue
      }

      const searchableLine = stripMarkdownImageAltText(stripInlineCode(line))
      const lowerLine = searchableLine.toLowerCase()
      let index = lowerLine.indexOf(lowerAlias)
      while (index >= 0) {
        const before = searchableLine.slice(Math.max(0, index - 2), index)
        const after = searchableLine.slice(index + alias.length, index + alias.length + 2)
        const insideWikiLink = before === '[[' && (after.startsWith(']') || after.startsWith('|'))
        const absoluteIndex = offset + index
        if (!insideWikiLink && hasPlainMentionBoundary(searchableLine, alias, index)) return { alias, index: absoluteIndex }
        index = lowerLine.indexOf(lowerAlias, index + alias.length)
      }

      offset += line.length + ending.length
    }
  }
  return null
}

function hasPlainMentionBoundary(content: string, alias: string, index: number): boolean {
  const isWordChar = (value: string) => /^[A-Za-z0-9_]$/.test(value)
  const before = index > 0 ? content[index - 1] : ''
  const after = index + alias.length < content.length ? content[index + alias.length] : ''
  if (isWordChar(alias[0]) && isWordChar(before)) return false
  if (isWordChar(alias[alias.length - 1]) && isWordChar(after)) return false
  return true
}

function getLineNumberAtIndex(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split('\n').length
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
      SELECT id FROM notes WHERE ${NOTE_FILE_TITLE_SQL} = links.target_title
      UNION
      SELECT id FROM notes WHERE ${NOTE_PATH_TARGET_SQL} = links.target_title
      UNION
      SELECT note_id FROM note_aliases WHERE alias = links.target_title
      LIMIT 1
    )
    WHERE target_note_id IS NULL
  `).run()
  db.prepare(`
    UPDATE links SET target_note_id = (${CASE_INSENSITIVE_LINK_TARGET_SQL})
    WHERE NOT EXISTS (${EXACT_LINK_TARGET_EXISTS_SQL})
  `).run()
}

function resolveLinks(db: Database.Database, noteId: string, noteTitle: string, noteAliases: string[] = []): void {
  const note = db.prepare('SELECT file_path FROM notes WHERE id = ?').get(noteId) as { file_path: string } | undefined
  const fileName = note ? note.file_path.replace(/^.*[\\/]/, '').replace(/\.md$/, '') : ''
  const pathTitle = note ? normalizeNotePathTarget(note.file_path) : ''
  const aliases = Array.from(new Set([noteTitle, fileName, pathTitle, ...noteAliases].filter(Boolean)))

  for (const alias of aliases) {
    db.prepare(`
      UPDATE links SET target_note_id = ?
      WHERE target_title = ?
        AND (
          target_note_id IS NULL OR target_note_id NOT IN (
            SELECT id FROM notes WHERE title = ?
            UNION
            SELECT id FROM notes WHERE ${NOTE_FILE_TITLE_SQL} = ?
            UNION
            SELECT id FROM notes WHERE ${NOTE_PATH_TARGET_SQL} = ?
            UNION
            SELECT note_id FROM note_aliases WHERE alias = ?
          )
        )
    `).run(noteId, alias, alias, alias, alias, alias)
  }

  db.prepare(`
    UPDATE links SET target_note_id = (${CASE_INSENSITIVE_LINK_TARGET_SQL})
    WHERE NOT EXISTS (${EXACT_LINK_TARGET_EXISTS_SQL})
  `).run()

  db.prepare(`
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE ${NOTE_FILE_TITLE_SQL} = links.target_title
      UNION
      SELECT id FROM notes WHERE ${NOTE_PATH_TARGET_SQL} = links.target_title
      UNION
      SELECT note_id FROM note_aliases WHERE alias = links.target_title
      LIMIT 1
    )
    WHERE source_note_id = ? AND target_note_id IS NULL
  `).run(noteId)
  db.prepare(`
    UPDATE links SET target_note_id = (${CASE_INSENSITIVE_LINK_TARGET_SQL})
    WHERE source_note_id = ? AND NOT EXISTS (${EXACT_LINK_TARGET_EXISTS_SQL})
  `).run(noteId)
}

const TAG_REGEX = /(?:^|[^&\w一-鿿])#([a-zA-Z一-鿿][\w一-鿿/-]*)/g

function extractTags(content: string): string[] {
  const tags = new Set<string>()
  let inFence = false
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (isMarkdownFenceLine(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    let match: RegExpExecArray | null
    TAG_REGEX.lastIndex = 0
    const searchableLine = stripBareUrls(stripMarkdownLinkDestinations(stripInlineCode(line)))
    while ((match = TAG_REGEX.exec(searchableLine)) !== null) {
      tags.add(match[1])
    }
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
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (isMarkdownFenceLine(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const taskMatch = line.match(/^\s*[-*+]\s+\[([^\]\r\n]?)\]\s+(.+)/)
    if (taskMatch) {
      tasks.push({ text: taskMatch[2].trim(), done: taskMatch[1].toLowerCase() === 'x' })
    }
  }
  return tasks
}

function isMarkdownFenceLine(trimmedLine: string): boolean {
  return trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')
}

function stripInlineCode(line: string): string {
  return line.replace(/`+[^`]*`+/g, (match) => ' '.repeat(match.length))
}

function stripMarkdownImageAltText(line: string): string {
  return line.replace(/!\[[\s\S]*?\]\([^)]+\)/g, (match) => ' '.repeat(match.length))
}

function stripMarkdownLinkDestinations(line: string): string {
  return line.replace(/(!?\[[^\]]*\])\([^)]+\)/g, (_match, label: string) => label)
}

function stripBareUrls(line: string): string {
  return line.replace(/https?:\/\/\S+/gi, (match) => ' '.repeat(match.length))
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
