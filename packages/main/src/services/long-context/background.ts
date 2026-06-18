import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { getDatabase } from '../database'
import { recordContextEvent, type LongContextEventType } from './context-events'
import { refreshRelationScores, type RelationRefreshResult } from './relation-store'
import { discoverLongContextRelations, getLongContextEntitySnapshot, type DiscoverLongContextRelationsResult } from './relation-discovery'
import { extractLongTermThemes, type ThemeExtractionResult, type ThemeExtractorProvider } from './theme-extractor'
import { generateCognitiveReview, type CognitiveReviewResult } from './cognitive-review'
import type { EntityType } from './relation-candidates'
import type { RelationClassifierProvider } from './relation-classifier'
import { runProactiveCycle } from '../proactive/proactive-orchestrator'
import { pruneExpired, deleteExpiredSuggestions } from '../proactive/proactive-store'
import { getAppLanguage } from '../app-language'
import { logger } from '../logger'
import type { AppLanguage } from '@shared/types/ipc'

export interface LongContextAnalysisJob {
  vaultPath: string
  entityType: EntityType
  entityId: string
  content?: string
  eventType?: LongContextEventType
  trigger?: string
  language?: AppLanguage
}

interface QueueState {
  pending: Map<string, LongContextAnalysisJob>
  timer: ReturnType<typeof setTimeout> | null
  running: boolean
  activeControllers: Set<AbortController>
}

export interface RunLongContextBackgroundCycleParams extends LongContextAnalysisJob {
  now?: number
  limit?: number
  recordEvent?: boolean
  forceThemeExtraction?: boolean
  forceReview?: boolean
  writeReview?: boolean
  reviewMinIntervalSeconds?: number
  relationProvider?: RelationClassifierProvider
  themeProvider?: ThemeExtractorProvider
  signal?: AbortSignal
}

export interface LongContextBackgroundCycleResult {
  eventRecorded: boolean
  discovery: DiscoverLongContextRelationsResult
  refresh: RelationRefreshResult
  themes: ThemeExtractionResult
  review?: CognitiveReviewResult
}

export interface RunVaultLongContextMaintenanceParams {
  vaultPath: string
  recentNoteLimit?: number
  now?: number
  relationProvider?: RelationClassifierProvider
  themeProvider?: ThemeExtractorProvider
  language?: AppLanguage
  signal?: AbortSignal
}

export interface VaultLongContextMaintenanceResult {
  analyzed: number
  review?: CognitiveReviewResult
}

const DEFAULT_DEBOUNCE_MS = 30_000
const DEFAULT_BATCH_LIMIT = 3
const DEFAULT_RECENT_NOTE_LIMIT = 3
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 86_400 * 1000
const THEME_MIN_INTERVAL_MS = HOUR_MS
const THEME_RELATION_EVENT_THRESHOLD = 3
const REVIEW_INTERVAL_MS = 7 * DAY_MS
const REVIEW_WINDOW_MS = 7 * DAY_MS

