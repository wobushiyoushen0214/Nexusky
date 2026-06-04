import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import {
  buildKnowledgeMaintenanceQueue,
  indexTasksByPath,
  type KnowledgeMaintenanceItem,
  type KnowledgeMaintenanceType
} from '../ai/maintenance-queue'
import { findKnowledgeBridgeNotes } from '../ai/graph-insights'
import { formatPropertyValue } from '../ai/search-results'
import {
  getAllNotes,
  getAllTasks,
  getBacklinks,
  getOutgoingLinks,
  getPropertyRows,
  getUnlinkedMentions,
  type NoteIndex
} from '../indexer'
import { readMemory } from '../memory'
import { getAppLanguage } from '../app-language'
import { getCachedVaultQueryWithStats } from '../db-query-cache'
import { logger } from '../logger'
import { filterMaintenanceItemsByFeedback, getMaintenanceFeedbackSignature } from './feedback'
import { isPathIgnoredByWorkflowRules, readMaintenanceWorkflowRules } from './workflow-rules'
import type { AppLanguage, MaintenanceScanGroup, MaintenanceScanStatus } from '@shared/types/ipc'

const MAINTENANCE_QUEUE_CACHE_TTL_MS = 60_000
const MAINTENANCE_QUEUE_SLOW_SCAN_MS = 1500
const MAINTENANCE_QUEUE_TIMEOUT_MS = 5000

const KNOWLEDGE_MAINTENANCE_TYPES = new Set<KnowledgeMaintenanceType>([
  'fix_unresolved_link',
  'review_overdue_tasks',
  'review_due_today_tasks',
  'review_high_priority_tasks',
  'review_scheduled_tasks',
  'review_started_tasks',
  'review_blocked_tasks',
  'review_recurring_tasks',
  'review_upcoming_tasks',
  'connect_orphan',
  'fill_empty_note',
  'resolve_duplicate_title',
  'resolve_duplicate_alias',
  'review_open_tasks',
  'link_unlinked_reference',
  'refresh_memory',
  'split_large_note',
  'fill_missing_property',
  'maintain_bridge'
])

const MAINTENANCE_SCAN_GROUPS: MaintenanceScanGroup[] = ['links', 'tasks', 'properties', 'memory', 'structure', 'bridge']

const KNOWLEDGE_MAINTENANCE_TYPES_BY_GROUP: Record<MaintenanceScanGroup, KnowledgeMaintenanceType[]> = {
  links: ['fix_unresolved_link', 'connect_orphan', 'link_unlinked_reference'],
  tasks: [
    'review_overdue_tasks',
    'review_due_today_tasks',
    'review_high_priority_tasks',
    'review_scheduled_tasks',
    'review_started_tasks',
    'review_blocked_tasks',
    'review_recurring_tasks',
    'review_upcoming_tasks',
    'review_open_tasks'
  ],
  properties: ['resolve_duplicate_alias', 'fill_missing_property'],
  memory: ['refresh_memory'],
  structure: ['fill_empty_note', 'resolve_duplicate_title', 'split_large_note'],
  bridge: ['maintain_bridge']
}

const KNOWLEDGE_MAINTENANCE_GROUP_BY_TYPE = new Map<KnowledgeMaintenanceType, MaintenanceScanGroup>(
  MAINTENANCE_SCAN_GROUPS.flatMap((group) =>
    KNOWLEDGE_MAINTENANCE_TYPES_BY_GROUP[group].map((type) => [type, group] as const)
  )
)

export interface MaintenanceQueueParams {
  vaultPath: string
  query?: string
  type?: KnowledgeMaintenanceType
  limit?: number
  minCharacters?: number
  upcomingDays?: number
  requiredProperties?: string[]
  scanGroups?: MaintenanceScanGroup[]
  language?: AppLanguage
}

export interface MaintenanceQueueResult {
  items: KnowledgeMaintenanceItem[]
  total: number
  counts: Record<KnowledgeMaintenanceType, number>
  scan: MaintenanceScanStatus
}

export interface NormalizedMaintenanceQueueParams {
  vaultPath: string
  query: string
  type?: KnowledgeMaintenanceType
  limit: number
  minCharacters: number
  upcomingDays: number
  requiredProperties: string[]
  ignorePaths: string[]
  workflowRulesSignature: string
  workflowRuleRequiredProperties: string[]
  scanGroups: MaintenanceScanGroup[]
  language: AppLanguage
  todayIso: string
}

export interface MaintenanceQueueCacheKeyInput extends NormalizedMaintenanceQueueParams {
  notes: Pick<NoteIndex, 'filePath' | 'updatedAt' | 'contentHash'>[]
  memorySignature?: string
  feedbackSignature?: string
}

