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
import { getCachedVaultQuery } from '../db-query-cache'
import type { AppLanguage } from '@shared/types/ipc'

const MAINTENANCE_QUEUE_CACHE_TTL_MS = 60_000

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

export interface MaintenanceQueueParams {
  vaultPath: string
  query?: string
  type?: KnowledgeMaintenanceType
  limit?: number
  minCharacters?: number
  upcomingDays?: number
  requiredProperties?: string[]
  language?: AppLanguage
}

export interface MaintenanceQueueResult {
  items: KnowledgeMaintenanceItem[]
  total: number
  counts: Record<KnowledgeMaintenanceType, number>
}

export interface NormalizedMaintenanceQueueParams {
  vaultPath: string
  query: string
  type?: KnowledgeMaintenanceType
  limit: number
  minCharacters: number
  upcomingDays: number
  requiredProperties: string[]
  language: AppLanguage
  todayIso: string
}

export interface MaintenanceQueueCacheKeyInput extends NormalizedMaintenanceQueueParams {
  notes: Pick<NoteIndex, 'filePath' | 'updatedAt' | 'contentHash'>[]
  memorySignature?: string
}

function normalizeType(value: unknown): KnowledgeMaintenanceType | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim() as KnowledgeMaintenanceType
  return KNOWLEDGE_MAINTENANCE_TYPES.has(t) ? t : undefined
}

