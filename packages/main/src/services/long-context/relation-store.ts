import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../database'
import { rankRelation, type RelationFeedbackCounts } from './relation-ranker'
import { recordContextEvent } from './context-events'
import type { EntityType } from './relation-candidates'
import type { RelationType } from './relation-classifier'
import { getLongContextPrefs } from './long-context-prefs'

export type RelationStatus = 'active' | 'dismissed' | 'archived' | 'wrong'
export type RelationFeedbackType = 'useful' | 'not_related' | 'wrong_reason' | 'dismissed' | 'snoozed'

export interface UpsertRelationInput {
  sourceType: EntityType
  sourceId: string
  sourceTitle?: string
  sourcePath?: string
  targetType: EntityType
  targetId: string
  targetTitle?: string
  targetPath?: string
  relationType: RelationType
  confidence: number
  localScore?: number
  evidence: string[]
  reason: string
  status?: RelationStatus
}

export interface ContextSuggestion {
  relationId: string
  targetType: EntityType
  targetId: string
  targetTitle: string
  targetPath?: string
  relationType: RelationType
  confidence: number
  score: number
  reason: string
  evidence: string[]
  lastSeenAt: number
}

export interface RelationRefreshResult {
  refreshed: number
  archived: number
}

export function upsertRelation(vaultPath: string, relation: UpsertRelationInput): string {
  const db = getDatabase(vaultPath)
  const now = Math.floor(Date.now() / 1000)
  const existing = db.prepare(`
    SELECT id, strength, status
    FROM ai_relations
    WHERE source_type = ? AND source_id = ?
      AND target_type = ? AND target_id = ?
      AND relation_type = ?
  `).get(
    relation.sourceType,
    relation.sourceId,
    relation.targetType,
    relation.targetId,
    relation.relationType
  ) as { id: string; strength: number; status: RelationStatus } | undefined

  const id = existing?.id || randomUUID()
  const nextStrength = Math.max(1, (existing?.strength || 0) + 1)
  const feedback = existing ? getFeedbackCounts(db, existing.id) : {}
  const evidence = normalizeEvidence(relation.evidence)
  const nextStatus = existing?.status === 'dismissed' || existing?.status === 'wrong'
    ? existing.status
    : relation.status || 'active'
  const score = applyFeedbackAndStatusPenalty(rankRelation({
    localScore: relation.localScore ?? relation.confidence,
    aiConfidence: relation.confidence,
    recurrenceCount: nextStrength,
    lastSeenAt: now,
    feedback,
    evidence,
    now,
    halfLifeDays: getLongContextPrefs().decayHalfLifeDays
  }), nextStatus, feedback)

  db.prepare(`
    INSERT INTO ai_relations (
      id,
      source_type,
      source_id,
      source_title,
      source_path,
      target_type,
      target_id,
      target_title,
      target_path,
      relation_type,
      confidence,
      strength,
      score,
      evidence_json,
      reason,
      status,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_type, source_id, target_type, target_id, relation_type) DO UPDATE SET
      source_title = excluded.source_title,
      source_path = excluded.source_path,
      target_title = excluded.target_title,
      target_path = excluded.target_path,
      confidence = excluded.confidence,
      strength = excluded.strength,
      score = excluded.score,
      evidence_json = excluded.evidence_json,
      reason = excluded.reason,
      status = CASE
        WHEN ai_relations.status IN ('dismissed', 'wrong') THEN ai_relations.status
        ELSE excluded.status
      END,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    relation.sourceType,
    relation.sourceId,
    relation.sourceTitle || null,
    relation.sourcePath || null,
    relation.targetType,
    relation.targetId,
    relation.targetTitle || null,
    relation.targetPath || null,
    relation.relationType,
    clamp01(relation.confidence),
    nextStrength,
    score,
    JSON.stringify(evidence),
    relation.reason.trim(),
    nextStatus,
    now,
    now,
    now,
    now
  )

  recordContextEvent({
    vaultPath,
    eventType: existing ? 'relation_reinforced' : 'relation_created',
    entityType: relation.sourceType,
    entityId: relation.sourceId,
    entityTitle: relation.sourceTitle,
    entityPath: relation.sourcePath,
    metadata: {
      relationId: id,
      targetType: relation.targetType,
      targetId: relation.targetId,
      relationType: relation.relationType,
      score,
      confidence: clamp01(relation.confidence)
    },
    createdAt: now
  })

  return id
}

export function getContextSuggestions(params: {
  vaultPath: string
  entityType: EntityType
  entityId: string
  limit?: number
}): ContextSuggestion[] {
  refreshRelationScores({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    limit: 100
  })
  const db = getDatabase(params.vaultPath)
  const limit = Math.max(1, Math.min(params.limit ?? 3, 20))
  const rows = db.prepare(`
    SELECT *
    FROM ai_relations
    WHERE status = 'active'
      AND (
        (source_type = ? AND source_id = ?)
        OR (target_type = ? AND target_id = ?)
      )
    ORDER BY score DESC, last_seen_at DESC, target_title ASC, source_title ASC
    LIMIT ?
  `).all(params.entityType, params.entityId, params.entityType, params.entityId, limit) as RelationRow[]

  return rows.map((row) => toSuggestion(row, params.entityType, params.entityId))
}

export function refreshRelationScores(params: {
  vaultPath: string
  entityType?: EntityType
  entityId?: string
  now?: number
  limit?: number
  archiveAfterDays?: number
  archiveScoreThreshold?: number
}): RelationRefreshResult {
  const db = getDatabase(params.vaultPath)
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const limit = Math.max(1, Math.min(params.limit ?? 500, 2000))
  const prefs = getLongContextPrefs()
  const archiveAfterDays = params.archiveAfterDays ?? prefs.archiveAfterDays
  const archiveScoreThreshold = params.archiveScoreThreshold ?? 0.45
  const entityFilter = params.entityType && params.entityId
    ? `AND (
        (source_type = ? AND source_id = ?)
        OR (target_type = ? AND target_id = ?)
      )`
    : ''
  const queryParams: (string | number)[] = params.entityType && params.entityId
    ? [params.entityType, params.entityId, params.entityType, params.entityId, limit]
    : [limit]
  const rows = db.prepare(`
    SELECT *
    FROM ai_relations
    WHERE status IN ('active', 'dismissed', 'wrong')
      ${entityFilter}
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(...queryParams) as RelationRow[]

  const update = db.prepare(`
    UPDATE ai_relations
    SET score = ?, status = ?, updated_at = ?
    WHERE id = ?
  `)
  let refreshed = 0
  let archived = 0

  const tx = db.transaction(() => {
    for (const row of rows) {
      const feedback = getFeedbackCounts(db, row.id)
      const evidence = parseEvidence(row.evidence_json)
      const baseScore = rankRelation({
        localScore: row.confidence,
        aiConfidence: row.confidence,
        recurrenceCount: row.strength,
        lastSeenAt: row.last_seen_at,
        feedback,
        evidence,
        now,
        halfLifeDays: prefs.decayHalfLifeDays
      })
      const score = applyFeedbackAndStatusPenalty(baseScore, row.status, feedback)
      const daysSinceSeen = Math.max(0, (now - row.last_seen_at) / 86_400)
      const nextStatus = row.status === 'active' && daysSinceSeen >= archiveAfterDays && score <= archiveScoreThreshold
        ? 'archived'
        : row.status
      if (nextStatus === 'archived' && row.status !== 'archived') archived += 1
      refreshed += 1
      update.run(score, nextStatus, now, row.id)
    }
  })
  tx()

  return { refreshed, archived }
}

export function submitRelationFeedback(params: {
  vaultPath: string
  relationId: string
  feedbackType: RelationFeedbackType
  note?: string
}): void {
  const db = getDatabase(params.vaultPath)
  const relation = db.prepare('SELECT * FROM ai_relations WHERE id = ?').get(params.relationId) as RelationRow | undefined
  if (!relation) throw new Error(`Relation not found: ${params.relationId}`)

  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO relation_feedback (id, relation_id, feedback_type, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), params.relationId, params.feedbackType, params.note || null, now)

  const nextStatus = nextStatusForFeedback(relation.status, params.feedbackType)
  const nextScore = adjustScoreForFeedback(relation.score, params.feedbackType)
  db.prepare(`
    UPDATE ai_relations
    SET status = ?, score = ?, updated_at = ?
    WHERE id = ?
  `).run(nextStatus, nextScore, now, params.relationId)
}