function normalizeType(value: unknown): KnowledgeMaintenanceType | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim() as KnowledgeMaintenanceType
  return KNOWLEDGE_MAINTENANCE_TYPES.has(t) ? t : undefined
}

function normalizeScanGroup(value: unknown): MaintenanceScanGroup | undefined {
  if (typeof value !== 'string') return undefined
  const group = value.trim() as MaintenanceScanGroup
  return MAINTENANCE_SCAN_GROUPS.includes(group) ? group : undefined
}

function normalizeMaintenanceScanGroups(value: unknown, type?: KnowledgeMaintenanceType): MaintenanceScanGroup[] {
  const requested = Array.isArray(value)
    ? new Set(value.map(normalizeScanGroup).filter((group): group is MaintenanceScanGroup => Boolean(group)))
    : new Set<MaintenanceScanGroup>()

  if (requested.size > 0) {
    return MAINTENANCE_SCAN_GROUPS.filter((group) => requested.has(group))
  }

  const groupForType = type ? KNOWLEDGE_MAINTENANCE_GROUP_BY_TYPE.get(type) : undefined
  return groupForType ? [groupForType] : MAINTENANCE_SCAN_GROUPS
}

function getMaintenanceTypesForScanGroups(scanGroups: MaintenanceScanGroup[]): KnowledgeMaintenanceType[] {
  const enabled = new Set<KnowledgeMaintenanceType>()
  for (const group of scanGroups) {
    for (const type of KNOWLEDGE_MAINTENANCE_TYPES_BY_GROUP[group]) enabled.add(type)
  }
  return Array.from(enabled)
}

function getEnabledMaintenanceTypes(scanGroups: MaintenanceScanGroup[], type?: KnowledgeMaintenanceType): KnowledgeMaintenanceType[] {
  if (!type) return getMaintenanceTypesForScanGroups(scanGroups)
  const groupForType = KNOWLEDGE_MAINTENANCE_GROUP_BY_TYPE.get(type)
  return groupForType && scanGroups.includes(groupForType) ? [type] : []
}

function normalizeMaintenanceQueueParams(params: MaintenanceQueueParams): NormalizedMaintenanceQueueParams {
  const type = normalizeType(params.type)
  const workflowRules = readMaintenanceWorkflowRules(params.vaultPath)
  const requestedRequiredProperties = Array.isArray(params.requiredProperties)
    ? params.requiredProperties
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    : []
  const requiredProperties = Array.from(new Map(
    [...workflowRules.requiredProperties, ...requestedRequiredProperties].map((value) => [value.toLowerCase(), value] as const)
  ).values())
  return {
    vaultPath: params.vaultPath,
    query: (params.query ?? '').trim().toLowerCase(),
    type,
    limit: Math.max(1, Math.min(params.limit ?? 200, 500)),
    language: params.language ?? getAppLanguage(),
    minCharacters: Math.max(1000, Math.floor(params.minCharacters ?? workflowRules.minCharacters ?? 8000)),
    upcomingDays: Math.min(30, Math.max(1, Math.floor(params.upcomingDays ?? workflowRules.upcomingDays ?? 7))),
    requiredProperties,
    ignorePaths: workflowRules.ignorePaths,
    workflowRulesSignature: workflowRules.signature,
    workflowRuleRequiredProperties: workflowRules.requiredProperties,
    scanGroups: normalizeMaintenanceScanGroups(params.scanGroups, type),
    todayIso: localDateIso()
  }
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value))
}

function getVaultCacheId(vaultPath: string): string {
  return hashText(resolve(vaultPath).replace(/\\/g, '/').toLowerCase())
}

const maintenanceQueuePerfStats = {
  requests: 0,
  cacheHits: 0
}

function getMaintenanceScanTimeoutType(durationMs: number): 'none' | 'slow' | 'timeout' {
  if (durationMs >= MAINTENANCE_QUEUE_TIMEOUT_MS) return 'timeout'
  if (durationMs >= MAINTENANCE_QUEUE_SLOW_SCAN_MS) return 'slow'
  return 'none'
}

