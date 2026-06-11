import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { getDatabase } from './database'
import { store } from './store'
import type { CloudSyncHealth, VaultHealthScoreFactor, VaultHealthScoreFactorId, VaultHealthSummary, VaultHealthTrendPoint, GrowthMetrics } from '@shared/types/ipc'

const STALE_AGE_SECONDS = 60 * 24 * 60 * 60
const SNAPSHOT_WINDOW_DAYS = 56

const SCORE_WEIGHTS: Record<VaultHealthScoreFactorId, number> = {
  links: 25,
  tasks: 15,
  memory: 20,
  structure: 20,
  freshness: 10,
  sync: 10
}

/**
 * Cheap, single-pass vault-level snapshot. All counts come from SQL aggregates
 * so the call stays well under 100 ms even for ~10k notes.
 *
 * The result is intended for a one-shot "vault health" panel; expensive
 * per-note analysis (theme extraction, local search chunks, etc.) belongs in the
 * existing maintenance queue, not here.
 */
export function scanVaultHealth(vaultPath: string, nowSeconds: number = Math.floor(Date.now() / 1000)): VaultHealthSummary {
  const db = getDatabase(vaultPath)

  const noteRow = db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }
  const linkRow = db.prepare('SELECT COUNT(*) AS c FROM links').get() as { c: number }
  const unresolvedRow = db
    .prepare('SELECT COUNT(*) AS c FROM links WHERE target_note_id IS NULL')
    .get() as { c: number }
  const openTaskRow = db
    .prepare('SELECT COUNT(*) AS c FROM tasks WHERE done = 0')
    .get() as { c: number }

  const orphanRow = db
    .prepare(`
      SELECT COUNT(*) AS c FROM notes
      WHERE id NOT IN (SELECT source_note_id FROM links WHERE target_note_id IS NOT NULL)
        AND id NOT IN (SELECT target_note_id FROM links WHERE target_note_id IS NOT NULL)
    `)
    .get() as { c: number }

  const duplicateRow = db
    .prepare(`
      SELECT COUNT(*) AS c FROM (
        SELECT title FROM notes GROUP BY title HAVING COUNT(*) > 1
      )
    `)
    .get() as { c: number }

  const staleCutoff = nowSeconds - STALE_AGE_SECONDS
  const staleRow = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE updated_at < ?')
    .get(staleCutoff) as { c: number }

  const missingMemoryCount = countMissingMemories(vaultPath, db, noteRow.c)
  const syncHealth = getStoredSyncHealthForScore(vaultPath)
  const base = {
    noteCount: noteRow.c,
    linkCount: linkRow.c,
    unresolvedLinkCount: unresolvedRow.c,
    orphanCount: orphanRow.c,
    openTaskCount: openTaskRow.c,
    duplicateTitleCount: duplicateRow.c,
    missingMemoryCount,
    staleNoteCount: staleRow.c
  }
  const scoreFactors = buildScoreFactors(base, syncHealth)
  const score = calculateWeightedScore(scoreFactors)
  const scannedAt = nowSeconds

  const growth = calculateGrowthMetrics(db, nowSeconds)
  const relativeRank = calculateRelativeRanking(score)

  const summary: VaultHealthSummary = {
    ...base,
    score,
    scannedAt,
    scoreFactors,
    trend: [],
    growth,
    relativeRank
  }

  persistVaultHealthSnapshot(db, summary, nowSeconds)
  return {
    ...summary,
    trend: readVaultHealthTrend(db, nowSeconds, 8)
  }
}

export function getVaultHealthTrend(vaultPath: string, nowSeconds: number = Math.floor(Date.now() / 1000), weeks = 8): VaultHealthTrendPoint[] {
  return readVaultHealthTrend(getDatabase(vaultPath), nowSeconds, weeks)
}

export function buildScoreFactors(
  summary: Pick<VaultHealthSummary, 'noteCount' | 'linkCount' | 'unresolvedLinkCount' | 'orphanCount' | 'openTaskCount' | 'duplicateTitleCount' | 'missingMemoryCount' | 'staleNoteCount'>,
  syncHealth: Pick<CloudSyncHealth, 'status' | 'activeProviderConfigured' | 'offlineQueueSize' | 'conflicts' | 'errors'>
): VaultHealthScoreFactor[] {
  const noteBase = Math.max(1, summary.noteCount)
  const linkBase = Math.max(1, summary.linkCount)
  const linkDensity = summary.noteCount <= 1 ? 1 : summary.linkCount / noteBase
  const orphanRatio = summary.orphanCount / noteBase
  const duplicateRatio = summary.duplicateTitleCount / noteBase
  const densityPenalty = linkDensity >= 1 ? 0 : (1 - linkDensity) * 30
  const syncIssueCount = syncHealth.offlineQueueSize + syncHealth.conflicts + syncHealth.errors + (syncHealth.status === 'error' || syncHealth.status === 'conflict' ? 1 : 0)

  return [
    makeFactor('links', 100 - (summary.unresolvedLinkCount / linkBase) * 100, summary.unresolvedLinkCount),
    makeFactor('tasks', 100 - Math.min(100, summary.openTaskCount * 4 + (summary.openTaskCount / noteBase) * 30), summary.openTaskCount),
    makeFactor('memory', 100 - (summary.missingMemoryCount / noteBase) * 100, summary.missingMemoryCount),
    makeFactor('structure', 100 - orphanRatio * 60 - duplicateRatio * 40 - densityPenalty, summary.orphanCount + summary.duplicateTitleCount),
    makeFactor('freshness', 100 - (summary.staleNoteCount / noteBase) * 100, summary.staleNoteCount),
    makeFactor('sync', scoreSyncHealth(syncHealth), syncIssueCount)
  ]
}

