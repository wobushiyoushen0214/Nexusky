import { createHash, randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { invalidateVaultQueryCacheWhere } from '../db-query-cache'
import type { KnowledgeMaintenanceItem, MaintenanceFeedbackStatus, MaintenanceFeedbackSummary, MaintenanceFeedbackStatusCounts } from '@shared/types/ipc'

interface MaintenanceFeedbackRow {
  signature: string
  status: MaintenanceFeedbackStatus
  snooze_until: number | null
  updated_at: number
}

interface MaintenanceFeedbackSummaryRow {
  status: MaintenanceFeedbackStatus
  updated_at: number
}

export interface RecordMaintenanceFeedbackParams {
  vaultPath: string
  item: KnowledgeMaintenanceItem
  status: MaintenanceFeedbackStatus
  snoozeUntil?: number | null
  now?: number
}

export interface RecordMaintenanceFeedbackResult {
  ok: true
  signature: string
  status: MaintenanceFeedbackStatus
  snoozeUntil: number | null
}

const MAINTENANCE_FEEDBACK_STATUSES = new Set<MaintenanceFeedbackStatus>([
  'done',
  'skipped',
  'snoozed',
  'not_relevant'
])

const DEFAULT_SNOOZE_SECONDS = 7 * 24 * 60 * 60

export function isMaintenanceFeedbackStatus(value: unknown): value is MaintenanceFeedbackStatus {
  return typeof value === 'string' && MAINTENANCE_FEEDBACK_STATUSES.has(value as MaintenanceFeedbackStatus)
}

export function createMaintenanceItemSignature(item: KnowledgeMaintenanceItem): string {
  return hashJson({
    type: item.type,
    filePath: item.filePath,
    title: item.title,
    action: item.action,
    detail: item.detail
  })
}

export function recordMaintenanceFeedback(params: RecordMaintenanceFeedbackParams): RecordMaintenanceFeedbackResult {
  if (!isMaintenanceFeedbackStatus(params.status)) {
    throw new Error(`Invalid maintenance feedback status: ${params.status}`)
  }

  const db = getDatabase(params.vaultPath)
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const signature = createMaintenanceItemSignature(params.item)
  const snoozeUntil = params.status === 'snoozed'
    ? normalizeSnoozeUntil(params.snoozeUntil, now)
    : null
  const existing = db
    .prepare('SELECT id FROM maintenance_feedback WHERE signature = ?')
    .get(signature) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE maintenance_feedback
      SET item_type = ?,
          file_path = ?,
          title = ?,
          action = ?,
          detail = ?,
          status = ?,
          snooze_until = ?,
          updated_at = ?
      WHERE signature = ?
    `).run(
      params.item.type,
      params.item.filePath,
      params.item.title,
      params.item.action,
      params.item.detail,
      params.status,
      snoozeUntil,
      now,
      signature
    )
  } else {
    db.prepare(`
      INSERT INTO maintenance_feedback
        (id, signature, item_type, file_path, title, action, detail, status, snooze_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      signature,
      params.item.type,
      params.item.filePath,
      params.item.title,
      params.item.action,
      params.item.detail,
      params.status,
      snoozeUntil,
      now,
      now
    )
  }

  invalidateMaintenanceFeedbackCache(params.vaultPath)
  return { ok: true, signature, status: params.status, snoozeUntil }
}

export function filterMaintenanceItemsByFeedback(
  vaultPath: string,
  items: KnowledgeMaintenanceItem[],
  now = Math.floor(Date.now() / 1000)
): KnowledgeMaintenanceItem[] {
  if (items.length === 0) return items
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT signature, status, snooze_until, updated_at
    FROM maintenance_feedback
  `).all() as MaintenanceFeedbackRow[]
  if (rows.length === 0) return items

  const feedbackBySignature = new Map(rows.map((row) => [row.signature, row]))
  return items.filter((item) => {
    const feedback = feedbackBySignature.get(createMaintenanceItemSignature(item))
    return !feedback || !isFeedbackActive(feedback, now)
  })
}

export function getMaintenanceFeedbackSignature(vaultPath: string): string {
  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT signature, status, snooze_until, updated_at
    FROM maintenance_feedback
    ORDER BY signature ASC
  `).all() as MaintenanceFeedbackRow[]
  return `${rows.length}:${hashJson(rows)}`
}

export function getMaintenanceFeedbackSummary(
  vaultPath: string,
  now = Math.floor(Date.now() / 1000)
): MaintenanceFeedbackSummary {
  const db = getDatabase(vaultPath)
  const last7Days = createEmptyStatusCounts()
  const last30Days = createEmptyStatusCounts()
  const sevenDayCutoff = now - 7 * 24 * 60 * 60
  const thirtyDayCutoff = now - 30 * 24 * 60 * 60
  const rows = db.prepare(`
    SELECT status, updated_at
    FROM maintenance_feedback
    WHERE updated_at >= ?
  `).all(thirtyDayCutoff) as MaintenanceFeedbackSummaryRow[]

  for (const row of rows) {
    if (!isMaintenanceFeedbackStatus(row.status)) continue
    last30Days[row.status] += 1
    if (row.updated_at >= sevenDayCutoff) last7Days[row.status] += 1
  }

  return { last7Days, last30Days, updatedAt: now }
}

function isFeedbackActive(row: MaintenanceFeedbackRow, now: number): boolean {
  if (row.status === 'snoozed') return typeof row.snooze_until === 'number' && row.snooze_until > now
  return row.status === 'done' || row.status === 'skipped' || row.status === 'not_relevant'
}

function createEmptyStatusCounts(): MaintenanceFeedbackStatusCounts {
  return {
    done: 0,
    skipped: 0,
    snoozed: 0,
    not_relevant: 0
  }
}

function normalizeSnoozeUntil(value: number | null | undefined, now: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > now) return Math.floor(value)
  return now + DEFAULT_SNOOZE_SECONDS
}

function invalidateMaintenanceFeedbackCache(vaultPath: string): void {
  invalidateVaultQueryCacheWhere(vaultPath, (key) => key.startsWith('maintenance-queue:'))
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
}