function normalizeMaintenanceQueueParams(params: MaintenanceQueueParams): NormalizedMaintenanceQueueParams {
  return {
    vaultPath: params.vaultPath,
    query: (params.query ?? '').trim().toLowerCase(),
    type: normalizeType(params.type),
    limit: Math.max(1, Math.min(params.limit ?? 200, 500)),
    language: params.language ?? getAppLanguage(),
    minCharacters: Math.max(1000, Math.floor(params.minCharacters ?? 8000)),
    upcomingDays: Math.min(30, Math.max(1, Math.floor(params.upcomingDays ?? 7))),
    requiredProperties: Array.isArray(params.requiredProperties)
      ? params.requiredProperties
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
      : [],
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
    `scan:${input.type ?? 'all'}`,
    `language:${input.language}`,
    `today:${input.todayIso}`,
    `query:${hashText(input.query.trim().toLowerCase())}`,
    `limit:${input.limit}`,
    `settings:${hashJson({
      minCharacters: input.minCharacters,
      upcomingDays: input.upcomingDays,
      requiredProperties
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
  const normalized = normalizeMaintenanceQueueParams(params)
  const notes = getAllNotes(normalized.vaultPath)
  const cacheKey = buildMaintenanceQueueCacheKey({
    ...normalized,
    notes,
    memorySignature: getMaintenanceMemorySignature(normalized.vaultPath)
  })

  return getCachedVaultQuery(
    normalized.vaultPath,
    cacheKey,
    () => gatherMaintenanceItemsUncached(normalized, notes),
    MAINTENANCE_QUEUE_CACHE_TTL_MS
  )
}

function gatherMaintenanceItemsUncached(params: NormalizedMaintenanceQueueParams, notes: NoteIndex[]): MaintenanceQueueResult {
  const {
    vaultPath,
    query,
    type,
    limit,
    language,
    minCharacters,
    upcomingDays,
    requiredProperties,
    todayIso
  } = params
  const propertyRows = getPropertyRows(vaultPath)
  const propertyRowsByPath = new Map(propertyRows.map((row) => [row.filePath, row.properties]))
  const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
  const tasks = getAllTasks(vaultPath)
  const taskIndex = indexTasksByPath(tasks, todayIso, upcomingDays)

  const emptyNotePaths = new Set<string>()
  const largeNoteCharactersByPath = new Map<string, number>()
  for (const note of notes) {
    try {
      const content = readFileSync(join(vaultPath, note.filePath), 'utf-8')
      if (isEmptyMarkdownNote(content)) emptyNotePaths.add(note.filePath)
      if (content.length >= minCharacters) largeNoteCharactersByPath.set(note.filePath, content.length)
    } catch {
      // Skip notes whose file can't be read; the index may be stale.
    }
  }

  const titleGroups = new Map<string, { title: string; filePaths: string[] }>()
  for (const note of notes) {
    const key = note.title.trim().toLowerCase()
    if (!key) continue
    const group = titleGroups.get(key) || { title: note.title, filePaths: [] }
    group.filePaths.push(note.filePath)
    titleGroups.set(key, group)
  }
  const duplicateTitleCountByPath = new Map<string, number>()
  for (const group of titleGroups.values()) {
    if (group.filePaths.length < 2) continue
    for (const filePath of group.filePaths) duplicateTitleCountByPath.set(filePath, group.filePaths.length)
  }

  const aliasGroups = new Map<string, { alias: string; filePaths: string[] }>()
  for (const row of propertyRows) {
    for (const alias of getPropertyTextValues(row.properties.aliases)) {
      const aliasKey = alias.toLowerCase()
      const group = aliasGroups.get(aliasKey) || { alias, filePaths: [] }
      group.filePaths.push(row.filePath)
      aliasGroups.set(aliasKey, group)
    }
  }
  const duplicateAliasesByPath = new Map<string, string[]>()
  for (const group of aliasGroups.values()) {
    if (group.filePaths.length < 2) continue
    for (const filePath of group.filePaths) {
      duplicateAliasesByPath.set(filePath, [...(duplicateAliasesByPath.get(filePath) || []), group.alias])
    }
  }

  const missingPropertiesByPath = new Map<string, string[]>()
  if (requiredProperties.length > 0) {
    for (const note of notes) {
      const properties = propertyRowsByPath.get(note.filePath) || {}
      const missing = requiredProperties.filter((key) => !hasNonEmptyProperty(properties, key))
      if (missing.length > 0) missingPropertiesByPath.set(note.filePath, missing)
    }
  }

  const bridges = findKnowledgeBridgeNotes({
    notes,
    outgoingLinksByNoteId,
    propertyRows,
    limit: Math.max(limit, 10)
  })

  const items = buildKnowledgeMaintenanceQueue({
    notes,
    outgoingLinksByNoteId,
    backlinkCountByNoteId: new Map(notes.map((note) => [note.id, getBacklinks(vaultPath, note.id).length])),
    unlinkedMentionCountByNoteId: new Map(notes.map((note) => [note.id, getUnlinkedMentions(vaultPath, note.id).length])),
    memoryStatusByNoteId: new Map(notes.flatMap<[string, 'missing' | 'stale']>((note) => {
      const memory = readMemory(vaultPath, note.id)
      if (!memory) return [[note.id, 'missing' as const]]
      if (memory.contentHash !== note.contentHash) return [[note.id, 'stale' as const]]
      return []
    })),
    duplicateTitleCountByPath,
    duplicateAliasesByPath,
    emptyNotePaths,
    largeNoteCharactersByPath,
    missingPropertiesByPath,
    openTaskCountByPath: taskIndex.openTaskCountByPath,
    elevatedTaskCountByPath: taskIndex.elevatedTaskCountByPath,
    overdueTaskInfoByPath: taskIndex.overdueTaskInfoByPath,
    dueTodayTaskInfoByPath: taskIndex.dueTodayTaskInfoByPath,
    highPriorityTaskInfoByPath: taskIndex.highPriorityTaskInfoByPath,
    scheduledTaskInfoByPath: taskIndex.scheduledTaskInfoByPath,
    startedTaskInfoByPath: taskIndex.startedTaskInfoByPath,
    blockedTaskInfoByPath: taskIndex.blockedTaskInfoByPath,
    recurringTaskInfoByPath: taskIndex.recurringTaskInfoByPath,
    upcomingTaskInfoByPath: taskIndex.upcomingTaskInfoByPath,
    bridges,
    query,
    type,
    limit,
    language
  })

  const counts = countByType(items)
  return { items, total: items.length, counts }
}

function countByType(items: KnowledgeMaintenanceItem[]): Record<KnowledgeMaintenanceType, number> {
  const counts = {} as Record<KnowledgeMaintenanceType, number>
  for (const t of KNOWLEDGE_MAINTENANCE_TYPES) counts[t] = 0
  for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1
  return counts
}
