import { randomUUID } from 'crypto'
import { getDatabase } from '../database'

export type LongContextEventType =
  | 'suggestion_shown'
  | 'suggestion_opened'
  | 'relation_feedback_submitted'
  | 'relation_created'
  | 'relation_reinforced'
  | 'theme_created'

export interface RecordContextEventParams {
  vaultPath: string
  eventType: LongContextEventType
  entityType: string
  entityId: string
  entityTitle?: string
  entityPath?: string
  contentSnapshot?: string
  metadata?: Record<string, unknown>
  createdAt?: number
}

export interface LongContextMetrics {
  since?: number
  until?: number
  counts: {
    suggestionShown: number
    suggestionOpened: number
    suggestionUseful: number
    suggestionDismissed: number
    suggestionNotRelated: number
    relationCreated: number
    relationReinforced: number
    themeCreated: number
  }
  rates: {
    usefulRate: number
    openRate: number
    notRelatedRate: number
  }
}

interface ContextEventRow {
  eventType: LongContextEventType
  metadataJson: string | null
}

export function recordContextEvent(params: RecordContextEventParams): void {
  const db = getDatabase(params.vaultPath)
  const now = params.createdAt ?? Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO context_events (
      id, event_type, entity_type, entity_id, entity_title, entity_path,
      content_snapshot, metadata_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    params.eventType,
    params.entityType,
    params.entityId,
    params.entityTitle || null,
    params.entityPath || null,
    params.contentSnapshot || null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    now
  )
}

export function getLongContextMetrics(params: {
  vaultPath: string
  since?: number
  until?: number
}): LongContextMetrics {
  const db = getDatabase(params.vaultPath)
  const { where, values } = buildWindowWhere(params.since, params.until)
  const rows = db.prepare(`
    SELECT event_type as eventType, metadata_json as metadataJson
    FROM context_events
    ${where}
  `).all(...values) as ContextEventRow[]

  const counts: LongContextMetrics['counts'] = {
    suggestionShown: 0,
    suggestionOpened: 0,
    suggestionUseful: 0,
    suggestionDismissed: 0,
    suggestionNotRelated: 0,
    relationCreated: 0,
    relationReinforced: 0,
    themeCreated: 0
  }

  for (const row of rows) {
    if (row.eventType === 'suggestion_shown') counts.suggestionShown += 1
    if (row.eventType === 'suggestion_opened') counts.suggestionOpened += 1
    if (row.eventType === 'relation_created') counts.relationCreated += 1
    if (row.eventType === 'relation_reinforced') counts.relationReinforced += 1
    if (row.eventType === 'theme_created') counts.themeCreated += 1
    if (row.eventType === 'relation_feedback_submitted') {
      const feedbackType = getMetadataString(row.metadataJson, 'feedbackType')
      if (feedbackType === 'useful') counts.suggestionUseful += 1
      if (feedbackType === 'dismissed') counts.suggestionDismissed += 1
      if (feedbackType === 'not_related') counts.suggestionNotRelated += 1
    }
  }

  return {
    since: params.since,
    until: params.until,
    counts,
    rates: {
      usefulRate: ratio(counts.suggestionUseful, counts.suggestionShown),
      openRate: ratio(counts.suggestionOpened, counts.suggestionShown),
      notRelatedRate: ratio(counts.suggestionNotRelated, counts.suggestionShown)
    }
  }
}

function buildWindowWhere(since?: number, until?: number): { where: string; values: number[] } {
  const clauses: string[] = []
  const values: number[] = []
  if (since !== undefined) {
    clauses.push('created_at >= ?')
    values.push(since)
  }
  if (until !== undefined) {
    clauses.push('created_at <= ?')
    values.push(until)
  }
  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  }
}

function getMetadataString(value: string | null, key: string): string | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return typeof parsed[key] === 'string' ? parsed[key] : undefined
  } catch {
    return undefined
  }
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Number((numerator / denominator).toFixed(4))
}
