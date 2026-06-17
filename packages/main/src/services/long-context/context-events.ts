import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { recordHeatmapEvent } from '../heatmap'

export type LongContextEventType =
  | 'note_created'
  | 'note_updated'
  | 'task_created'
  | 'task_updated'
  | 'ai_question_asked'
  | 'suggestion_shown'
  | 'suggestion_opened'
  | 'relation_feedback_submitted'
  | 'relation_created'
  | 'relation_reinforced'
  | 'theme_created'
  | 'theme_extraction_run'
  | 'cognitive_review_generated'

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

export interface LongContextMetricsBucket {
  bucketStart: number
  shown: number
  opened: number
  useful: number
  notRelated: number
  usefulRate: number
  openRate: number
  notRelatedRate: number
}

export interface LongContextMetricsSeries {
  bucketSizeSec: number
  buckets: LongContextMetricsBucket[]
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
  series: LongContextMetricsSeries
}

interface ContextEventRow {
  eventType: LongContextEventType
  metadataJson: string | null
  createdAt: number
}

export function recordContextEvent(params: RecordContextEventParams): void {
  const db = getDatabase(params.vaultPath)
  const now = params.createdAt ?? Date.now() // 使用毫秒时间戳
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

  // Update heatmap incrementally
  recordHeatmapEvent(params.vaultPath, params.eventType, now)
}

const DAY_MILLISECONDS = 86400 * 1000
const DEFAULT_SERIES_WINDOW_DAYS = 30

export function getLongContextMetrics(params: {
  vaultPath: string
  since?: number
  until?: number
}): LongContextMetrics {
  const db = getDatabase(params.vaultPath)
  const { where, values } = buildWindowWhere(params.since, params.until)
  const rows = db.prepare(`
    SELECT event_type as eventType, metadata_json as metadataJson, created_at as createdAt
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

  const seriesRange = resolveSeriesRange(params.since, params.until)
  const bucketMap = new Map<number, LongContextMetricsBucket>()
  for (let t = seriesRange.start; t < seriesRange.end; t += DAY_MILLISECONDS) {
    bucketMap.set(t, emptyBucket(t))
  }

  for (const row of rows) {
    if (row.eventType === 'suggestion_shown') counts.suggestionShown += 1
    if (row.eventType === 'suggestion_opened') counts.suggestionOpened += 1
    if (row.eventType === 'relation_created') counts.relationCreated += 1
    if (row.eventType === 'relation_reinforced') counts.relationReinforced += 1
    if (row.eventType === 'theme_created') counts.themeCreated += 1
    let feedbackType: string | undefined
    if (row.eventType === 'relation_feedback_submitted') {
      feedbackType = getMetadataString(row.metadataJson, 'feedbackType')
      if (feedbackType === 'useful') counts.suggestionUseful += 1
      if (feedbackType === 'dismissed' || feedbackType === 'snoozed') counts.suggestionDismissed += 1
      if (feedbackType === 'not_related') counts.suggestionNotRelated += 1
    }

    const bucketStart = Math.floor(row.createdAt / DAY_MILLISECONDS) * DAY_MILLISECONDS
    if (bucketStart < seriesRange.start || bucketStart >= seriesRange.end) continue
    const bucket = bucketMap.get(bucketStart)
    if (!bucket) continue
    if (row.eventType === 'suggestion_shown') bucket.shown += 1
    if (row.eventType === 'suggestion_opened') bucket.opened += 1
    if (row.eventType === 'relation_feedback_submitted') {
      if (feedbackType === 'useful') bucket.useful += 1
      if (feedbackType === 'not_related') bucket.notRelated += 1
    }
  }

  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => a.bucketStart - b.bucketStart)
    .map((b) => ({
      ...b,
      usefulRate: ratio(b.useful, b.shown),
      openRate: ratio(b.opened, b.shown),
      notRelatedRate: ratio(b.notRelated, b.shown)
    }))

  return {
    since: params.since,
    until: params.until,
    counts,
    rates: {
      usefulRate: ratio(counts.suggestionUseful, counts.suggestionShown),
      openRate: ratio(counts.suggestionOpened, counts.suggestionShown),
      notRelatedRate: ratio(counts.suggestionNotRelated, counts.suggestionShown)
    },
    series: {
      bucketSizeSec: DAY_MILLISECONDS,
      buckets
    }
  }
}

function emptyBucket(bucketStart: number): LongContextMetricsBucket {
  return {
    bucketStart,
    shown: 0,
    opened: 0,
    useful: 0,
    notRelated: 0,
    usefulRate: 0,
    openRate: 0,
    notRelatedRate: 0
  }
}

function resolveSeriesRange(since?: number, until?: number): { start: number; end: number } {
  const nowMs = Date.now() // 使用毫秒时间戳
  const rawUntil = until ?? nowMs
  const rawSince = since ?? rawUntil - DEFAULT_SERIES_WINDOW_DAYS * DAY_MILLISECONDS
  const start = Math.floor(rawSince / DAY_MILLISECONDS) * DAY_MILLISECONDS
  const endAligned = Math.floor(rawUntil / DAY_MILLISECONDS) * DAY_MILLISECONDS + DAY_MILLISECONDS
  return { start, end: Math.max(endAligned, start + DAY_MILLISECONDS) }
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
