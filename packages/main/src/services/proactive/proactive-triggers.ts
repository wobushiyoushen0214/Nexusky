import { getDatabase } from '../database'
import { getLongTermThemes } from '../long-context/theme-extractor'
import { extractTaskDueDate } from '../ai/maintenance-queue'
import {
  DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS,
  type ProactiveTriggerThresholds
} from './proactive-policy'
import type {
  ProactiveCtaAction,
  ProactiveEntityType,
  ProactiveSuggestionKind
} from './proactive-store'

export type ProactiveTriggerKind =
  | 'long_context_high_score'
  | 'theme_proximity'
  | 'cognitive_review_ready'
  | 'stale_island_note'
  | 'overdue_task_burst'

export type ProactiveCandidateKind = ProactiveSuggestionKind
export type { ProactiveCtaAction, ProactiveEntityType }

export interface ProactiveTriggerInput {
  vaultPath: string
  entityType: ProactiveEntityType
  entityId: string
  trigger: ProactiveTriggerKind
  now?: number
  context?: Record<string, unknown>
  thresholds?: ProactiveTriggerThresholds
}

export interface ProactiveCandidate {
  kind: ProactiveCandidateKind
  sourceRef: string
  entityType: ProactiveEntityType | null
  entityId: string | null
  title: string
  body: string
  ctaAction: ProactiveCtaAction
  ctaPayload: Record<string, unknown>
  importance: number
  signature: string
}

export function evaluateTriggers(input: ProactiveTriggerInput): ProactiveCandidate[] {
  const thresholds = resolveThresholds(input.thresholds)
  switch (input.trigger) {
    case 'long_context_high_score':
      return evaluateLongContextHighScore(input, thresholds)
    case 'theme_proximity':
      return evaluateThemeProximity(input, thresholds)
    case 'cognitive_review_ready':
      return evaluateCognitiveReviewReady(input)
    case 'stale_island_note':
      return evaluateStaleIslandNote(input, thresholds)
    case 'overdue_task_burst':
      return evaluateOverdueTaskBurst(input, thresholds)
    default:
      return []
  }
}