interface RelationRow {
  id: string
  source_type: EntityType
  source_id: string
  source_title: string | null
  source_path: string | null
  target_type: EntityType
  target_id: string
  target_title: string | null
  target_path: string | null
  relation_type: RelationType
  confidence: number
  strength: number
  score: number
  evidence_json: string
  reason: string
  status: RelationStatus
  first_seen_at: number
  last_seen_at: number
  created_at: number
  updated_at: number
}

function getFeedbackCounts(db: Database.Database, relationId: string): RelationFeedbackCounts {
  const rows = db.prepare(`
    SELECT feedback_type as feedbackType, COUNT(*) as count
    FROM relation_feedback
    WHERE relation_id = ?
    GROUP BY feedback_type
  `).all(relationId) as { feedbackType: RelationFeedbackType; count: number }[]
  const counts: RelationFeedbackCounts = {}
  for (const row of rows) {
    if (row.feedbackType === 'useful') counts.useful = row.count
    if (row.feedbackType === 'dismissed') counts.dismissed = row.count
    if (row.feedbackType === 'snoozed') counts.snoozed = row.count
    if (row.feedbackType === 'not_related') counts.notRelated = row.count
    if (row.feedbackType === 'wrong_reason') counts.wrongReason = row.count
  }
  return counts
}

