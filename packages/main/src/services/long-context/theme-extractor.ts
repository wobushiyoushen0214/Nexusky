import { createHash } from 'crypto'
import type Database from 'better-sqlite3'
import type { AppLanguage, LongTermTheme, LongTermThemeMembership } from '@shared/types/ipc'
import { getDatabase, isCurrentDatabaseConnection } from '../database'
import { aiManager } from '../ai'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../ai'
import { extractJsonFromText } from '../ai/json'
import { recordContextEvent } from './context-events'
import type { EntityType } from './relation-candidates'
import { runProactiveCycle } from '../proactive/proactive-orchestrator'

export interface ThemeExtractionResult {
  created: number
  updated: number
}

export interface ThemeExtractorProvider {
  chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent>
}

export interface ExtractLongTermThemesParams {
  vaultPath: string
  changedEntityIds?: string[]
  limit?: number
  provider?: ThemeExtractorProvider
  language?: AppLanguage
  signal?: AbortSignal
}

interface RelationThemeRow {
  id: string
  sourceType: EntityType
  sourceId: string
  sourceTitle: string
  sourcePath: string | null
  targetType: EntityType
  targetId: string
  targetTitle: string
  targetPath: string | null
  relationType: string
  score: number
  evidenceJson: string
  reason: string
  firstSeenAt: number
  lastSeenAt: number
}

interface ThemeCandidate {
  keyword: string
  relations: RelationThemeRow[]
  entityMap: Map<string, { entityType: EntityType; entityId: string; title: string; path?: string; evidence: string[] }>
  firstSeenAt: number
  lastSeenAt: number
  averageScore: number
}

interface ThemeDraft {
  title: string
  summary: string
  keywords: string[]
  confidence: number
}

interface ThemeUpsertResult {
  id: string
  title: string
  status: 'created' | 'updated'
}

const MIN_THEME_ENTITIES = 3
const MIN_THEME_SPAN_DAYS = 7
const MIN_AVERAGE_SCORE = 0.65
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'notes', 'current',
  'candidate', 'relation', 'context', 'project', 'because', 'mentions', 'discuss',
  '一个', '这个', '那个', '以及', '因为', '所以', '当前', '历史', '关系', '上下文', '笔记'
])

export async function extractLongTermThemes(params: ExtractLongTermThemesParams): Promise<ThemeExtractionResult> {
  let db = getDatabase(params.vaultPath)
  const candidates = buildThemeCandidates(db, params.changedEntityIds)
    .slice(0, Math.max(1, Math.min(params.limit || 10, 20)))
  let created = 0
  let updated = 0

  for (const candidate of candidates) {
    if (params.signal?.aborted) break
    const draft = await generateThemeDraft(candidate, params.provider, params.language, params.signal)
    if (params.signal?.aborted) break
    db = isCurrentDatabaseConnection(params.vaultPath, db) ? db : getDatabase(params.vaultPath)
    const result = upsertTheme(db, candidate, draft)
    if (result.status === 'created') {
      created += 1
      recordContextEvent({
        vaultPath: params.vaultPath,
        eventType: 'theme_created',
        entityType: 'theme',
        entityId: result.id,
        entityTitle: result.title,
        metadata: {
          keyword: candidate.keyword,
          entityCount: candidate.entityMap.size,
          relationCount: candidate.relations.length,
          averageScore: candidate.averageScore
        }
      })
    } else {
      updated += 1
    }
  }

  if ((created > 0 || updated > 0) && !params.signal?.aborted) {
    db = isCurrentDatabaseConnection(params.vaultPath, db) ? db : getDatabase(params.vaultPath)
    runThemeProximityForRecentNotes(db, params.vaultPath)
  }

  return { created, updated }
}

const PROACTIVE_PROXIMITY_NOTE_LIMIT = 5

