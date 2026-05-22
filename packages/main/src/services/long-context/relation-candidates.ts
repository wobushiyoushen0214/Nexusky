import { dirname } from 'path'
import type Database from 'better-sqlite3'
import { getDatabase } from '../database'
import { getPropertyRows } from '../indexer'
import type { PropertyValue } from '@shared/types/ipc'

export type EntityType = 'note' | 'task' | 'chat'

export interface RelationCandidate {
  sourceType: EntityType
  sourceId: string
  sourceTitle?: string
  sourcePath?: string
  targetType: EntityType
  targetId: string
  targetTitle?: string
  targetPath?: string
  localScore: number
  signals: string[]
  snippets: string[]
}

export interface FindRelationCandidatesParams {
  vaultPath: string
  entityType: EntityType
  entityId: string
  content?: string
  limit?: number
}

interface SourceContext {
  entityType: EntityType
  id: string
  title: string
  filePath?: string
  content: string
}

interface CandidateAccumulator {
  sourceType: EntityType
  sourceId: string
  sourceTitle?: string
  sourcePath?: string
  targetType: EntityType
  targetId: string
  targetTitle?: string
  targetPath?: string
  localScore: number
  signals: Set<string>
  snippets: string[]
  targetUpdatedAt?: number
}

const DEFAULT_LIMIT = 20
const MAX_SNIPPETS = 4
const MAX_KEYWORDS = 10
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'note', 'notes',
  'current', 'history', 'project', 'task', 'todo', 'done', 'true', 'false',
  '一个', '这个', '那个', '以及', '因为', '所以', '已经', '当前', '历史', '任务', '笔记'
])
const PROPERTY_EXCLUSIONS = new Set(['title', 'alias', 'aliases', 'tags', 'cssclass', 'cssclasses'])

export function findRelationCandidates(params: FindRelationCandidatesParams): RelationCandidate[] {
  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, 100))
  const db = getDatabase(params.vaultPath)
  const source = getSourceContext(db, params)
  if (!source) return []

  const candidates = new Map<string, CandidateAccumulator>()
  const addCandidate = createCandidateAdder(candidates, source)

  collectExplicitLinkCandidates(db, source, addCandidate)
  collectTagCandidates(db, source, addCandidate, limit)
  collectPropertyCandidates(params.vaultPath, source, addCandidate, limit)
  collectKeywordCandidates(db, source, addCandidate, limit)
  collectChunkSimilarityCandidates(db, source, addCandidate, limit)
  collectTaskCandidates(db, source, addCandidate, limit)
  collectFolderCandidates(db, source, addCandidate, limit)
  applyFreshnessBoost(candidates)

  return Array.from(candidates.values())
    .map(toRelationCandidate)
    .sort(compareCandidates)
    .slice(0, limit)
}

function getSourceContext(db: Database.Database, params: FindRelationCandidatesParams): SourceContext | null {
  if (params.entityType === 'note') {
    const row = db.prepare(`
      SELECT n.id, n.title, n.file_path as filePath, COALESCE(f.content, '') as content
      FROM notes n
      LEFT JOIN notes_fts_map m ON m.note_id = n.id
      LEFT JOIN notes_fts f ON f.rowid = m.rowid
      WHERE n.id = ?
    `).get(params.entityId) as { id: string; title: string; filePath: string; content: string } | undefined
    if (!row) return null
    return {
      entityType: 'note',
      id: row.id,
      title: row.title,
      filePath: row.filePath,
      content: params.content?.trim() || row.content || ''
    }
  }

  if (params.entityType === 'task') {
    const kanbanTask = db.prepare(`
      SELECT id, title, description, source_file_path as filePath
      FROM kanban_tasks
      WHERE id = ?
    `).get(params.entityId) as { id: string; title: string; description: string | null; filePath: string | null } | undefined
    if (kanbanTask) {
      return {
        entityType: 'task',
        id: kanbanTask.id,
        title: kanbanTask.title,
        filePath: kanbanTask.filePath || undefined,
        content: params.content?.trim() || kanbanTask.description || kanbanTask.title
      }
    }

    const inlineTask = db.prepare(`
      SELECT CAST(t.id AS TEXT) as id, t.text, n.title as noteTitle, n.file_path as filePath
      FROM tasks t
      JOIN notes n ON n.id = t.note_id
      WHERE CAST(t.id AS TEXT) = ?
    `).get(params.entityId) as { id: string; text: string; noteTitle: string; filePath: string } | undefined
    if (inlineTask) {
      return {
        entityType: 'task',
        id: inlineTask.id,
        title: inlineTask.text,
        filePath: inlineTask.filePath,
        content: params.content?.trim() || `${inlineTask.noteTitle}\n${inlineTask.text}`
      }
    }
  }

  if (params.entityType === 'chat') {
    return {
      entityType: 'chat',
      id: params.entityId,
      title: 'Chat context',
      content: params.content?.trim() || ''
    }
  }

  return null
}

