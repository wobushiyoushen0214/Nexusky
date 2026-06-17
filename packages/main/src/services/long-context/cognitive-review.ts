import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, relative, resolve } from 'path'
import type Database from 'better-sqlite3'
import { getDatabase } from '../database'

export interface CognitiveReviewStats {
  newRelations: number
  themeChanges: number
  repeatedQuestions: number
  blockers: number
  resurfacedContexts: number
}

export interface CognitiveReviewResult {
  title: string
  markdown: string
  filePath?: string
  generatedAt: number
  since: number
  until: number
  stats: CognitiveReviewStats
}

export interface GenerateCognitiveReviewParams {
  vaultPath: string
  since?: number
  until?: number
  write?: boolean
  outputPath?: string
}

interface RelationReviewRow {
  id: string
  sourceTitle: string | null
  sourcePath: string | null
  targetTitle: string | null
  targetPath: string | null
  relationType: string
  confidence: number
  score: number
  strength: number
  evidenceJson: string
  reason: string
  firstSeenAt: number
  lastSeenAt: number
  createdAt: number
}

interface ThemeReviewRow {
  title: string
  summary: string
  strength: number
  evidenceCount: number
  keywordsJson: string
  firstSeenAt: number
  lastSeenAt: number
  updatedAt: number
}

interface RepeatedQuestion {
  question: string
  count: number
  lastAskedAt: number
}

interface Blocker {
  title: string
  filePath?: string
  detail: string
  updatedAt: number
}

const WEEK_MILLISECONDS = 7 * 86_400 * 1000
const RESURFACED_AFTER_MILLISECONDS = 30 * 86_400 * 1000

export function generateCognitiveReview(params: GenerateCognitiveReviewParams): CognitiveReviewResult {
  const db = getDatabase(params.vaultPath)
  const until = params.until ?? Date.now() // 使用毫秒时间戳
  const since = params.since ?? until - WEEK_MILLISECONDS
  const generatedAt = Date.now() // 使用毫秒时间戳

  const newRelations = getNewRelations(db, since, until)
  const themeChanges = getThemeChanges(db, since, until)
  const repeatedQuestions = getRepeatedQuestions(db, since, until)
  const blockers = getBlockers(db, since, until)
  const resurfacedContexts = getResurfacedContexts(db, since, until)

  const title = `Cognitive Review - ${formatDate(until)}`
  const markdown = renderCognitiveReviewMarkdown({
    title,
    since,
    until,
    generatedAt,
    newRelations,
    themeChanges,
    repeatedQuestions,
    blockers,
    resurfacedContexts
  })
  const result: CognitiveReviewResult = {
    title,
    markdown,
    generatedAt,
    since,
    until,
    stats: {
      newRelations: newRelations.length,
      themeChanges: themeChanges.length,
      repeatedQuestions: repeatedQuestions.length,
      blockers: blockers.length,
      resurfacedContexts: resurfacedContexts.length
    }
  }

  if (params.write) {
    const outputPath = writeReviewMarkdown(params.vaultPath, markdown, params.outputPath, until)
    result.filePath = outputPath
  }

  return result
}

function getNewRelations(db: Database.Database, since: number, until: number): RelationReviewRow[] {
  return db.prepare(`
    SELECT id,
           source_title as sourceTitle,
           source_path as sourcePath,
           target_title as targetTitle,
           target_path as targetPath,
           relation_type as relationType,
           confidence,
           score,
           strength,
           evidence_json as evidenceJson,
           reason,
           first_seen_at as firstSeenAt,
           last_seen_at as lastSeenAt,
           created_at as createdAt
    FROM ai_relations
    WHERE status = 'active'
      AND created_at BETWEEN ? AND ?
    ORDER BY score DESC, created_at DESC
    LIMIT 8
  `).all(since, until) as RelationReviewRow[]
}

function getResurfacedContexts(db: Database.Database, since: number, until: number): RelationReviewRow[] {
  return db.prepare(`
    SELECT id,
           source_title as sourceTitle,
           source_path as sourcePath,
           target_title as targetTitle,
           target_path as targetPath,
           relation_type as relationType,
           confidence,
           score,
           strength,
           evidence_json as evidenceJson,
           reason,
           first_seen_at as firstSeenAt,
           last_seen_at as lastSeenAt,
           created_at as createdAt
    FROM ai_relations
    WHERE status = 'active'
      AND last_seen_at BETWEEN ? AND ?
      AND first_seen_at <= ?
    ORDER BY score DESC, last_seen_at DESC
    LIMIT 8
  `).all(since, until, since - RESURFACED_AFTER_MILLISECONDS) as RelationReviewRow[]
}