function runThemeProximityForRecentNotes(db: Database.Database, vaultPath: string): void {
  const rows = db.prepare(`
    SELECT n.id as id, n.title as title, COALESCE(f.content, '') as content
    FROM notes n
    LEFT JOIN notes_fts_map m ON m.note_id = n.id
    LEFT JOIN notes_fts f ON f.rowid = m.rowid
    ORDER BY n.updated_at DESC
    LIMIT ?
  `).all(PROACTIVE_PROXIMITY_NOTE_LIMIT) as { id: string; title: string; content: string }[]

  for (const row of rows) {
    try {
      runProactiveCycle({
        vaultPath,
        entityType: 'note',
        entityId: row.id,
        trigger: 'theme_proximity',
        context: { content: row.content }
      })
    } catch {
      // Proactive evaluation must never break theme extraction.
    }
  }
}

export function getLongTermThemes(vaultPath: string, limit = 20): LongTermTheme[] {
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT id, title, summary, keywords_json as keywordsJson, strength, evidence_count as evidenceCount,
           first_seen_at as firstSeenAt, last_seen_at as lastSeenAt
    FROM long_term_themes
    WHERE status = 'active'
    ORDER BY strength DESC, last_seen_at DESC, title ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 100))) as {
    id: string
    title: string
    summary: string
    keywordsJson: string
    strength: number
    evidenceCount: number
    firstSeenAt: number
    lastSeenAt: number
  }[]

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    keywords: parseStringArray(row.keywordsJson),
    strength: row.strength,
    evidenceCount: row.evidenceCount,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    memberships: getThemeMemberships(db, row.id)
  }))
}

function getThemeMemberships(db: Database.Database, themeId: string): LongTermThemeMembership[] {
  const rows = db.prepare(`
    SELECT entity_type as entityType,
           entity_id as entityId,
           COALESCE(entity_title, entity_id) as entityTitle,
           entity_path as entityPath,
           confidence,
           evidence_json as evidenceJson
    FROM theme_memberships
    WHERE theme_id = ?
    ORDER BY confidence DESC, updated_at DESC, entity_title ASC
    LIMIT 20
  `).all(themeId) as {
    entityType: LongTermThemeMembership['entityType']
    entityId: string
    entityTitle: string
    entityPath: string | null
    confidence: number
    evidenceJson: string
  }[]

  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    entityTitle: row.entityTitle,
    entityPath: row.entityPath || undefined,
    confidence: row.confidence,
    evidence: parseStringArray(row.evidenceJson)
  }))
}

function buildThemeExtractionPrompt(candidate: ThemeCandidate, language: AppLanguage = 'zh-CN'): ChatMessage[] {
  const relations = candidate.relations.slice(0, 8).map((relation) => ({
    sourceTitle: relation.sourceTitle,
    targetTitle: relation.targetTitle,
    relationType: relation.relationType,
    reason: relation.reason,
    evidence: parseStringArray(relation.evidenceJson).slice(0, 3)
  }))

  return [
    {
      role: 'system',
      content: [
        'You identify durable long-term themes from user knowledge relationships.',
        'Return strict JSON only.',
        'Do not output Markdown or extra explanation.',
        'Evidence must be grounded in the provided relations.',
        'Return one object: {"title":"...","summary":"...","keywords":["..."],"confidence":0.0}.',
        language === 'en'
          ? 'Write title, summary, and keywords in English.'
          : 'Write title, summary, and keywords in Simplified Chinese.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        seedKeyword: candidate.keyword,
        entityCount: candidate.entityMap.size,
        relationCount: candidate.relations.length,
        relations
      }, null, 2)
    }
  ]
}