function toSuggestion(row: RelationRow, entityType: EntityType, entityId: string): ContextSuggestion {
  const sourceMatches = row.source_type === entityType && row.source_id === entityId
  return {
    relationId: row.id,
    targetType: sourceMatches ? row.target_type : row.source_type,
    targetId: sourceMatches ? row.target_id : row.source_id,
    targetTitle: (sourceMatches ? row.target_title : row.source_title) || 'Untitled',
    targetPath: (sourceMatches ? row.target_path : row.source_path) || undefined,
    relationType: row.relation_type,
    confidence: row.confidence,
    score: row.score,
    reason: row.reason,
    evidence: parseEvidence(row.evidence_json),
    lastSeenAt: row.last_seen_at
  }
}

function normalizeEvidence(evidence: string[]): string[] {
  return evidence
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function parseEvidence(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function nextStatusForFeedback(current: RelationStatus, feedbackType: RelationFeedbackType): RelationStatus {
  if (feedbackType === 'dismissed') return 'dismissed'
  if (feedbackType === 'not_related') return 'wrong'
  return current === 'dismissed' || current === 'wrong' ? current : 'active'
}

function adjustScoreForFeedback(score: number, feedbackType: RelationFeedbackType): number {
  if (feedbackType === 'useful') return Number(clamp01(score + 0.25).toFixed(4))
  if (feedbackType === 'dismissed') return Number(clamp01(score - 0.15).toFixed(4))
  if (feedbackType === 'snoozed') return Number(clamp01(score - 0.1).toFixed(4))
  if (feedbackType === 'not_related') return Number(clamp01(score - 0.5).toFixed(4))
  if (feedbackType === 'wrong_reason') return Number(clamp01(score - 0.25).toFixed(4))
  return score
}

function applyFeedbackAndStatusPenalty(score: number, status: RelationStatus, feedback: RelationFeedbackCounts): number {
  let nextScore = score
  if (status === 'dismissed' || feedback.dismissed) nextScore -= 0.15
  if (feedback.snoozed) nextScore -= 0.1
  if (status === 'wrong' || feedback.notRelated) nextScore -= 0.5
  if (feedback.wrongReason) nextScore -= 0.25
  return Number(clamp01(nextScore).toFixed(4))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