function recordMaintenanceQueuePerformance(input: {
  vaultPath: string
  cacheHit: boolean
  cacheDurationMs: number
  requestDurationMs: number
  scanDurationMs?: number
  notesCount: number
  itemCount: number
  type?: KnowledgeMaintenanceType
  scanGroups: MaintenanceScanGroup[]
  language: AppLanguage
  query: string
  limit: number
}): void {
  maintenanceQueuePerfStats.requests += 1
  if (input.cacheHit) maintenanceQueuePerfStats.cacheHits += 1
  const cacheHitRatio = maintenanceQueuePerfStats.requests === 0
    ? 0
    : Number((maintenanceQueuePerfStats.cacheHits / maintenanceQueuePerfStats.requests).toFixed(3))

  logger.info('Maintenance queue scan performance', {
    vaultId: getVaultCacheId(input.vaultPath),
    cacheHit: input.cacheHit,
    cacheHitRatio,
    cacheHits: maintenanceQueuePerfStats.cacheHits,
    cacheMisses: maintenanceQueuePerfStats.requests - maintenanceQueuePerfStats.cacheHits,
    requestDurationMs: Math.round(input.requestDurationMs),
    cacheDurationMs: Math.round(input.cacheDurationMs),
    scanDurationMs: typeof input.scanDurationMs === 'number' ? Math.round(input.scanDurationMs) : null,
    timeoutType: getMaintenanceScanTimeoutType(input.requestDurationMs),
    notesCount: input.notesCount,
    itemCount: input.itemCount,
    scanType: input.type ?? 'all',
    scanGroups: input.scanGroups,
    language: input.language,
    queryHash: hashText(input.query),
    queryLength: input.query.length,
    limit: input.limit
  })
}

function getNotesFileSignature(notes: Pick<NoteIndex, 'filePath' | 'updatedAt' | 'contentHash'>[]): string {
  const files = notes
    .map((note) => [note.filePath, note.updatedAt, note.contentHash || ''] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return `${files.length}:${hashJson(files)}`
}

function getMaintenanceMemorySignature(vaultPath: string): string {
  const dir = join(vaultPath, '.nexusky', 'memories')
  if (!existsSync(dir)) return '0:none'

  try {
    const files: Array<readonly [string, number, number]> = []
    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith('.json')) continue
      try {
        const stat = statSync(join(dir, fileName))
        files.push([fileName, Math.floor(stat.mtimeMs), stat.size] as const)
      } catch {
        // Ignore memory files that disappear while the key is being built.
      }
    }
    files.sort((a, b) => a[0].localeCompare(b[0]))
    return `${files.length}:${hashJson(files)}`
  } catch {
    return 'unknown'
  }
}

export function buildMaintenanceQueueCacheKey(input: MaintenanceQueueCacheKeyInput): string {
  const requiredProperties = input.requiredProperties.map((value) => value.trim()).filter(Boolean)
  return [
    'maintenance-queue:v1',
    `vault:${getVaultCacheId(input.vaultPath)}`,
    `files:${getNotesFileSignature(input.notes)}`,
    `memory:${input.memorySignature ?? getMaintenanceMemorySignature(input.vaultPath)}`,
    `feedback:${input.feedbackSignature ?? getMaintenanceFeedbackSignature(input.vaultPath)}`,
    `workflowRules:${input.workflowRulesSignature}`,
    `scan:${input.type ?? 'all'}`,
    `groups:${input.scanGroups.join(',')}`,
    `language:${input.language}`,
    `today:${input.todayIso}`,
    `query:${hashText(input.query.trim().toLowerCase())}`,
    `limit:${input.limit}`,
    `settings:${hashJson({
      minCharacters: input.minCharacters,
      upcomingDays: input.upcomingDays,
      requiredProperties,
      ignorePaths: input.ignorePaths
    })}`
  ].join('|')
}

function getPropertyTextValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.map((item) => formatPropertyValue(item).trim()).filter((item) => item.length > 0)
}

function hasNonEmptyProperty(properties: Record<string, unknown>, key: string): boolean {
  const matchedKey = Object.keys(properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
  if (!matchedKey) return false
  return getPropertyTextValues(properties[matchedKey]).length > 0
}

function isEmptyMarkdownNote(content: string): boolean {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return withoutFrontmatter
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+.+$/gm, '')
    .trim().length === 0
}