function buildThemeCandidates(db: Database.Database, changedEntityIds?: string[]): ThemeCandidate[] {
  const changedFilter = changedEntityIds && changedEntityIds.length > 0
    ? `AND (source_id IN (${changedEntityIds.map(() => '?').join(',')}) OR target_id IN (${changedEntityIds.map(() => '?').join(',')}))`
    : ''
  const params = changedEntityIds && changedEntityIds.length > 0 ? [...changedEntityIds, ...changedEntityIds] : []
  const rows = db.prepare(`
    SELECT id,
           source_type as sourceType,
           source_id as sourceId,
           COALESCE(source_title, source_id) as sourceTitle,
           source_path as sourcePath,
           target_type as targetType,
           target_id as targetId,
           COALESCE(target_title, target_id) as targetTitle,
           target_path as targetPath,
           relation_type as relationType,
           score,
           evidence_json as evidenceJson,
           reason,
           first_seen_at as firstSeenAt,
           last_seen_at as lastSeenAt
    FROM ai_relations
    WHERE status = 'active'
      AND score >= ?
      ${changedFilter}
    ORDER BY score DESC, last_seen_at DESC
    LIMIT 500
  `).all(MIN_AVERAGE_SCORE, ...params) as RelationThemeRow[]

  const groups = new Map<string, RelationThemeRow[]>()
  for (const row of rows) {
    const keywords = extractThemeKeywords([
      row.sourceTitle,
      row.targetTitle,
      row.reason,
      ...parseStringArray(row.evidenceJson)
    ].join(' '))
    for (const keyword of keywords.slice(0, 4)) {
      const group = groups.get(keyword) || []
      group.push(row)
      groups.set(keyword, group)
    }
  }

  return Array.from(groups.entries())
    .map(([keyword, relations]) => createThemeCandidate(keyword, relations))
    .filter((candidate): candidate is ThemeCandidate => candidate !== null)
    .sort((a, b) => b.averageScore - a.averageScore || b.entityMap.size - a.entityMap.size || a.keyword.localeCompare(b.keyword))
}

function createThemeCandidate(keyword: string, relations: RelationThemeRow[]): ThemeCandidate | null {
  const uniqueRelations = Array.from(new Map(relations.map((relation) => [relation.id, relation])).values())
  const entityMap = new Map<string, { entityType: EntityType; entityId: string; title: string; path?: string; evidence: string[] }>()
  let firstSeenAt = Number.MAX_SAFE_INTEGER
  let lastSeenAt = 0
  let totalScore = 0

  for (const relation of uniqueRelations) {
    firstSeenAt = Math.min(firstSeenAt, relation.firstSeenAt)
    lastSeenAt = Math.max(lastSeenAt, relation.lastSeenAt)
    totalScore += relation.score
    addThemeEntity(entityMap, relation.sourceType, relation.sourceId, relation.sourceTitle, relation.sourcePath || undefined, relation.reason)
    addThemeEntity(entityMap, relation.targetType, relation.targetId, relation.targetTitle, relation.targetPath || undefined, relation.reason)
  }

  if (entityMap.size < MIN_THEME_ENTITIES) return null
  if ((lastSeenAt - firstSeenAt) / 86_400 < MIN_THEME_SPAN_DAYS) return null
  const averageScore = totalScore / uniqueRelations.length
  if (averageScore < MIN_AVERAGE_SCORE) return null

  return {
    keyword,
    relations: uniqueRelations,
    entityMap,
    firstSeenAt,
    lastSeenAt,
    averageScore
  }
}

function addThemeEntity(
  entityMap: ThemeCandidate['entityMap'],
  entityType: EntityType,
  entityId: string,
  title: string,
  path: string | undefined,
  evidence: string
): void {
  const key = `${entityType}:${entityId}`
  const existing = entityMap.get(key) || { entityType, entityId, title, path, evidence: [] }
  if (evidence && existing.evidence.length < 3) existing.evidence.push(evidence)
  entityMap.set(key, existing)
}

async function generateThemeDraft(
  candidate: ThemeCandidate,
  provider?: ThemeExtractorProvider,
  language: AppLanguage = 'zh-CN',
  signal?: AbortSignal
): Promise<ThemeDraft> {
  const activeProvider = provider || getActiveProvider()
  if (!activeProvider) return fallbackThemeDraft(candidate, language)

  let response = ''
  try {
    for await (const event of activeProvider.chatStream(buildThemeExtractionPrompt(candidate, language), signal, { temperature: 0 })) {
      if (signal?.aborted) return fallbackThemeDraft(candidate, language)
      if (event.type === 'text') response += event.content
      if (event.type === 'error') return fallbackThemeDraft(candidate, language)
    }
    const parsed = extractJsonFromText<Partial<ThemeDraft>>(response, 'object')
    return normalizeThemeDraft(parsed, candidate, language)
  } catch {
    return fallbackThemeDraft(candidate, language)
  }
}

