import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../database'

export type ProactiveSuggestionKind = 'relation' | 'theme_link' | 'cognitive_review' | 'maintenance'
export type ProactiveSuggestionStatus = 'pending' | 'shown' | 'opened' | 'snoozed' | 'dismissed' | 'expired'
export type ProactiveCtaAction = 'open_note' | 'add_wikilink' | 'open_review' | 'open_queue'
export type ProactiveEntityType = 'note' | 'task' | 'vault'

export interface ProactiveSuggestionRow {
  id: string
  kind: ProactiveSuggestionKind
  sourceRef: string
  entityType: ProactiveEntityType | null
  entityId: string | null
  title: string
  body: string
  ctaAction: ProactiveCtaAction
  ctaPayload: Record<string, unknown>
  importance: number
  status: ProactiveSuggestionStatus
  snoozeUntil: number | null
  shownAt: number | null
  respondedAt: number | null
  signature: string
  createdAt: number
  updatedAt: number
}

export interface UpsertProactiveSuggestionInput {
  kind: ProactiveSuggestionKind
  sourceRef: string
  entityType?: ProactiveEntityType | null
  entityId?: string | null
  title: string
  body?: string
  ctaAction: ProactiveCtaAction
  ctaPayload?: Record<string, unknown>
  importance?: number
  signature: string
}

export interface ListProactiveSuggestionsParams {
  status?: ProactiveSuggestionStatus[]
  entityType?: ProactiveEntityType | null
  entityId?: string | null
  limit?: number
  sinceSeconds?: number
}

export interface UpdateProactiveStatusInput {
  id: string
  status: ProactiveSuggestionStatus
  snoozeUntil?: number | null
  shownAt?: number | null
  respondedAt?: number | null
}

export interface UpdateProactiveStatusesInput {
  status: 'opened' | 'dismissed'
  fromStatuses?: ProactiveSuggestionStatus[]
}

const PRUNE_AGE_SECONDS = 30 * 24 * 60 * 60

function clampImportance(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 50
  return Math.max(0, Math.min(100, Math.round(value)))
}

function serializePayload(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '{}'
  try {
    return JSON.stringify(payload)
  } catch {
    return '{}'
  }
}

function deserializePayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

interface RawProactiveRow {
  id: string
  kind: string
  source_ref: string
  entity_type: string | null
  entity_id: string | null
  title: string
  body: string
  cta_action: string
  cta_payload_json: string | null
  importance: number
  status: string
  snooze_until: number | null
  shown_at: number | null
  responded_at: number | null
  signature: string
  created_at: number
  updated_at: number
}