function getThemeChanges(db: Database.Database, since: number, until: number): ThemeReviewRow[] {
  return db.prepare(`
    SELECT title,
           summary,
           strength,
           evidence_count as evidenceCount,
           keywords_json as keywordsJson,
           first_seen_at as firstSeenAt,
           last_seen_at as lastSeenAt,
           updated_at as updatedAt
    FROM long_term_themes
    WHERE status = 'active'
      AND (updated_at BETWEEN ? AND ? OR last_seen_at BETWEEN ? AND ?)
    ORDER BY strength DESC, updated_at DESC
    LIMIT 8
  `).all(since, until, since, until) as ThemeReviewRow[]
}

function getRepeatedQuestions(db: Database.Database, since: number, until: number): RepeatedQuestion[] {
  const rows = [
    ...db.prepare(`
      SELECT COALESCE(content_snapshot, entity_title, '') as text, created_at as createdAt
      FROM context_events
      WHERE event_type = 'ai_question_asked'
        AND created_at BETWEEN ? AND ?
    `).all(since, until) as { text: string; createdAt: number }[],
    ...db.prepare(`
      SELECT content as text, created_at as createdAt
      FROM conversations
      WHERE role = 'user'
        AND created_at BETWEEN ? AND ?
    `).all(since, until) as { text: string; createdAt: number }[]
  ]
  const groups = new Map<string, RepeatedQuestion>()
  for (const row of rows) {
    const normalized = normalizeQuestion(row.text)
    if (!normalized) continue
    const existing = groups.get(normalized) || { question: row.text.trim().slice(0, 180), count: 0, lastAskedAt: 0 }
    existing.count += 1
    existing.lastAskedAt = Math.max(existing.lastAskedAt, row.createdAt)
    groups.set(normalized, existing)
  }
  return Array.from(groups.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastAskedAt - a.lastAskedAt)
    .slice(0, 6)
}

function getBlockers(db: Database.Database, since: number, until: number): Blocker[] {
  const blockerPattern = '%block%'
  const waitingPattern = '%waiting%'
  const stuckPattern = '%stuck%'
  const zhBlockedPattern = '%阻塞%'
  const zhWaitingPattern = '%等待%'
  const inlineTasks = db.prepare(`
    SELECT t.text as title, n.file_path as filePath, t.text as detail, n.updated_at as updatedAt
    FROM tasks t
    JOIN notes n ON n.id = t.note_id
    WHERE t.done = 0
      AND n.updated_at BETWEEN ? AND ?
      AND (
        lower(t.text) LIKE ?
        OR lower(t.text) LIKE ?
        OR lower(t.text) LIKE ?
        OR t.text LIKE ?
        OR t.text LIKE ?
      )
    ORDER BY n.updated_at DESC
    LIMIT 6
  `).all(since, until, blockerPattern, waitingPattern, stuckPattern, zhBlockedPattern, zhWaitingPattern) as Blocker[]

  const kanbanTasks = db.prepare(`
    SELECT title,
           source_file_path as filePath,
           COALESCE(description, title) as detail,
           updated_at as updatedAt
    FROM kanban_tasks
    WHERE updated_at BETWEEN ? AND ?
      AND (
        lower(title || ' ' || COALESCE(description, '')) LIKE ?
        OR lower(title || ' ' || COALESCE(description, '')) LIKE ?
        OR lower(title || ' ' || COALESCE(description, '')) LIKE ?
        OR (title || ' ' || COALESCE(description, '')) LIKE ?
        OR (title || ' ' || COALESCE(description, '')) LIKE ?
      )
    ORDER BY updated_at DESC
    LIMIT 6
  `).all(since, until, blockerPattern, waitingPattern, stuckPattern, zhBlockedPattern, zhWaitingPattern) as Blocker[]

  return dedupeBlockers([...inlineTasks, ...kanbanTasks]).slice(0, 8)
}