function upsertTheme(db: Database.Database, candidate: ThemeCandidate, draft: ThemeDraft): ThemeUpsertResult {
  const title = draft.title || candidate.keyword
  const id = createThemeId(title)
  const existing = db.prepare('SELECT id FROM long_term_themes WHERE id = ?').get(id) as { id: string } | undefined
  const now = Date.now() // 使用毫秒时间戳
  const keywords = Array.from(new Set([candidate.keyword, ...draft.keywords])).slice(0, 10)
  db.prepare(`
    INSERT INTO long_term_themes (
      id, title, summary, keywords_json, strength, evidence_count, status,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      keywords_json = excluded.keywords_json,
      strength = excluded.strength,
      evidence_count = excluded.evidence_count,
      status = 'active',
      first_seen_at = MIN(long_term_themes.first_seen_at, excluded.first_seen_at),
      last_seen_at = MAX(long_term_themes.last_seen_at, excluded.last_seen_at),
      updated_at = excluded.updated_at
  `).run(
    id,
    title,
    draft.summary,
    JSON.stringify(keywords),
    Number(Math.min(1, candidate.averageScore * draft.confidence).toFixed(4)),
    candidate.entityMap.size,
    candidate.firstSeenAt,
    candidate.lastSeenAt,
    now,
    now
  )

  const upsertMembership = db.prepare(`
    INSERT INTO theme_memberships (
      id, theme_id, entity_type, entity_id, entity_title, entity_path, confidence, evidence_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(theme_id, entity_type, entity_id) DO UPDATE SET
      entity_title = excluded.entity_title,
      entity_path = excluded.entity_path,
      confidence = excluded.confidence,
      evidence_json = excluded.evidence_json,
      updated_at = excluded.updated_at
  `)

  for (const entity of candidate.entityMap.values()) {
    upsertMembership.run(
      createMembershipId(id, entity.entityType, entity.entityId),
      id,
      entity.entityType,
      entity.entityId,
      entity.title,
      entity.path || null,
      draft.confidence,
      JSON.stringify(entity.evidence),
      now,
      now
    )
  }

  return { id, title, status: existing ? 'updated' : 'created' }
}

function fallbackThemeDraft(candidate: ThemeCandidate, language: AppLanguage = 'zh-CN'): ThemeDraft {
  const keyword = candidate.keyword.replace(/[-_]/g, ' ')
  return {
    title: language === 'en' ? toTitleCase(keyword) : keyword,
    summary: language === 'en'
      ? `Recurring theme across ${candidate.entityMap.size} related knowledge items.`
      : `跨 ${candidate.entityMap.size} 个相关知识条目反复出现的主题。`,
    keywords: [candidate.keyword],
    confidence: 0.72
  }
}

function normalizeThemeDraft(parsed: Partial<ThemeDraft>, candidate: ThemeCandidate, language: AppLanguage): ThemeDraft {
  const fallback = fallbackThemeDraft(candidate, language)
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 120) : fallback.title
  const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 600) : fallback.summary
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : fallback.keywords
  const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : fallback.confidence
  return { title, summary, keywords, confidence }
}

function extractThemeKeywords(text: string): string[] {
  const counts = new Map<string, number>()
  for (const match of text.matchAll(/[a-z0-9][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/gi)) {
    const raw = match[0].toLowerCase()
    const tokens = /^[a-z0-9_-]+$/i.test(raw)
      ? [raw]
      : raw.length <= 6
        ? [raw, ...Array.from({ length: raw.length - 1 }, (_, i) => raw.slice(i, i + 2))]
        : Array.from({ length: raw.length - 1 }, (_, i) => raw.slice(i, i + 2))
    for (const token of tokens) {
      if (token.length < 2 || STOP_WORDS.has(token)) continue
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([keyword]) => keyword)
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function getActiveProvider(): ThemeExtractorProvider | null {
  const config = aiManager.getActiveConfig()
  if (!config) return null
  if (aiManager.validateConfig(config)) return null
  return aiManager.getProvider(config)
}

function createThemeId(title: string): string {
  return `theme-${createHash('sha1').update(title.trim().toLowerCase()).digest('hex').slice(0, 16)}`
}

function createMembershipId(themeId: string, entityType: EntityType, entityId: string): string {
  return createHash('sha1').update(`${themeId}:${entityType}:${entityId}`).digest('hex')
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}