const queues = new Map<string, QueueState>()
const maintenanceTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleLongContextAnalysis(params: LongContextAnalysisJob): void {
  const queue = getQueue(params.vaultPath)
  queue.pending.set(`${params.entityType}:${params.entityId}`, params)
  if (queue.timer) clearTimeout(queue.timer)
  queue.timer = setTimeout(() => {
    queue.timer = null
    void drainLongContextQueue(params.vaultPath).catch((error) => {
      logger.warn('Long-context queue drain failed', {
        vaultPath: params.vaultPath,
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }, DEFAULT_DEBOUNCE_MS)
}

export function cancelLongContextAnalysis(vaultPath?: string): void {
  const targets = vaultPath ? [vaultPath] : Array.from(queues.keys())
  for (const target of targets) {
    const queue = queues.get(target)
    if (!queue) continue
    if (queue.timer) clearTimeout(queue.timer)
    for (const controller of queue.activeControllers) {
      controller.abort()
    }
    queue.pending.clear()
    queue.timer = null
    queue.activeControllers.clear()
    queues.delete(target)
  }
  const timerTargets = vaultPath ? [vaultPath] : Array.from(maintenanceTimers.keys())
  for (const target of timerTargets) {
    const timer = maintenanceTimers.get(target)
    if (timer) clearTimeout(timer)
    maintenanceTimers.delete(target)
  }
}

export function scheduleIndexedNoteLongContext(params: {
  vaultPath: string
  filePath: string
  eventType?: 'note_created' | 'note_updated'
  trigger?: string
  language?: AppLanguage
}): void {
  const note = getIndexedNote(params.vaultPath, params.filePath)
  if (!note) return
  const content = safeReadFile(params.filePath)
  scheduleLongContextAnalysis({
    vaultPath: params.vaultPath,
    entityType: 'note',
    entityId: note.id,
    content,
    eventType: params.eventType || 'note_updated',
    trigger: params.trigger || 'index',
    language: params.language
  })
}

export function scheduleVaultLongContextMaintenance(vaultPath: string): void {
  const existing = maintenanceTimers.get(vaultPath)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    maintenanceTimers.delete(vaultPath)
    const controller = new AbortController()
    const queue = getQueue(vaultPath)
    queue.activeControllers.add(controller)
    void runVaultLongContextMaintenance({ vaultPath, signal: controller.signal })
      .catch((error) => {
        if (!controller.signal.aborted) {
          logger.warn('Long-context maintenance failed', { vaultPath, error: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        queue.activeControllers.delete(controller)
      })
  }, DEFAULT_DEBOUNCE_MS)
  maintenanceTimers.set(vaultPath, timer)
}

export async function runVaultLongContextMaintenance(
  params: RunVaultLongContextMaintenanceParams
): Promise<VaultLongContextMaintenanceResult> {
  if (params.signal?.aborted) return { analyzed: 0 }
  const db = getDatabase(params.vaultPath)
  const limit = Math.max(1, Math.min(params.recentNoteLimit ?? DEFAULT_RECENT_NOTE_LIMIT, 10))
  const rows = db.prepare(`
    SELECT id, file_path as filePath
    FROM notes
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as { id: string; filePath: string }[]

  let analyzed = 0
  const language = params.language ?? getAppLanguage()
  for (const row of rows) {
    if (params.signal?.aborted) break
    const absolutePath = join(params.vaultPath, row.filePath)
    const result = await runLongContextBackgroundCycle({
      vaultPath: params.vaultPath,
      entityType: 'note',
      entityId: row.id,
      content: safeReadFile(absolutePath),
      trigger: 'vault_maintenance',
      recordEvent: false,
      now: params.now,
      relationProvider: params.relationProvider,
      themeProvider: params.themeProvider,
      language,
      signal: params.signal
    })
    if (result.eventRecorded || result.discovery.discovered > 0) analyzed += 1
  }

  if (params.signal?.aborted) return { analyzed }
  const review = maybeGenerateCognitiveReview({
    vaultPath: params.vaultPath,
    now: params.now ?? unixNow(),
    force: false,
    write: true,
    minIntervalMilliseconds: REVIEW_INTERVAL_MS
  })

  if (review?.filePath) {
    try {
      runProactiveCycle({
        vaultPath: params.vaultPath,
        entityType: 'vault',
        entityId: 'vault',
        trigger: 'cognitive_review_ready',
        now: params.now ?? unixNow(),
        context: { reviewFilePath: review.filePath, reviewTitle: review.title }
      })
    } catch {
      // ignore
    }
  }

  try {
    // Retention GC: expire stale pending/shown suggestions, then physically
    // delete long-settled ones. Previously pruneExpired was never called and
    // the table grew unbounded.
    pruneExpired(params.vaultPath, { now: params.now })
    deleteExpiredSuggestions(params.vaultPath, { now: params.now })
  } catch {
    // Retention GC must never break maintenance.
  }

  return { analyzed, review }
}

export async function runLongContextBackgroundCycle(
  params: RunLongContextBackgroundCycleParams
): Promise<LongContextBackgroundCycleResult> {
  if (params.signal?.aborted) return emptyBackgroundCycleResult()
  const db = getDatabase(params.vaultPath)
  const now = params.now ?? unixNow()
  const language = params.language ?? getAppLanguage()
  const snapshot = getLongContextEntitySnapshot(db, params.entityType, params.entityId, params.content)

  let eventRecorded = false
  if (snapshot && params.recordEvent !== false) {
    recordContextEvent({
      vaultPath: params.vaultPath,
      eventType: params.eventType || defaultEventType(params.entityType),
      entityType: params.entityType,
      entityId: params.entityId,
      entityTitle: snapshot.title,
      entityPath: snapshot.path,
      contentSnapshot: trimText(params.content || snapshot.content, 2000),
      metadata: { trigger: params.trigger || 'background' },
      createdAt: now
    })
    eventRecorded = true
  }

  if (params.signal?.aborted) return emptyBackgroundCycleResult(eventRecorded)
  const discovery = await discoverLongContextRelations({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    content: params.content,
    limit: params.limit || 10,
    provider: params.relationProvider,
    language,
    signal: params.signal
  })

  if (params.signal?.aborted) return emptyBackgroundCycleResult(eventRecorded, discovery)
  const refresh = refreshRelationScores({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    limit: 100,
    now
  })

  const themes = await maybeExtractThemes({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    now,
    force: Boolean(params.forceThemeExtraction),
    provider: params.themeProvider,
    language,
    signal: params.signal
  })

  if (params.signal?.aborted) {
    return { eventRecorded, discovery, refresh, themes }
  }
  const review = maybeGenerateCognitiveReview({
    vaultPath: params.vaultPath,
    now,
    force: Boolean(params.forceReview),
    write: params.writeReview !== false,
    minIntervalMilliseconds: resolveReviewMinIntervalMilliseconds(params.reviewMinIntervalSeconds)
  })

  if (params.entityType === 'note' && discovery.discovered > 0) {
    try {
      runProactiveCycle({
        vaultPath: params.vaultPath,
        entityType: 'note',
        entityId: params.entityId,
        trigger: 'long_context_high_score',
        now,
        context: params.content ? { content: params.content } : undefined
      })
    } catch {
      // Proactive evaluation must never break the background pipeline.
    }
  }

  if (review?.filePath) {
    try {
      runProactiveCycle({
        vaultPath: params.vaultPath,
        entityType: 'vault',
        entityId: 'vault',
        trigger: 'cognitive_review_ready',
        now,
        context: { reviewFilePath: review.filePath, reviewTitle: review.title }
      })
    } catch {
      // ignore
    }
  }

  return {
    eventRecorded,
    discovery,
    refresh,
    themes,
    review
  }
}

async function drainLongContextQueue(vaultPath: string): Promise<void> {
  const queue = getQueue(vaultPath)
  if (queue.running) return
  queue.running = true
  const controller = new AbortController()
  queue.activeControllers.add(controller)
  try {
    const jobs = Array.from(queue.pending.values()).slice(0, DEFAULT_BATCH_LIMIT)
    for (const job of jobs) {
      if (controller.signal.aborted) break
      queue.pending.delete(`${job.entityType}:${job.entityId}`)
      try {
        await runLongContextBackgroundCycle({ ...job, signal: controller.signal })
      } catch (error) {
        // Background analysis must never interrupt editing, saving, or chat.
        if (!controller.signal.aborted) {
          logger.warn('Long-context background analysis failed', {
            vaultPath,
            entityType: job.entityType,
            entityId: job.entityId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }
  } finally {
    queue.running = false
    queue.activeControllers.delete(controller)
    if (queue.pending.size > 0 && !queue.timer) {
      queue.timer = setTimeout(() => {
        queue.timer = null
        void drainLongContextQueue(vaultPath).catch((error) => {
          logger.warn('Long-context queue drain failed', {
            vaultPath,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      }, DEFAULT_DEBOUNCE_MS)
    }
  }
}

async function maybeExtractThemes(params: {
  vaultPath: string
  entityType: EntityType
  entityId: string
  now: number
  force: boolean
  provider?: ThemeExtractorProvider
  language: AppLanguage
  signal?: AbortSignal
}): Promise<ThemeExtractionResult> {
  if (params.signal?.aborted) return { created: 0, updated: 0 }
  if (!params.force && !shouldExtractThemes(params.vaultPath, params.now)) {
    return { created: 0, updated: 0 }
  }
  const result = await extractLongTermThemes({
    vaultPath: params.vaultPath,
    changedEntityIds: params.entityType === 'note' ? [params.entityId] : undefined,
    provider: params.provider,
    language: params.language,
    signal: params.signal
  })
  if (params.signal?.aborted) return result
  recordContextEvent({
    vaultPath: params.vaultPath,
    eventType: 'theme_extraction_run',
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: {
      trigger: 'background',
      created: result.created,
      updated: result.updated
    },
    createdAt: params.now
  })
  return result
}

function maybeGenerateCognitiveReview(params: {
  vaultPath: string
  now: number
  force: boolean
  write: boolean
  minIntervalMilliseconds: number
}): CognitiveReviewResult | undefined {
  if (!params.force && !shouldGenerateReview(params.vaultPath, params.now, params.minIntervalMilliseconds)) {
    return undefined
  }
  const result = generateCognitiveReview({
    vaultPath: params.vaultPath,
    since: params.now - REVIEW_WINDOW_MS,
    until: params.now,
    write: params.write
  })
  recordContextEvent({
    vaultPath: params.vaultPath,
    eventType: 'cognitive_review_generated',
    entityType: 'review',
    entityId: result.filePath || result.title,
    entityTitle: result.title,
    entityPath: result.filePath,
    metadata: {
      trigger: 'background',
      stats: result.stats
    },
    createdAt: params.now
  })
  return result
}

function shouldExtractThemes(vaultPath: string, now: number): boolean {
  const db = getDatabase(vaultPath)
  const lastRun = getLastEventAt(vaultPath, 'theme_extraction_run')
  if (lastRun && now - lastRun < THEME_MIN_INTERVAL_MS) return false
  const since = lastRun || now - DAY_MS
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM context_events
    WHERE event_type IN ('relation_created', 'relation_reinforced')
      AND created_at >= ?
  `).get(since) as { count: number }
  return row.count >= THEME_RELATION_EVENT_THRESHOLD
}

function shouldGenerateReview(vaultPath: string, now: number, minIntervalMilliseconds: number): boolean {
  const lastRun = getLastEventAt(vaultPath, 'cognitive_review_generated')
  if (lastRun && now - lastRun < minIntervalMilliseconds) return false
  const db = getDatabase(vaultPath)
  const since = now - REVIEW_WINDOW_MS
  const rows = [
    db.prepare('SELECT COUNT(*) as count FROM ai_relations WHERE created_at BETWEEN ? AND ?').get(since, now) as { count: number },
    db.prepare('SELECT COUNT(*) as count FROM long_term_themes WHERE updated_at BETWEEN ? AND ?').get(since, now) as { count: number },
    db.prepare(`
      SELECT COUNT(*) as count
      FROM context_events
      WHERE created_at BETWEEN ? AND ?
        AND event_type IN (
          'relation_created',
          'relation_reinforced',
          'theme_created',
          'theme_extraction_run',
          'ai_question_asked',
          'relation_feedback_submitted',
          'suggestion_opened'
        )
    `).get(since, now) as { count: number }
  ]
  return rows.some((row) => row.count > 0)
}

function getLastEventAt(vaultPath: string, eventType: LongContextEventType): number | null {
  const db = getDatabase(vaultPath)
  const row = db.prepare(`
    SELECT created_at as createdAt
    FROM context_events
    WHERE event_type = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(eventType) as { createdAt: number } | undefined
  return row?.createdAt ?? null
}

function resolveReviewMinIntervalMilliseconds(reviewMinIntervalSeconds?: number): number {
  if (typeof reviewMinIntervalSeconds !== 'number' || !Number.isFinite(reviewMinIntervalSeconds)) {
    return REVIEW_INTERVAL_MS
  }
  return Math.max(0, reviewMinIntervalSeconds * 1000)
}

function getQueue(vaultPath: string): QueueState {
  let queue = queues.get(vaultPath)
  if (!queue) {
    queue = { pending: new Map(), timer: null, running: false, activeControllers: new Set() }
    queues.set(vaultPath, queue)
  }
  return queue
}

function emptyBackgroundCycleResult(
  eventRecorded = false,
  discovery: DiscoverLongContextRelationsResult = { discovered: 0, suggestions: [] }
): LongContextBackgroundCycleResult {
  return {
    eventRecorded,
    discovery,
    refresh: { refreshed: 0, archived: 0 },
    themes: { created: 0, updated: 0 }
  }
}

function getIndexedNote(vaultPath: string, filePath: string): { id: string } | null {
  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const db = getDatabase(vaultPath)
  const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
  if (row) return row
  return {
    id: createHash('md5').update(relPath).digest('hex')
  }
}

function safeReadFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

function defaultEventType(entityType: EntityType): LongContextEventType {
  if (entityType === 'chat') return 'ai_question_asked'
  return 'note_updated'
}

function trimText(value: string, max: number): string {
  const normalized = value.trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
}

function unixNow(): number {
  return Date.now() // 返回毫秒时间戳
}