function renderCognitiveReviewMarkdown(params: {
  title: string
  since: number
  until: number
  generatedAt: number
  newRelations: RelationReviewRow[]
  themeChanges: ThemeReviewRow[]
  repeatedQuestions: RepeatedQuestion[]
  blockers: Blocker[]
  resurfacedContexts: RelationReviewRow[]
}): string {
  return [
    `# ${params.title}`,
    '',
    `period:: ${formatDate(params.since)} to ${formatDate(params.until)}`,
    `generated:: ${formatDateTime(params.generatedAt)}`,
    '',
    '> This is an evidence-backed cognitive review, not a short-term activity summary.',
    '',
    '## New Relationships',
    formatRelations(params.newRelations, 'No new long-term relationships were recorded in this period.'),
    '',
    '## Theme Changes',
    formatThemes(params.themeChanges),
    '',
    '## Repeated Questions and Blockers',
    formatRepeatedQuestionsAndBlockers(params.repeatedQuestions, params.blockers),
    '',
    '## Forgotten Context Resurfaced',
    formatRelations(params.resurfacedContexts, 'No older context resurfaced during this period.'),
    '',
    '## Observation Boundary',
    'These observations are grounded in stored relations, themes, questions, and task signals. They should guide review, not be treated as a complete summary of the week.'
  ].join('\n')
}

function formatRelations(rows: RelationReviewRow[], emptyText: string): string {
  if (rows.length === 0) return emptyText
  return rows.map((row) => {
    const source = row.sourceTitle || row.sourcePath || row.id
    const target = row.targetTitle || row.targetPath || row.id
    const evidence = parseStringArray(row.evidenceJson).slice(0, 2)
    return [
      `- **${source}** -> **${target}** (${row.relationType}, confidence ${Math.round(row.confidence * 100)}%, score ${row.score.toFixed(2)}, seen ${row.strength}x)`,
      `  - Why: ${row.reason || 'Stored relation without a reason.'}`,
      evidence.length > 0 ? `  - Evidence: ${evidence.join(' | ')}` : ''
    ].filter(Boolean).join('\n')
  }).join('\n')
}

function formatThemes(rows: ThemeReviewRow[]): string {
  if (rows.length === 0) return 'No long-term themes changed during this period.'
  return rows.map((row) => {
    const keywords = parseStringArray(row.keywordsJson).slice(0, 5).join(', ')
    return [
      `- **${row.title}** (strength ${row.strength.toFixed(2)}, evidence ${row.evidenceCount})`,
      `  - Change window: ${formatDate(row.firstSeenAt)} to ${formatDate(row.lastSeenAt)}`,
      `  - Summary: ${row.summary || 'No theme summary stored.'}`,
      keywords ? `  - Keywords: ${keywords}` : ''
    ].filter(Boolean).join('\n')
  }).join('\n')
}

function formatRepeatedQuestionsAndBlockers(repeatedQuestions: RepeatedQuestion[], blockers: Blocker[]): string {
  const lines: string[] = []
  if (repeatedQuestions.length > 0) {
    lines.push('### Repeated Questions')
    lines.push(...repeatedQuestions.map((item) => `- ${item.question} (${item.count}x, last asked ${formatDateTime(item.lastAskedAt)})`))
  } else {
    lines.push('### Repeated Questions')
    lines.push('No repeated AI questions were detected.')
  }
  lines.push('')
  if (blockers.length > 0) {
    lines.push('### Blockers')
    lines.push(...blockers.map((item) => `- **${item.title}**${item.filePath ? ` (${item.filePath})` : ''}: ${item.detail}`))
  } else {
    lines.push('### Blockers')
    lines.push('No blocked or waiting tasks were detected.')
  }
  return lines.join('\n')
}

function writeReviewMarkdown(vaultPath: string, markdown: string, outputPath: string | undefined, until: number): string {
  const relativeOutput = outputPath?.trim() || `.nexusky/reviews/${formatDate(until)}-cognitive-review.md`
  const absoluteOutput = isAbsolute(relativeOutput)
    ? resolve(relativeOutput)
    : resolve(vaultPath, relativeOutput)
  const vaultRoot = resolve(vaultPath)
  const rel = relative(vaultRoot, absoluteOutput).replace(/\\/g, '/')
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Cognitive review outputPath must stay inside the vault')
  }
  const dir = dirname(absoluteOutput)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(absoluteOutput, markdown, 'utf-8')
  return rel
}

function dedupeBlockers(blockers: Blocker[]): Blocker[] {
  const seen = new Set<string>()
  const result: Blocker[] = []
  for (const blocker of blockers) {
    const key = `${blocker.filePath || ''}:${blocker.title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(blocker)
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title))
}

function normalizeQuestion(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
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

function formatDate(value: number): string {
  return new Date(value * 1000).toISOString().slice(0, 10)
}

function formatDateTime(value: number): string {
  return new Date(value * 1000).toISOString().replace('T', ' ').slice(0, 16)
}