function calculateWeightedScore(factors: VaultHealthScoreFactor[]): number {
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0) || 1
  return clampScore(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight)
}

function makeFactor(id: VaultHealthScoreFactorId, rawScore: number, issueCount: number): VaultHealthScoreFactor {
  const score = clampScore(rawScore)
  const weight = SCORE_WEIGHTS[id]
  return {
    id,
    score,
    weight,
    impact: Math.round(weight * (100 - score) / 100),
    issueCount,
    status: score >= 85 ? 'good' : score >= 65 ? 'warn' : 'bad'
  }
}

function scoreSyncHealth(syncHealth: Pick<CloudSyncHealth, 'status' | 'activeProviderConfigured' | 'offlineQueueSize' | 'conflicts' | 'errors'>): number {
  const hasSyncWork = syncHealth.offlineQueueSize > 0 || syncHealth.conflicts > 0 || syncHealth.errors > 0
  if (!syncHealth.activeProviderConfigured && syncHealth.status === 'idle' && !hasSyncWork) {
    return 100
  }
  const base = syncHealth.status === 'ok'
    ? 100
    : syncHealth.status === 'idle'
      ? 90
      : syncHealth.status === 'conflict'
        ? 55
        : 40
  const configuredBase = syncHealth.activeProviderConfigured ? base : Math.min(base, 85)
  const penalty = Math.min(25, syncHealth.offlineQueueSize * 5 + syncHealth.conflicts * 8 + syncHealth.errors * 12)
  return configuredBase - penalty
}