function resolveThresholds(input?: ProactiveTriggerThresholds): ProactiveTriggerThresholds {
  if (!input) return DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS
  return {
    highScoreThreshold: clamp(input.highScoreThreshold, 0, 1, DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.highScoreThreshold),
    highScoreRecentHours: clampInt(input.highScoreRecentHours, 1, 24 * 30, DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.highScoreRecentHours),
    staleIslandDays: clampInt(input.staleIslandDays, 1, 365, DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.staleIslandDays),
    themeKeywordOverlapMin: clampInt(input.themeKeywordOverlapMin, 1, 20, DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.themeKeywordOverlapMin),
    overdueTaskMin: clampInt(input.overdueTaskMin, 1, 50, DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.overdueTaskMin)
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

interface AiRelationRow {
  id: string
  source_type: string
  source_id: string
  source_title: string | null
  source_path: string | null
  target_type: string
  target_id: string
  target_title: string | null
  target_path: string | null
  relation_type: string
  score: number
  confidence: number
  reason: string
  last_seen_at: number
  created_at: number
}

function unixNow(now?: number): number {
  return now ?? Math.floor(Date.now() / 1000)
}

function evaluateLongContextHighScore(
  input: ProactiveTriggerInput,
  thresholds: ProactiveTriggerThresholds
): ProactiveCandidate[] {
  if (input.entityType !== 'note') return []
  const db = getDatabase(input.vaultPath)
  const now = unixNow(input.now)
  const since = now - thresholds.highScoreRecentHours * 60 * 60

  const rows = db.prepare(`
    SELECT id, source_type, source_id, source_title, source_path,
           target_type, target_id, target_title, target_path,
           relation_type, score, confidence, reason, last_seen_at, created_at
    FROM ai_relations
    WHERE status = 'active'
      AND score >= ?
      AND created_at >= ?
      AND (
        (source_type = ? AND source_id = ?)
        OR (target_type = ? AND target_id = ?)
      )
    ORDER BY score DESC, created_at DESC
    LIMIT 5
  `).all(
    thresholds.highScoreThreshold,
    since,
    input.entityType,
    input.entityId,
    input.entityType,
    input.entityId
  ) as AiRelationRow[]

  const candidates: ProactiveCandidate[] = []
  for (const row of rows) {
    const isSource = row.source_type === input.entityType && row.source_id === input.entityId
    const otherTitle = (isSource ? row.target_title : row.source_title) || (isSource ? row.target_id : row.source_id)
    const otherPath = isSource ? row.target_path : row.source_path
    const otherType = isSource ? row.target_type : row.source_type
    const otherId = isSource ? row.target_id : row.source_id

    candidates.push({
      kind: 'relation',
      sourceRef: row.id,
      entityType: input.entityType,
      entityId: input.entityId,
      title: `High-score relation: ${otherTitle}`,
      body: row.reason || `Relation type ${row.relation_type} (score ${row.score.toFixed(2)})`,
      ctaAction: otherPath ? 'open_note' : 'open_queue',
      ctaPayload: {
        relationId: row.id,
        relationType: row.relation_type,
        otherEntityType: otherType,
        otherEntityId: otherId,
        otherTitle,
        otherPath: otherPath ?? null,
        score: row.score
      },
      importance: Math.round(60 + Math.min(40, row.score * 40)),
      signature: `relation|${row.id}|${input.entityId}`
    })
  }
  return candidates
}

function evaluateThemeProximity(
  input: ProactiveTriggerInput,
  thresholds: ProactiveTriggerThresholds
): ProactiveCandidate[] {
  if (input.entityType !== 'note') return []
  const db = getDatabase(input.vaultPath)

  const noteRow = db.prepare(
    'SELECT title, file_path FROM notes WHERE id = ?'
  ).get(input.entityId) as { title: string; file_path: string } | undefined
  if (!noteRow) return []

  const content = typeof input.context?.content === 'string'
    ? (input.context.content as string)
    : ''
  const haystack = `${noteRow.title}\n${content}`.toLowerCase()
  if (!haystack.trim()) return []

  const themes = getLongTermThemes(input.vaultPath, 30)
  const candidates: ProactiveCandidate[] = []

  for (const theme of themes) {
    const memberAlready = theme.memberships.some(
      (m) => m.entityType === 'note' && m.entityId === input.entityId
    )
    if (memberAlready) continue

    const overlap = theme.keywords.filter((kw) => {
      const k = kw.trim().toLowerCase()
      if (k.length < 2) return false
      return haystack.includes(k)
    })
    if (overlap.length < thresholds.themeKeywordOverlapMin) continue

    candidates.push({
      kind: 'theme_link',
      sourceRef: theme.id,
      entityType: input.entityType,
      entityId: input.entityId,
      title: `Theme proximity: ${theme.title}`,
      body: `Matched ${overlap.length} keywords (${overlap.slice(0, 5).join(', ')})`,
      ctaAction: 'add_wikilink',
      ctaPayload: {
        themeId: theme.id,
        themeTitle: theme.title,
        matchedKeywords: overlap,
        notePath: noteRow.file_path
      },
      importance: Math.round(50 + Math.min(30, overlap.length * 5)),
      signature: `theme_link|${theme.id}|${input.entityId}`
    })
  }

  return candidates
}

function evaluateCognitiveReviewReady(input: ProactiveTriggerInput): ProactiveCandidate[] {
  const reviewPath = typeof input.context?.reviewFilePath === 'string'
    ? (input.context.reviewFilePath as string)
    : ''
  const title = typeof input.context?.reviewTitle === 'string'
    ? (input.context.reviewTitle as string)
    : 'Cognitive review'
  if (!reviewPath) return []

  return [{
    kind: 'cognitive_review',
    sourceRef: reviewPath,
    entityType: 'vault',
    entityId: input.entityId,
    title: `${title} ready`,
    body: 'A new cognitive review has been generated for your vault.',
    ctaAction: 'open_review',
    ctaPayload: { filePath: reviewPath, title },
    importance: 70,
    signature: `cognitive_review|${reviewPath}|vault`
  }]
}

function evaluateStaleIslandNote(
  input: ProactiveTriggerInput,
  thresholds: ProactiveTriggerThresholds
): ProactiveCandidate[] {
  if (input.entityType !== 'note') return []
  const db = getDatabase(input.vaultPath)
  const now = unixNow(input.now)
  const cutoff = now - thresholds.staleIslandDays * 24 * 60 * 60

  const noteRow = db.prepare(
    'SELECT title, file_path, updated_at FROM notes WHERE id = ?'
  ).get(input.entityId) as { title: string; file_path: string; updated_at: number } | undefined
  if (!noteRow) return []
  if (noteRow.updated_at > cutoff) return []

  const linkRow = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM links WHERE source_note_id = ?) AS outgoing,
      (SELECT COUNT(*) FROM links WHERE target_note_id = ?) AS incoming
  `).get(input.entityId, input.entityId) as { outgoing: number; incoming: number }

  const totalLinks = (linkRow?.outgoing ?? 0) + (linkRow?.incoming ?? 0)
  if (totalLinks > 0) return []

  return [{
    kind: 'maintenance',
    sourceRef: `stale_island:${input.entityId}`,
    entityType: 'note',
    entityId: input.entityId,
    title: `Stale island: ${noteRow.title}`,
    body: `Last updated more than ${thresholds.staleIslandDays} days ago and has no incoming or outgoing links.`,
    ctaAction: 'open_note',
    ctaPayload: { filePath: noteRow.file_path, title: noteRow.title },
    importance: 55,
    signature: `maintenance|stale_island|${input.entityId}`
  }]
}

function evaluateOverdueTaskBurst(
  input: ProactiveTriggerInput,
  thresholds: ProactiveTriggerThresholds
): ProactiveCandidate[] {
  if (input.entityType !== 'note') return []
  const db = getDatabase(input.vaultPath)

  const noteRow = db.prepare(
    'SELECT title, file_path FROM notes WHERE id = ?'
  ).get(input.entityId) as { title: string; file_path: string } | undefined
  if (!noteRow) return []

  const tasks = db.prepare(
    "SELECT text, done FROM tasks WHERE note_id = ? AND done = 0"
  ).all(input.entityId) as { text: string; done: number }[]
  if (tasks.length === 0) return []

  const todayIso = todayLocalIso(input.now)
  let overdue = 0
  let earliestDue: string | null = null
  for (const task of tasks) {
    const due = extractTaskDueDate(task.text)
    if (!due) continue
    if (due < todayIso) {
      overdue += 1
      if (!earliestDue || due < earliestDue) earliestDue = due
    }
  }
  if (overdue < thresholds.overdueTaskMin) return []

  return [{
    kind: 'maintenance',
    sourceRef: `overdue_tasks:${input.entityId}`,
    entityType: 'note',
    entityId: input.entityId,
    title: `${overdue} overdue tasks in ${noteRow.title}`,
    body: earliestDue
      ? `Earliest due date: ${earliestDue}. Open the note to review.`
      : 'Open the note to review overdue tasks.',
    ctaAction: 'open_note',
    ctaPayload: { filePath: noteRow.file_path, title: noteRow.title, overdueCount: overdue, earliestDue },
    importance: Math.min(95, 70 + overdue * 3),
    signature: `maintenance|overdue_tasks|${input.entityId}`
  }]
}

function todayLocalIso(now?: number): string {
  const d = now ? new Date(now * 1000) : new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