function mapRow(row: RawProactiveRow): ProactiveSuggestionRow {
  return {
    id: row.id,
    kind: row.kind as ProactiveSuggestionKind,
    sourceRef: row.source_ref,
    entityType: (row.entity_type as ProactiveEntityType | null) ?? null,
    entityId: row.entity_id ?? null,
    title: row.title,
    body: row.body ?? '',
    ctaAction: row.cta_action as ProactiveCtaAction,
    ctaPayload: deserializePayload(row.cta_payload_json),
    importance: row.importance,
    status: row.status as ProactiveSuggestionStatus,
    snoozeUntil: row.snooze_until ?? null,
    shownAt: row.shown_at ?? null,
    respondedAt: row.responded_at ?? null,
    signature: row.signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function upsertSuggestion(vaultPath: string, input: UpsertProactiveSuggestionInput): ProactiveSuggestionRow {
  const db = getDatabase(vaultPath)
  const now = Math.floor(Date.now() / 1000)
  const importance = clampImportance(input.importance)
  const payload = serializePayload(input.ctaPayload)
  const body = input.body ?? ''
  const entityType = input.entityType ?? null
  const entityId = input.entityId ?? null

  const existing = db.prepare(
    'SELECT id, status, snooze_until FROM proactive_suggestions WHERE signature = ?'
  ).get(input.signature) as { id: string; status: string; snooze_until: number | null } | undefined

  if (existing) {
    const reactivateFromSnooze =
      existing.status === 'snoozed' &&
      (existing.snooze_until == null || existing.snooze_until <= now)

    if (reactivateFromSnooze) {
      db.prepare(`
        UPDATE proactive_suggestions
        SET kind = ?,
            source_ref = ?,
            entity_type = ?,
            entity_id = ?,
            title = ?,
            body = ?,
            cta_action = ?,
            cta_payload_json = ?,
            importance = ?,
            status = 'pending',
            snooze_until = NULL,
            shown_at = NULL,
            responded_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(
        input.kind,
        input.sourceRef,
        entityType,
        entityId,
        input.title,
        body,
        input.ctaAction,
        payload,
        importance,
        now,
        existing.id
      )
      return getById(db, existing.id)!
    }

    db.prepare(`
      UPDATE proactive_suggestions
      SET kind = ?,
          source_ref = ?,
          entity_type = ?,
          entity_id = ?,
          title = ?,
          body = ?,
          cta_action = ?,
          cta_payload_json = ?,
          importance = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.kind,
      input.sourceRef,
      entityType,
      entityId,
      input.title,
      body,
      input.ctaAction,
      payload,
      importance,
      now,
      existing.id
    )
    return getById(db, existing.id)!
  }

  const id = randomUUID()
  db.prepare(`
    INSERT INTO proactive_suggestions (
      id, kind, source_ref, entity_type, entity_id,
      title, body, cta_action, cta_payload_json,
      importance, status, signature, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id,
    input.kind,
    input.sourceRef,
    entityType,
    entityId,
    input.title,
    body,
    input.ctaAction,
    payload,
    importance,
    input.signature,
    now,
    now
  )

  return getById(db, id)!
}

function getById(db: Database.Database, id: string): ProactiveSuggestionRow | null {
  const row = db.prepare('SELECT * FROM proactive_suggestions WHERE id = ?').get(id) as RawProactiveRow | undefined
  return row ? mapRow(row) : null
}

export function listSuggestions(vaultPath: string, params: ListProactiveSuggestionsParams = {}): ProactiveSuggestionRow[] {
  const db = getDatabase(vaultPath)
  const where: string[] = []
  const args: unknown[] = []

  if (params.status && params.status.length > 0) {
    where.push(`status IN (${params.status.map(() => '?').join(',')})`)
    args.push(...params.status)
  }

  if (params.entityType !== undefined) {
    if (params.entityType === null) {
      where.push('entity_type IS NULL')
    } else {
      where.push('entity_type = ?')
      args.push(params.entityType)
    }
  }

  if (params.entityId !== undefined) {
    if (params.entityId === null) {
      where.push('entity_id IS NULL')
    } else {
      where.push('entity_id = ?')
      args.push(params.entityId)
    }
  }

  if (typeof params.sinceSeconds === 'number') {
    where.push('created_at >= ?')
    args.push(params.sinceSeconds)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.max(1, Math.min(500, params.limit ?? 100))

  const rows = db.prepare(`
    SELECT * FROM proactive_suggestions
    ${whereSql}
    ORDER BY importance DESC, created_at DESC
    LIMIT ?
  `).all(...args, limit) as RawProactiveRow[]

  return rows.map(mapRow)
}

export function updateStatus(vaultPath: string, input: UpdateProactiveStatusInput): ProactiveSuggestionRow | null {
  const db = getDatabase(vaultPath)
  const now = Math.floor(Date.now() / 1000)

  const existing = db.prepare('SELECT id FROM proactive_suggestions WHERE id = ?').get(input.id) as { id: string } | undefined
  if (!existing) return null

  const sets: string[] = ['status = ?', 'updated_at = ?']
  const args: unknown[] = [input.status, now]

  if (input.snoozeUntil !== undefined) {
    sets.push('snooze_until = ?')
    args.push(input.snoozeUntil)
  }

  if (input.shownAt !== undefined) {
    sets.push('shown_at = ?')
    args.push(input.shownAt)
  } else if (input.status === 'shown') {
    sets.push('shown_at = ?')
    args.push(now)
  }

  if (input.respondedAt !== undefined) {
    sets.push('responded_at = ?')
    args.push(input.respondedAt)
  } else if (input.status === 'opened' || input.status === 'snoozed' || input.status === 'dismissed') {
    sets.push('responded_at = ?')
    args.push(now)
  }

  db.prepare(`UPDATE proactive_suggestions SET ${sets.join(', ')} WHERE id = ?`).run(...args, input.id)
  return getById(db, input.id)
}

export function updateStatuses(vaultPath: string, input: UpdateProactiveStatusesInput): number {
  const db = getDatabase(vaultPath)
  const now = Math.floor(Date.now() / 1000)
  const fromStatuses = input.fromStatuses && input.fromStatuses.length > 0
    ? input.fromStatuses
    : (['pending', 'shown'] satisfies ProactiveSuggestionStatus[])
  const placeholders = fromStatuses.map(() => '?').join(',')

  const result = db.prepare(`
    UPDATE proactive_suggestions
    SET status = ?,
        updated_at = ?,
        responded_at = ?,
        snooze_until = NULL
    WHERE status IN (${placeholders})
  `).run(input.status, now, now, ...fromStatuses)

  return result.changes ?? 0
}

export interface PruneExpiredParams {
  now?: number
  ageSeconds?: number
}

export function pruneExpired(vaultPath: string, params: PruneExpiredParams = {}): number {
  const db = getDatabase(vaultPath)
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const cutoff = now - (params.ageSeconds ?? PRUNE_AGE_SECONDS)

  const result = db.prepare(`
    UPDATE proactive_suggestions
    SET status = 'expired', updated_at = ?
    WHERE status IN ('pending', 'shown')
      AND created_at < ?
  `).run(now, cutoff)

  return result.changes ?? 0
}

export function deleteExpiredSuggestions(vaultPath: string, params: PruneExpiredParams = {}): number {
  const db = getDatabase(vaultPath)
  const now = params.now ?? Math.floor(Date.now() / 1000)
  // Physically remove long-settled suggestions so the table can't grow forever.
  const cutoff = now - (params.ageSeconds ?? PRUNE_AGE_SECONDS * 3)
  const result = db.prepare(`
    DELETE FROM proactive_suggestions
    WHERE status IN ('expired', 'dismissed', 'opened')
      AND created_at < ?
  `).run(cutoff)
  return result.changes ?? 0
}

export function getSuggestionById(vaultPath: string, id: string): ProactiveSuggestionRow | null {
  const db = getDatabase(vaultPath)
  return getById(db, id)
}