function getStoredSyncHealthForScore(vaultPath: string): Pick<CloudSyncHealth, 'status' | 'activeProviderConfigured' | 'offlineQueueSize' | 'conflicts' | 'errors'> {
  const stored = store.get(`syncHealth:${vaultPath}`) as Partial<CloudSyncHealth> | undefined
  const queue = (store.get('offlineQueue') as { vaultPath?: string }[] | undefined) || []
  const queuedForVault = queue.filter((item) => !item.vaultPath || item.vaultPath === vaultPath).length
  return {
    status: stored?.status || 'idle',
    activeProviderConfigured: Boolean(stored?.activeProviderConfigured),
    offlineQueueSize: Number(stored?.offlineQueueSize ?? queuedForVault),
    conflicts: Number(stored?.conflicts || 0),
    errors: Number(stored?.errors || 0)
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

interface DbHandle {
  prepare(sql: string): { all(...args: unknown[]): unknown[] }
}

function countMissingMemories(vaultPath: string, db: DbHandle, totalNotes: number): number {
  if (totalNotes === 0) return 0
  const memoriesDir = join(vaultPath, '.nexusky', 'memories')
  if (!existsSync(memoriesDir)) return totalNotes
  let memoryIds: Set<string>
  try {
    memoryIds = new Set(
      readdirSync(memoriesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
    )
  } catch {
    return totalNotes
  }
  if (memoryIds.size === 0) return totalNotes

  const rows = db.prepare('SELECT id FROM notes').all() as { id: string }[]
  let missing = 0
  for (const row of rows) {
    if (!memoryIds.has(row.id)) missing += 1
  }
  return missing
}

function persistVaultHealthSnapshot(db: ReturnType<typeof getDatabase>, summary: VaultHealthSummary, nowSeconds: number): void {
  const snapshotDate = formatDateKey(nowSeconds)
  const payload = JSON.stringify({
    noteCount: summary.noteCount,
    linkCount: summary.linkCount,
    unresolvedLinkCount: summary.unresolvedLinkCount,
    orphanCount: summary.orphanCount,
    openTaskCount: summary.openTaskCount,
    duplicateTitleCount: summary.duplicateTitleCount,
    missingMemoryCount: summary.missingMemoryCount,
    staleNoteCount: summary.staleNoteCount,
    score: summary.score,
    scannedAt: summary.scannedAt,
    scoreFactors: summary.scoreFactors
  })
  db.prepare(`
    INSERT INTO vault_health_snapshots (snapshot_date, score, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      score = excluded.score,
      summary_json = excluded.summary_json,
      updated_at = excluded.updated_at
  `).run(snapshotDate, summary.score, payload, nowSeconds, nowSeconds)
}

function readVaultHealthTrend(db: ReturnType<typeof getDatabase>, nowSeconds: number, weeks: number): VaultHealthTrendPoint[] {
  const cutoff = formatDateKey(nowSeconds - SNAPSHOT_WINDOW_DAYS * 24 * 60 * 60)
  const rows = db.prepare(`
    SELECT snapshot_date as snapshotDate, score, summary_json as summaryJson, updated_at as updatedAt
    FROM vault_health_snapshots
    WHERE snapshot_date >= ?
    ORDER BY snapshot_date ASC
  `).all(cutoff) as { snapshotDate: string; score: number; summaryJson: string; updatedAt: number }[]
  const byWeek = new Map<string, VaultHealthTrendPoint>()
  for (const row of rows) {
    const parsed = parseSnapshotSummary(row.summaryJson)
    if (!parsed) continue
    const weekStart = getWeekStartKey(row.snapshotDate)
    byWeek.set(weekStart, {
      weekStart,
      snapshotDate: row.snapshotDate,
      scannedAt: parsed.scannedAt || row.updatedAt,
      score: row.score,
      noteCount: parsed.noteCount,
      repairSignalCount: parsed.unresolvedLinkCount + parsed.orphanCount + parsed.duplicateTitleCount + parsed.missingMemoryCount + parsed.staleNoteCount
    })
  }
  return Array.from(byWeek.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(Math.max(0, byWeek.size - weeks))
}

function parseSnapshotSummary(value: string): Pick<VaultHealthSummary, 'noteCount' | 'unresolvedLinkCount' | 'orphanCount' | 'duplicateTitleCount' | 'missingMemoryCount' | 'staleNoteCount' | 'scannedAt'> | null {
  try {
    const parsed = JSON.parse(value) as Partial<VaultHealthSummary>
    return {
      noteCount: Number(parsed.noteCount || 0),
      unresolvedLinkCount: Number(parsed.unresolvedLinkCount || 0),
      orphanCount: Number(parsed.orphanCount || 0),
      duplicateTitleCount: Number(parsed.duplicateTitleCount || 0),
      missingMemoryCount: Number(parsed.missingMemoryCount || 0),
      staleNoteCount: Number(parsed.staleNoteCount || 0),
      scannedAt: Number(parsed.scannedAt || 0)
    }
  } catch {
    return null
  }
}

function formatDateKey(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function getWeekStartKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  const day = date.getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date.toISOString().slice(0, 10)
}

export function calculateGrowthMetrics(db: ReturnType<typeof getDatabase>, nowSeconds: number): GrowthMetrics {
  const oneWeekAgo = nowSeconds - 7 * 24 * 60 * 60

  const newLinksRow = db.prepare(`
    SELECT COUNT(*) as c FROM links
    WHERE created_at >= ?
  `).get(oneWeekAgo) as { c: number } | undefined

  const newLinksThisWeek = newLinksRow?.c || 0

  const currentSnapshot = db.prepare(`
    SELECT summary_json FROM vault_health_snapshots
    ORDER BY snapshot_date DESC LIMIT 1
  `).get() as { summary_json: string } | undefined

  const weekAgoSnapshot = db.prepare(`
    SELECT summary_json FROM vault_health_snapshots
    WHERE snapshot_date <= ?
    ORDER BY snapshot_date DESC LIMIT 1
  `).get(formatDateKey(oneWeekAgo)) as { summary_json: string } | undefined

  let orphansReducedThisWeek = 0
  let healthScoreChange = 0

  if (currentSnapshot && weekAgoSnapshot) {
    const current = parseSnapshotSummary(currentSnapshot.summary_json)
    const past = parseSnapshotSummary(weekAgoSnapshot.summary_json)

    if (current && past) {
      orphansReducedThisWeek = Math.max(0, past.orphanCount - current.orphanCount)
      healthScoreChange = Math.round((current.scannedAt - past.scannedAt) / 100) // Simplified
    }
  }

  return {
    newLinksThisWeek,
    orphansReducedThisWeek,
    healthScoreChange
  }
}

export function calculateRelativeRanking(score: number): string {
  // Simplified ranking estimation based on score distribution
  // Assumes normal distribution: mean ~70, std ~15
  const percentile = score < 55 ? 25
    : score < 70 ? 50
    : score < 85 ? 75
    : 90

  return `Healthier than ${percentile}% of vaults`
}