function createCandidateAdder(candidates: Map<string, CandidateAccumulator>, source: SourceContext) {
  return (input: {
    targetType: EntityType
    targetId: string
    targetTitle?: string
    targetPath?: string
    score: number
    signal: string
    snippet?: string
    updatedAt?: number
  }): void => {
    if (input.targetType === source.entityType && input.targetId === source.id) return
    if (!input.targetId || input.score <= 0) return

    const key = `${input.targetType}:${input.targetId}`
    let candidate = candidates.get(key)
    if (!candidate) {
      candidate = {
        sourceType: source.entityType,
        sourceId: source.id,
        sourceTitle: source.title,
        sourcePath: source.filePath,
        targetType: input.targetType,
        targetId: input.targetId,
        targetTitle: input.targetTitle,
        targetPath: input.targetPath,
        localScore: 0,
        signals: new Set(),
        snippets: [],
        targetUpdatedAt: input.updatedAt
      }
      candidates.set(key, candidate)
    }

    candidate.localScore = clamp01(candidate.localScore + input.score)
    candidate.signals.add(input.signal)
    if (input.updatedAt && (!candidate.targetUpdatedAt || input.updatedAt > candidate.targetUpdatedAt)) {
      candidate.targetUpdatedAt = input.updatedAt
    }
    if (input.snippet) addSnippet(candidate, input.snippet)
  }
}

function collectExplicitLinkCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>
): void {
  if (source.entityType !== 'note') return

  const outgoing = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, n.updated_at as updatedAt, l.context
    FROM links l
    JOIN notes n ON n.id = l.target_note_id
    WHERE l.source_note_id = ? AND n.id != ?
    ORDER BY l.line ASC, n.title ASC
  `).all(source.id, source.id) as NoteCandidateRow[]
  for (const row of outgoing) {
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score: 1,
      signal: 'explicit_link',
      snippet: row.context || `Explicit link to ${row.title}`,
      updatedAt: row.updatedAt
    })
  }

  const backlinks = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, n.updated_at as updatedAt, l.context
    FROM links l
    JOIN notes n ON n.id = l.source_note_id
    WHERE l.target_note_id = ? AND n.id != ?
    ORDER BY l.line ASC, n.title ASC
  `).all(source.id, source.id) as NoteCandidateRow[]
  for (const row of backlinks) {
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score: 1,
      signal: 'backlink',
      snippet: row.context || `${row.title} links here`,
      updatedAt: row.updatedAt
    })
  }
}

function collectTagCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  if (source.entityType !== 'note') return
  const sourceTags = db.prepare(`
    SELECT t.id, t.name
    FROM note_tags nt
    JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = ?
  `).all(source.id) as { id: number; name: string }[]
  if (sourceTags.length === 0) return

  const rows = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, n.updated_at as updatedAt,
           COUNT(*) as sharedCount, GROUP_CONCAT(t.name, '|') as sharedTags
    FROM note_tags nt
    JOIN tags t ON t.id = nt.tag_id
    JOIN notes n ON n.id = nt.note_id
    WHERE nt.note_id != ? AND nt.tag_id IN (${sourceTags.map(() => '?').join(',')})
    GROUP BY n.id
    ORDER BY sharedCount DESC, n.updated_at DESC, n.title ASC
    LIMIT ?
  `).all(source.id, ...sourceTags.map((tag) => tag.id), Math.max(limit * 3, 30)) as (NoteCandidateRow & { sharedCount: number; sharedTags: string })[]

  for (const row of rows) {
    const tags = splitGroupConcat(row.sharedTags)
    const score = 0.75 * Math.min(1, row.sharedCount / Math.min(3, sourceTags.length))
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score,
      signal: `tag:${tags[0] || 'shared'}`,
      snippet: `Shared tag${tags.length > 1 ? 's' : ''}: ${tags.map((tag) => `#${tag}`).join(', ')}`,
      updatedAt: row.updatedAt
    })
  }
}

function collectPropertyCandidates(
  vaultPath: string,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  if (source.entityType !== 'note') return

  const rows = getPropertyRows(vaultPath)
  const sourceRow = rows.find((row) => row.id === source.id)
  if (!sourceRow) return

  let matched = 0
  for (const row of rows) {
    if (row.id === source.id) continue
    const matches = getPropertyMatches(sourceRow.properties, row.properties)
    if (matches.length === 0) continue
    matched += 1
    const score = 0.65 * Math.min(1, matches.length / 2)
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score,
      signal: `property:${matches[0].key}`,
      snippet: `Shared property ${matches[0].key}: ${matches[0].value}`,
      updatedAt: row.updatedAt
    })
    if (matched >= Math.max(limit * 3, 30)) return
  }
}

function collectKeywordCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  const terms = extractKeywords(`${source.title}\n${source.content}`, MAX_KEYWORDS)
  if (terms.length === 0) return

  const where = terms.map(() => '(lower(n.title) LIKE ? OR lower(COALESCE(f.content, \'\')) LIKE ?)').join(' OR ')
  const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`])
  const rows = db.prepare(`
    SELECT n.id, n.title, n.file_path as filePath, n.updated_at as updatedAt, COALESCE(f.content, '') as content
    FROM notes n
    LEFT JOIN notes_fts_map m ON m.note_id = n.id
    LEFT JOIN notes_fts f ON f.rowid = m.rowid
    WHERE n.id != ? AND (${where})
    ORDER BY n.updated_at DESC, n.title ASC
    LIMIT ?
  `).all(source.entityType === 'note' ? source.id : '', ...params, Math.max(limit * 5, 50)) as (NoteCandidateRow & { content: string })[]

  for (const row of rows) {
    const titleLower = row.title.toLowerCase()
    const contentLower = row.content.toLowerCase()
    const matchedTerms = terms.filter((term) => titleLower.includes(term) || contentLower.includes(term))
    if (matchedTerms.length === 0) continue

    const titleMatches = matchedTerms.filter((term) => titleLower.includes(term))
    const score = Math.min(0.55, 0.3 + matchedTerms.length * 0.06 + titleMatches.length * 0.06)
    const signal = titleMatches.length > 0 ? `title_keyword:${titleMatches[0]}` : `fts_keyword:${matchedTerms[0]}`
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score,
      signal,
      snippet: findBestSnippet(row.content, matchedTerms) || `Keyword match: ${matchedTerms.join(', ')}`,
      updatedAt: row.updatedAt
    })
  }
}

function collectChunkSimilarityCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  const queryTokens = new Set(extractKeywords(`${source.title}\n${source.content}`, 32))
  if (queryTokens.size === 0) return

  const rows = db.prepare(`
    SELECT c.note_id as id, n.title, n.file_path as filePath, n.updated_at as updatedAt,
           c.content, COALESCE(c.heading_context, '') as headingContext
    FROM chunks c
    JOIN notes n ON n.id = c.note_id
    WHERE c.note_id != ?
    ORDER BY n.updated_at DESC, c.chunk_index ASC
    LIMIT 2000
  `).all(source.entityType === 'note' ? source.id : '') as (NoteCandidateRow & { content: string; headingContext: string })[]

  const bestByNote = new Map<string, NoteCandidateRow & { content: string; headingContext: string; similarity: number }>()
  for (const row of rows) {
    const rowTokens = new Set(extractKeywords(`${row.title}\n${row.headingContext}\n${row.content}`, 48))
    const similarity = tokenSetSimilarity(queryTokens, rowTokens)
    if (similarity < 0.12) continue
    const existing = bestByNote.get(row.id)
    if (!existing || similarity > existing.similarity) {
      bestByNote.set(row.id, { ...row, similarity })
    }
  }

  const bestRows = Array.from(bestByNote.values())
    .sort((a, b) => b.similarity - a.similarity || a.title.localeCompare(b.title))
    .slice(0, Math.max(limit * 2, 20))

  for (const row of bestRows) {
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score: 0.8 * Math.min(1, row.similarity * 2),
      signal: 'semantic_chunk',
      snippet: truncate(row.headingContext ? `${row.headingContext}: ${row.content}` : row.content, 220),
      updatedAt: row.updatedAt
    })
  }
}

function collectTaskCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  const sourceTokens = new Set(extractKeywords(`${source.title}\n${source.content}`, 24))
  if (sourceTokens.size === 0) return

  const noteTasks = db.prepare(`
    SELECT CAST(t.id AS TEXT) as taskId, t.text, n.id as noteId, n.title, n.file_path as filePath, n.updated_at as updatedAt
    FROM tasks t
    JOIN notes n ON n.id = t.note_id
    WHERE n.id != ?
    ORDER BY n.updated_at DESC
    LIMIT ?
  `).all(source.entityType === 'note' ? source.id : '', Math.max(limit * 8, 80)) as { taskId: string; text: string; noteId: string; title: string; filePath: string; updatedAt: number }[]

  for (const row of noteTasks) {
    const similarity = tokenSetSimilarity(sourceTokens, new Set(extractKeywords(row.text, 24)))
    if (similarity < 0.16) continue
    addCandidate({
      targetType: 'note',
      targetId: row.noteId,
      targetTitle: row.title,
      targetPath: row.filePath,
      score: 0.6 * Math.min(1, similarity * 2),
      signal: 'task_text',
      snippet: `Task: ${truncate(row.text, 180)}`,
      updatedAt: row.updatedAt
    })
  }

  const kanbanTasks = db.prepare(`
    SELECT id, title, description, source_file_path as filePath, updated_at as updatedAt
    FROM kanban_tasks
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.max(limit * 4, 40)) as { id: string; title: string; description: string | null; filePath: string | null; updatedAt: number }[]

  for (const row of kanbanTasks) {
    if (source.entityType === 'task' && row.id === source.id) continue
    const text = `${row.title}\n${row.description || ''}`
    const similarity = tokenSetSimilarity(sourceTokens, new Set(extractKeywords(text, 24)))
    if (similarity < 0.16) continue
    addCandidate({
      targetType: 'task',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath || undefined,
      score: 0.6 * Math.min(1, similarity * 2),
      signal: 'task_text',
      snippet: `Task: ${truncate(text, 180)}`,
      updatedAt: row.updatedAt
    })
  }
}

function collectFolderCandidates(
  db: Database.Database,
  source: SourceContext,
  addCandidate: ReturnType<typeof createCandidateAdder>,
  limit: number
): void {
  if (!source.filePath) return
  const sourceFolder = normalizeFolder(source.filePath)
  const rows = db.prepare(`
    SELECT id, title, file_path as filePath, updated_at as updatedAt
    FROM notes
    WHERE id != ?
    ORDER BY updated_at DESC, title ASC
    LIMIT ?
  `).all(source.entityType === 'note' ? source.id : '', Math.max(limit * 8, 80)) as NoteCandidateRow[]

  let matched = 0
  for (const row of rows) {
    if (normalizeFolder(row.filePath) !== sourceFolder) continue
    addCandidate({
      targetType: 'note',
      targetId: row.id,
      targetTitle: row.title,
      targetPath: row.filePath,
      score: 0.35,
      signal: 'same_folder',
      snippet: `Same folder: ${sourceFolder || '_root'}`,
      updatedAt: row.updatedAt
    })
    matched += 1
    if (matched >= limit) return
  }
}

function applyFreshnessBoost(candidates: Map<string, CandidateAccumulator>): void {
  for (const candidate of candidates.values()) {
    if (!candidate.targetUpdatedAt) continue
    const ageDays = getAgeDays(candidate.targetUpdatedAt)
    if (ageDays > 30) continue
    candidate.localScore = clamp01(candidate.localScore + 0.25 * Math.exp(-ageDays / 30))
    candidate.signals.add('recent_edit')
  }
}

function toRelationCandidate(candidate: CandidateAccumulator): RelationCandidate {
  return {
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    sourceTitle: candidate.sourceTitle,
    sourcePath: candidate.sourcePath,
    targetType: candidate.targetType,
    targetId: candidate.targetId,
    targetTitle: candidate.targetTitle,
    targetPath: candidate.targetPath,
    localScore: Number(candidate.localScore.toFixed(4)),
    signals: Array.from(candidate.signals),
    snippets: candidate.snippets
  }
}

function compareCandidates(a: RelationCandidate, b: RelationCandidate): number {
  return b.localScore - a.localScore
    || b.signals.length - a.signals.length
    || (a.targetTitle || '').localeCompare(b.targetTitle || '')
    || (a.targetPath || '').localeCompare(b.targetPath || '')
    || a.targetId.localeCompare(b.targetId)
}

interface NoteCandidateRow {
  id: string
  title: string
  filePath: string
  updatedAt: number
  context?: string | null
}

function splitGroupConcat(value: string | null | undefined): string[] {
  return (value || '').split('|').map((item) => item.trim()).filter(Boolean)
}

function getPropertyMatches(
  sourceProperties: Record<string, PropertyValue>,
  targetProperties: Record<string, PropertyValue>
): { key: string; value: string }[] {
  const matches: { key: string; value: string }[] = []
  for (const [key, value] of Object.entries(sourceProperties)) {
    const normalizedKey = key.toLowerCase()
    if (PROPERTY_EXCLUSIONS.has(normalizedKey)) continue
    const sourceValues = propertyValueTokens(value)
    if (sourceValues.length === 0) continue

    const targetKey = Object.keys(targetProperties).find((item) => item.toLowerCase() === normalizedKey)
    if (!targetKey) continue
    const targetValues = new Set(propertyValueTokens(targetProperties[targetKey]))
    const sharedValue = sourceValues.find((item) => targetValues.has(item))
    if (!sharedValue) continue
    matches.push({ key, value: sharedValue })
  }
  return matches
}

function propertyValueTokens(value: PropertyValue | undefined): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return Array.from(new Set(values
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item.length > 0)))
}

function extractKeywords(text: string, max: number): string[] {
  const terms = new Map<string, { count: number; index: number }>()
  let index = 0
  const add = (term: string): void => {
    const normalized = term.toLowerCase().replace(/^[-_]+|[-_]+$/g, '')
    if (normalized.length < 2 || STOP_WORDS.has(normalized)) return
    const existing = terms.get(normalized)
    if (existing) {
      existing.count += 1
    } else {
      terms.set(normalized, { count: 1, index: index++ })
    }
  }

  for (const match of text.matchAll(/[a-z0-9][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2,}/gi)) {
    const token = match[0]
    if (/^[a-z0-9_-]+$/i.test(token)) {
      add(token)
      continue
    }
    if (token.length <= 6) add(token)
    for (let i = 0; i < token.length - 1; i++) {
      add(token.slice(i, i + 2))
    }
  }

  return Array.from(terms.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].index - b[1].index || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([term]) => term)
}

function tokenSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) {
    if (b.has(token)) shared += 1
  }
  if (shared === 0) return 0
  return shared / Math.sqrt(a.size * b.size)
}

function findBestSnippet(content: string, terms: string[]): string {
  const lowerTerms = terms.map((term) => term.toLowerCase())
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => {
      const lower = item.toLowerCase()
      return lowerTerms.some((term) => lower.includes(term))
    })
  return line ? truncate(line, 220) : ''
}

function addSnippet(candidate: CandidateAccumulator, snippet: string): void {
  const normalized = truncate(snippet.replace(/\s+/g, ' ').trim(), 240)
  if (!normalized || candidate.snippets.includes(normalized)) return
  if (candidate.snippets.length >= MAX_SNIPPETS) return
  candidate.snippets.push(normalized)
}

function truncate(value: string, max: number): string {
  const normalized = value.trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
}

function normalizeFolder(filePath: string): string {
  const folder = dirname(filePath.replace(/\\/g, '/'))
  return folder === '.' ? '' : folder
}

function getAgeDays(updatedAt: number): number {
  const timestampMs = updatedAt < 10_000_000_000 ? updatedAt * 1000 : updatedAt
  return Math.max(0, (Date.now() - timestampMs) / 86_400_000)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