function localDateIso(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function gatherMaintenanceItems(params: MaintenanceQueueParams): MaintenanceQueueResult {
  const requestStartedAt = Date.now()
  const normalized = normalizeMaintenanceQueueParams(params)
  const notes = getAllNotes(normalized.vaultPath)
  const cacheKey = buildMaintenanceQueueCacheKey({
    ...normalized,
    notes,
    memorySignature: getMaintenanceMemorySignature(normalized.vaultPath),
    feedbackSignature: getMaintenanceFeedbackSignature(normalized.vaultPath)
  })

  try {
    const cached = getCachedVaultQueryWithStats(
      normalized.vaultPath,
      cacheKey,
      () => gatherMaintenanceItemsUncached(normalized, notes),
      MAINTENANCE_QUEUE_CACHE_TTL_MS
    )
    recordMaintenanceQueuePerformance({
      vaultPath: normalized.vaultPath,
      cacheHit: cached.cacheHit,
      cacheDurationMs: cached.durationMs,
      requestDurationMs: Date.now() - requestStartedAt,
      scanDurationMs: cached.value.scan.durationMs,
      notesCount: notes.length,
      itemCount: cached.value.total,
      type: normalized.type,
      scanGroups: normalized.scanGroups,
      language: normalized.language,
      query: normalized.query,
      limit: normalized.limit
    })
    return cached.value
  } catch (error) {
    const requestDurationMs = Date.now() - requestStartedAt
    logger.warn('Maintenance queue scan failed', {
      vaultId: getVaultCacheId(normalized.vaultPath),
      requestDurationMs: Math.round(requestDurationMs),
      timeoutType: getMaintenanceScanTimeoutType(requestDurationMs),
      notesCount: notes.length,
      scanType: normalized.type ?? 'all',
      scanGroups: normalized.scanGroups,
      language: normalized.language,
      queryHash: hashText(normalized.query),
      queryLength: normalized.query.length,
      limit: normalized.limit,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

function gatherMaintenanceItemsUncached(params: NormalizedMaintenanceQueueParams, notes: NoteIndex[]): MaintenanceQueueResult {
  const startedAt = Date.now()
  const {
    vaultPath,
    query,
    type,
    limit,
    language,
    minCharacters,
    upcomingDays,
    requiredProperties,
    ignorePaths,
    workflowRuleRequiredProperties,
    scanGroups,
    todayIso
  } = params
  const scanGroupSet = new Set(scanGroups)
  const enabledTypes = getEnabledMaintenanceTypes(scanGroups, type)
  const candidateNotes = ignorePaths.length > 0
    ? notes.filter((note) => !isPathIgnoredByWorkflowRules(note.filePath, ignorePaths))
    : notes
  const candidateNotePaths = new Set(candidateNotes.map((note) => note.filePath))
  const needsLinks = scanGroupSet.has('links')
  const needsTasks = scanGroupSet.has('tasks')
  const needsProperties = scanGroupSet.has('properties')
  const needsMemory = scanGroupSet.has('memory')
  const needsStructure = scanGroupSet.has('structure')
  const needsBridge = scanGroupSet.has('bridge')
  const needsOutgoingLinks = needsLinks || needsBridge
  const needsPropertyRows = needsProperties || needsBridge

  const propertyRows = needsPropertyRows ? getPropertyRows(vaultPath) : []
  const scopedPropertyRows = candidateNotePaths.size === notes.length
    ? propertyRows
    : propertyRows.filter((row) => candidateNotePaths.has(row.filePath))
  const propertyRowsByPath = needsProperties
    ? new Map(scopedPropertyRows.map((row) => [row.filePath, row.properties]))
    : new Map<string, Record<string, unknown>>()
  const outgoingLinksByNoteId: Map<string, ReturnType<typeof getOutgoingLinks>> = needsOutgoingLinks
    ? new Map(candidateNotes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
    : new Map()
  const taskIndex = needsTasks
    ? indexTasksByPath(getAllTasks(vaultPath), todayIso, upcomingDays)
    : null

  const emptyNotePaths = new Set<string>()
  const largeNoteCharactersByPath = new Map<string, number>()
  if (needsStructure) {
    for (const note of candidateNotes) {
      try {
        const content = readFileSync(join(vaultPath, note.filePath), 'utf-8')
        if (isEmptyMarkdownNote(content)) emptyNotePaths.add(note.filePath)
        if (content.length >= minCharacters) largeNoteCharactersByPath.set(note.filePath, content.length)
      } catch {
        // Skip notes whose file can't be read; the index may be stale.
      }
    }
  }

  const titleGroups = new Map<string, { title: string; filePaths: string[] }>()
  if (needsStructure) {
    for (const note of candidateNotes) {
      const key = note.title.trim().toLowerCase()
      if (!key) continue
      const group = titleGroups.get(key) || { title: note.title, filePaths: [] }
      group.filePaths.push(note.filePath)
      titleGroups.set(key, group)
    }
  }
  const duplicateTitleCountByPath = new Map<string, number>()
  if (needsStructure) {
    for (const group of titleGroups.values()) {
      if (group.filePaths.length < 2) continue
      for (const filePath of group.filePaths) duplicateTitleCountByPath.set(filePath, group.filePaths.length)
    }
  }

  const aliasGroups = new Map<string, { alias: string; filePaths: string[] }>()
  if (needsProperties) {
    for (const row of scopedPropertyRows) {
      for (const alias of getPropertyTextValues(row.properties.aliases)) {
        const aliasKey = alias.toLowerCase()
        const group = aliasGroups.get(aliasKey) || { alias, filePaths: [] }
        group.filePaths.push(row.filePath)
        aliasGroups.set(aliasKey, group)
      }
    }
  }
  const duplicateAliasesByPath = new Map<string, string[]>()
  if (needsProperties) {
    for (const group of aliasGroups.values()) {
      if (group.filePaths.length < 2) continue
      for (const filePath of group.filePaths) {
        duplicateAliasesByPath.set(filePath, [...(duplicateAliasesByPath.get(filePath) || []), group.alias])
      }
    }
  }

  const missingPropertiesByPath = new Map<string, string[]>()
  if (needsProperties && requiredProperties.length > 0) {
    for (const note of candidateNotes) {
      const properties = propertyRowsByPath.get(note.filePath) || {}
      const missing = requiredProperties.filter((key) => !hasNonEmptyProperty(properties, key))
      if (missing.length > 0) missingPropertiesByPath.set(note.filePath, missing)
    }
  }

  const bridges = needsBridge
    ? findKnowledgeBridgeNotes({
      notes: candidateNotes,
      outgoingLinksByNoteId,
      propertyRows: scopedPropertyRows,
      limit: Math.max(limit, 10)
    })
    : []

  const rawLimit = Math.min(500, Math.max(limit, limit * 3))
  const rawItems = buildKnowledgeMaintenanceQueue({
    notes: candidateNotes,
    outgoingLinksByNoteId,
    backlinkCountByNoteId: needsLinks
      ? new Map(candidateNotes.map((note) => [note.id, getBacklinks(vaultPath, note.id).length]))
      : new Map(),
    unlinkedMentionCountByNoteId: needsLinks
      ? new Map(candidateNotes.map((note) => [note.id, getUnlinkedMentions(vaultPath, note.id).length]))
      : new Map(),
    memoryStatusByNoteId: needsMemory
      ? new Map(candidateNotes.flatMap<[string, 'missing' | 'stale']>((note) => {
        const memory = readMemory(vaultPath, note.id)
        if (!memory) return [[note.id, 'missing' as const]]
        if (memory.contentHash !== note.contentHash) return [[note.id, 'stale' as const]]
        return []
      }))
      : undefined,
    duplicateTitleCountByPath,
    duplicateAliasesByPath,
    emptyNotePaths,
    largeNoteCharactersByPath,
    missingPropertiesByPath,
    missingPropertySource: workflowRuleRequiredProperties.length > 0 ? 'workflow_rules' : 'request',
    openTaskCountByPath: taskIndex?.openTaskCountByPath,
    elevatedTaskCountByPath: taskIndex?.elevatedTaskCountByPath,
    overdueTaskInfoByPath: taskIndex?.overdueTaskInfoByPath,
    dueTodayTaskInfoByPath: taskIndex?.dueTodayTaskInfoByPath,
    highPriorityTaskInfoByPath: taskIndex?.highPriorityTaskInfoByPath,
    scheduledTaskInfoByPath: taskIndex?.scheduledTaskInfoByPath,
    startedTaskInfoByPath: taskIndex?.startedTaskInfoByPath,
    blockedTaskInfoByPath: taskIndex?.blockedTaskInfoByPath,
    recurringTaskInfoByPath: taskIndex?.recurringTaskInfoByPath,
    upcomingTaskInfoByPath: taskIndex?.upcomingTaskInfoByPath,
    bridges,
    enabledTypes,
    query,
    type,
    limit: rawLimit,
    language
  })
  const items = filterMaintenanceItemsByFeedback(vaultPath, rawItems).slice(0, limit)

  const counts = countByType(items)
  const finishedAt = Date.now()
  return {
    items,
    total: items.length,
    counts,
    scan: {
      state: 'complete',
      completedTypes: enabledTypes,
      pendingTypes: [],
      completedGroups: scanGroups,
      pendingGroups: [],
      updatedAt: finishedAt,
      durationMs: finishedAt - startedAt
    }
  }
}

function countByType(items: KnowledgeMaintenanceItem[]): Record<KnowledgeMaintenanceType, number> {
  const counts = {} as Record<KnowledgeMaintenanceType, number>
  for (const t of KNOWLEDGE_MAINTENANCE_TYPES) counts[t] = 0
  for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1
  return counts
}
