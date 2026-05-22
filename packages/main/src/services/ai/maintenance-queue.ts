import type { OutgoingLinkIndex } from '../indexer'
import type { KnowledgeBridgeNoteResult } from './graph-insights'

export interface KnowledgeMaintenanceNote {
  id: string
  title: string
  filePath: string
  updatedAt: number
}

export interface KnowledgeMaintenanceItem {
  type: KnowledgeMaintenanceType
  title: string
  filePath: string
  priority: number
  action: string
  reason: string
  detail: string
}

export type KnowledgeMaintenanceType = 'fix_unresolved_link' | 'review_overdue_tasks' | 'review_due_today_tasks' | 'review_high_priority_tasks' | 'review_scheduled_tasks' | 'review_started_tasks' | 'review_blocked_tasks' | 'review_recurring_tasks' | 'review_upcoming_tasks' | 'connect_orphan' | 'fill_empty_note' | 'resolve_duplicate_title' | 'resolve_duplicate_alias' | 'review_open_tasks' | 'link_unlinked_reference' | 'refresh_memory' | 'split_large_note' | 'fill_missing_property' | 'maintain_bridge'

export interface KnowledgeMaintenanceTask {
  text: string
  done: boolean
  filePath: string
}

export interface DueTaskInfo {
  count: number
  earliestDue: string
}

export type OverdueTaskInfo = DueTaskInfo

export interface HighPriorityTaskInfo {
  count: number
  highestPriority: 'highest' | 'high'
}

export interface BlockedTaskInfo {
  count: number
  signal: string
}

export interface RecurringTaskInfo {
  count: number
  signal: string
}

interface KnowledgeMaintenanceQueueOptions {
  notes: KnowledgeMaintenanceNote[]
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>
  backlinkCountByNoteId: Map<string, number>
  unlinkedMentionCountByNoteId: Map<string, number>
  memoryStatusByNoteId?: Map<string, 'missing' | 'stale'>
  duplicateTitleCountByPath?: Map<string, number>
  duplicateAliasesByPath?: Map<string, string[]>
  emptyNotePaths?: Set<string>
  largeNoteCharactersByPath?: Map<string, number>
  missingPropertiesByPath?: Map<string, string[]>
  openTaskCountByPath?: Map<string, number>
  elevatedTaskCountByPath?: Map<string, number>
  overdueTaskCountByPath?: Map<string, number>
  overdueTaskInfoByPath?: Map<string, DueTaskInfo>
  dueTodayTaskInfoByPath?: Map<string, DueTaskInfo>
  highPriorityTaskInfoByPath?: Map<string, HighPriorityTaskInfo>
  scheduledTaskInfoByPath?: Map<string, DueTaskInfo>
  startedTaskInfoByPath?: Map<string, DueTaskInfo>
  blockedTaskInfoByPath?: Map<string, BlockedTaskInfo>
  recurringTaskInfoByPath?: Map<string, RecurringTaskInfo>
  upcomingTaskInfoByPath?: Map<string, DueTaskInfo>
  bridges: KnowledgeBridgeNoteResult[]
  query?: string
  type?: KnowledgeMaintenanceType
  limit?: number
}

export function buildKnowledgeMaintenanceQueue(options: KnowledgeMaintenanceQueueOptions): KnowledgeMaintenanceItem[] {
  const limit = Math.max(1, Math.floor(options.limit || 5))
  const items: KnowledgeMaintenanceItem[] = []
  const query = (options.query || '').trim().toLowerCase()
  const type = options.type
  const bridgeByPath = new Map(options.bridges.map((bridge) => [bridge.filePath, bridge]))

  for (const note of options.notes) {
    const outgoing = options.outgoingLinksByNoteId.get(note.id) || []
    const resolvedOutgoing = outgoing.filter((link) => link.resolved).length
    const backlinkCount = options.backlinkCountByNoteId.get(note.id) || 0
    const unlinkedMentionCount = options.unlinkedMentionCountByNoteId.get(note.id) || 0
    const memoryStatus = options.memoryStatusByNoteId?.get(note.id)
    const duplicateTitleCount = options.duplicateTitleCountByPath?.get(note.filePath) || 0
    const duplicateAliases = options.duplicateAliasesByPath?.get(note.filePath) || []
    const isEmpty = options.emptyNotePaths?.has(note.filePath) || false
    const largeCharacters = options.largeNoteCharactersByPath?.get(note.filePath) || 0
    const missingProperties = options.missingPropertiesByPath?.get(note.filePath) || []
    const openTaskCount = options.openTaskCountByPath?.get(note.filePath) || 0
    const elevatedTaskCount = options.elevatedTaskCountByPath?.get(note.filePath)
    const overdueTaskInfo = options.overdueTaskInfoByPath?.get(note.filePath)
    const overdueTaskCount = overdueTaskInfo?.count ?? options.overdueTaskCountByPath?.get(note.filePath) ?? 0
    const dueTodayTaskInfo = options.dueTodayTaskInfoByPath?.get(note.filePath)
    const dueTodayTaskCount = dueTodayTaskInfo?.count || 0
    const highPriorityTaskInfo = options.highPriorityTaskInfoByPath?.get(note.filePath)
    const highPriorityTaskCount = highPriorityTaskInfo?.count || 0
    const scheduledTaskInfo = options.scheduledTaskInfoByPath?.get(note.filePath)
    const scheduledTaskCount = scheduledTaskInfo?.count || 0
    const startedTaskInfo = options.startedTaskInfoByPath?.get(note.filePath)
    const startedTaskCount = startedTaskInfo?.count || 0
    const blockedTaskInfo = options.blockedTaskInfoByPath?.get(note.filePath)
    const blockedTaskCount = blockedTaskInfo?.count || 0
    const recurringTaskInfo = options.recurringTaskInfoByPath?.get(note.filePath)
    const recurringTaskCount = recurringTaskInfo?.count || 0
    const upcomingTaskInfo = options.upcomingTaskInfoByPath?.get(note.filePath)
    const upcomingTaskCount = upcomingTaskInfo?.count || 0

    for (const link of outgoing) {
      if (link.resolved) continue
      items.push({
        type: 'fix_unresolved_link',
        title: note.title,
        filePath: note.filePath,
        priority: 100,
        action: `Resolve or create [[${link.targetTitle}]]`,
        reason: 'Broken wikilink blocks graph navigation and AI note lookup.',
        detail: link.context || link.targetTitle
      })
    }

    if (isEmpty) {
      items.push({
        type: 'fill_empty_note',
        title: note.title,
        filePath: note.filePath,
        priority: 78,
        action: 'Fill this empty note with a summary, source, or next action',
        reason: 'Empty notes add noise and usually indicate unfinished capture.',
        detail: `Updated: ${new Date(note.updatedAt).toISOString()}`
      })
    }

    if (duplicateTitleCount > 1) {
      items.push({
        type: 'resolve_duplicate_title',
        title: note.title,
        filePath: note.filePath,
        priority: 76,
        action: 'Rename or add a unique alias to disambiguate this note title',
        reason: 'Duplicate note titles make wikilink resolution and Agent note lookup ambiguous.',
        detail: `${duplicateTitleCount} notes share title: ${note.title}`
      })
    }

    if (duplicateAliases.length > 0) {
      items.push({
        type: 'resolve_duplicate_alias',
        title: note.title,
        filePath: note.filePath,
        priority: 72,
        action: `Make duplicate alias${duplicateAliases.length === 1 ? '' : 'es'} unique: ${duplicateAliases.join(', ')}`,
        reason: 'Duplicate aliases can route wikilinks and Agent reads to the wrong note.',
        detail: `Duplicate aliases: ${duplicateAliases.join(', ')}`
      })
    }

    if (resolvedOutgoing === 0 && backlinkCount === 0) {
      items.push({
        type: 'connect_orphan',
        title: note.title,
        filePath: note.filePath,
        priority: 80,
        action: 'Add at least one meaningful wikilink in or out of this note',
        reason: 'This note is isolated from the knowledge graph.',
        detail: `Updated: ${new Date(note.updatedAt).toISOString()}`
      })
    } else if (unlinkedMentionCount > 0) {
      items.push({
        type: 'link_unlinked_reference',
        title: note.title,
        filePath: note.filePath,
        priority: 60 + Math.min(unlinkedMentionCount, 10),
        action: `Convert ${unlinkedMentionCount} unlinked mention${unlinkedMentionCount === 1 ? '' : 's'} into wikilinks`,
        reason: 'Other notes mention this title without linking to it.',
        detail: `Unlinked mentions: ${unlinkedMentionCount}`
      })
    }

    if (overdueTaskCount > 0) {
      items.push({
        type: 'review_overdue_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 90 + Math.min(overdueTaskCount, 10),
        action: `Review ${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Overdue tasks should surface before general knowledge maintenance.',
        detail: overdueTaskInfo ? `Overdue tasks: ${overdueTaskCount}; earliest due: ${overdueTaskInfo.earliestDue}` : `Overdue tasks: ${overdueTaskCount}`
      })
    }

    if (dueTodayTaskCount > 0) {
      items.push({
        type: 'review_due_today_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 86 + Math.min(dueTodayTaskCount, 10),
        action: `Review ${dueTodayTaskCount} task${dueTodayTaskCount === 1 ? '' : 's'} due today in this note`,
        reason: 'Tasks due today should become visible before general note cleanup.',
        detail: `Due today: ${dueTodayTaskCount}; date: ${dueTodayTaskInfo?.earliestDue || ''}`
      })
    }

    if (highPriorityTaskCount > 0) {
      items.push({
        type: 'review_high_priority_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: highPriorityTaskInfo?.highestPriority === 'highest' ? 84 : 82,
        action: `Review ${highPriorityTaskCount} high-priority task${highPriorityTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'High-priority tasks should not be buried in general note cleanup.',
        detail: `High-priority tasks: ${highPriorityTaskCount}; highest priority: ${highPriorityTaskInfo?.highestPriority || ''}`
      })
    }

    if (scheduledTaskCount > 0) {
      items.push({
        type: 'review_scheduled_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 79 + Math.min(scheduledTaskCount, 5),
        action: `Review ${scheduledTaskCount} scheduled task${scheduledTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Scheduled tasks are ready to work even when they do not have a due date.',
        detail: `Scheduled tasks: ${scheduledTaskCount}; earliest scheduled: ${scheduledTaskInfo?.earliestDue || ''}`
      })
    }

    if (startedTaskCount > 0) {
      items.push({
        type: 'review_started_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 70 + Math.min(startedTaskCount, 5),
        action: `Review ${startedTaskCount} started task${startedTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Started tasks are available to work even without scheduled or due dates.',
        detail: `Started tasks: ${startedTaskCount}; earliest start: ${startedTaskInfo?.earliestDue || ''}`
      })
    }

    if (blockedTaskCount > 0) {
      items.push({
        type: 'review_blocked_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 68 + Math.min(blockedTaskCount, 5),
        action: `Review ${blockedTaskCount} blocked or waiting task${blockedTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Blocked tasks need dependency follow-up rather than more note cleanup.',
        detail: `Blocked tasks: ${blockedTaskCount}; signal: ${blockedTaskInfo?.signal || ''}`
      })
    }

    if (recurringTaskCount > 0) {
      items.push({
        type: 'review_recurring_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 66 + Math.min(recurringTaskCount, 5),
        action: `Review ${recurringTaskCount} recurring task${recurringTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Recurring tasks define routines that should stay visible in the maintenance plan.',
        detail: `Recurring tasks: ${recurringTaskCount}; signal: ${recurringTaskInfo?.signal || ''}`
      })
    }

    if (upcomingTaskCount > 0) {
      items.push({
        type: 'review_upcoming_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 74 + Math.min(upcomingTaskCount, 5),
        action: `Review ${upcomingTaskCount} upcoming task${upcomingTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Upcoming due dates let the Agent prepare work before it becomes overdue.',
        detail: `Upcoming tasks: ${upcomingTaskCount}; next due: ${upcomingTaskInfo?.earliestDue || ''}`
      })
    }

    const elevatedTaskCountFallback = overdueTaskCount + dueTodayTaskCount + highPriorityTaskCount + scheduledTaskCount + startedTaskCount + blockedTaskCount + recurringTaskCount + upcomingTaskCount
    const elevatedOpenTaskCount = elevatedTaskCount ?? elevatedTaskCountFallback
    if (openTaskCount > elevatedOpenTaskCount) {
      const remainingOpenTasks = openTaskCount - elevatedOpenTaskCount
      items.push({
        type: 'review_open_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 60 + Math.min(remainingOpenTasks, 10),
        action: `Review ${remainingOpenTasks} open task${remainingOpenTasks === 1 ? '' : 's'} in this note`,
        reason: 'Open tasks embedded in notes should feed the next-action workflow.',
        detail: `Open tasks: ${openTaskCount}; overdue: ${overdueTaskCount}; due today: ${dueTodayTaskCount}; high priority: ${highPriorityTaskCount}; scheduled: ${scheduledTaskCount}; started: ${startedTaskCount}; blocked: ${blockedTaskCount}; recurring: ${recurringTaskCount}; upcoming: ${upcomingTaskCount}`
      })
    }

    if (memoryStatus) {
      items.push({
        type: 'refresh_memory',
        title: note.title,
        filePath: note.filePath,
        priority: memoryStatus === 'stale' ? 58 : 52,
        action: memoryStatus === 'stale' ? 'Regenerate this note memory from current content' : 'Generate AI memory for this note',
        reason: memoryStatus === 'stale' ? 'The note changed after its AI memory was generated.' : 'This note has no AI memory for semantic navigation.',
        detail: `Memory status: ${memoryStatus}`
      })
    }

    if (largeCharacters > 0) {
      items.push({
        type: 'split_large_note',
        title: note.title,
        filePath: note.filePath,
        priority: 56,
        action: 'Split this long note into focused linked notes or add a map-of-content section',
        reason: 'Very long notes are harder to navigate, summarize, and connect precisely.',
        detail: `${largeCharacters} characters`
      })
    }

    if (missingProperties.length > 0) {
      items.push({
        type: 'fill_missing_property',
        title: note.title,
        filePath: note.filePath,
        priority: 50,
        action: `Fill missing properties: ${missingProperties.join(', ')}`,
        reason: 'Consistent metadata makes Bases, filters, and Agent planning more reliable.',
        detail: `Missing properties: ${missingProperties.join(', ')}`
      })
    }

    const bridge = bridgeByPath.get(note.filePath)
    if (bridge) {
      items.push({
        type: 'maintain_bridge',
        title: note.title,
        filePath: note.filePath,
        priority: 40 + bridge.score,
        action: 'Review this synthesis note for summary, map-of-content links, or possible split',
        reason: 'This note connects multiple folders or tag clusters.',
        detail: `Folders: ${bridge.folders.join(', ')}; tags: ${bridge.tags.join(', ')}`
      })
    }
  }

  return items
    .filter((item) => {
      if (type && item.type !== type) return false
      if (!query) return true
      return [item.title, item.filePath, item.action, item.reason, item.detail, item.type].some((value) => value.toLowerCase().includes(query))
    })
    .sort((a, b) => b.priority - a.priority || a.filePath.localeCompare(b.filePath) || a.action.localeCompare(b.action))
    .slice(0, limit)
}

export function getOverdueTaskCountByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string): Map<string, number> {
  const info = getOverdueTaskInfoByPath(tasks, todayIso)
  return new Map(Array.from(info.entries()).map(([filePath, item]) => [filePath, item.count]))
}

export interface TaskPathIndex {
  openTaskCountByPath: Map<string, number>
  overdueTaskInfoByPath: Map<string, DueTaskInfo>
  dueTodayTaskInfoByPath: Map<string, DueTaskInfo>
  highPriorityTaskInfoByPath: Map<string, HighPriorityTaskInfo>
  scheduledTaskInfoByPath: Map<string, DueTaskInfo>
  startedTaskInfoByPath: Map<string, DueTaskInfo>
  blockedTaskInfoByPath: Map<string, BlockedTaskInfo>
  recurringTaskInfoByPath: Map<string, RecurringTaskInfo>
  upcomingTaskInfoByPath: Map<string, DueTaskInfo>
  elevatedTaskCountByPath: Map<string, number>
}

/**
 * Walks the task list exactly once and produces every per-path aggregate that
 * buildKnowledgeMaintenanceQueue (and its callers) need. The legacy
 * getXxxTaskInfoByPath helpers are retained as thin wrappers around this
 * function for callers that only need one aggregate, but performance-sensitive
 * code (notably ai.ipc.ts plan_knowledge_maintenance) should invoke
 * indexTasksByPath directly to avoid the O(9·N) cost of recomputing the same
 * regex matches nine times in a row.
 */
export function indexTasksByPath(
  tasks: KnowledgeMaintenanceTask[],
  todayIso: string,
  upcomingDays = 7
): TaskPathIndex {
  const upcomingDaysSafe = Math.max(1, Math.floor(upcomingDays))
  const maxUpcomingIso = addDaysIso(todayIso, upcomingDaysSafe)

  const openTaskCountByPath = new Map<string, number>()

  const overdueCount = new Map<string, number>()
  const overdueEarliest = new Map<string, string>()

  const dueTodayCount = new Map<string, number>()

  const highPriorityCount = new Map<string, number>()
  const highPriorityHighest = new Map<string, 'highest' | 'high'>()

  const scheduledCount = new Map<string, number>()
  const scheduledEarliest = new Map<string, string>()

  const startedCount = new Map<string, number>()
  const startedEarliest = new Map<string, string>()

  const blockedCount = new Map<string, number>()
  const blockedSignals = new Map<string, string>()

  const recurringCount = new Map<string, number>()
  const recurringSignals = new Map<string, string>()

  const upcomingCount = new Map<string, number>()
  const upcomingEarliest = new Map<string, string>()

  const elevatedCount = new Map<string, number>()

  for (const task of tasks) {
    if (task.done) continue
    const path = task.filePath

    openTaskCountByPath.set(path, (openTaskCountByPath.get(path) || 0) + 1)

    const due = extractTaskDueDate(task.text)
    const scheduled = !due ? extractTaskScheduledDate(task.text) : null
    const start = !due && !scheduled ? extractTaskStartDate(task.text) : null
    const priority = extractHighTaskPriority(task.text)
    const recurringSignal = extractRecurringTaskSignal(task.text)
    const blockedSignal = extractBlockedTaskSignal(task.text)

    if (due) {
      if (due < todayIso) {
        overdueCount.set(path, (overdueCount.get(path) || 0) + 1)
        const earliest = overdueEarliest.get(path)
        if (!earliest || due < earliest) overdueEarliest.set(path, due)
      } else if (due === todayIso) {
        dueTodayCount.set(path, (dueTodayCount.get(path) || 0) + 1)
      } else if (due <= maxUpcomingIso) {
        upcomingCount.set(path, (upcomingCount.get(path) || 0) + 1)
        const earliest = upcomingEarliest.get(path)
        if (!earliest || due < earliest) upcomingEarliest.set(path, due)
      }
    }

    if (scheduled && scheduled <= todayIso) {
      scheduledCount.set(path, (scheduledCount.get(path) || 0) + 1)
      const earliest = scheduledEarliest.get(path)
      if (!earliest || scheduled < earliest) scheduledEarliest.set(path, scheduled)
    }

    if (start && start <= todayIso) {
      startedCount.set(path, (startedCount.get(path) || 0) + 1)
      const earliest = startedEarliest.get(path)
      if (!earliest || start < earliest) startedEarliest.set(path, start)
    }

    if (priority) {
      highPriorityCount.set(path, (highPriorityCount.get(path) || 0) + 1)
      const highest = highPriorityHighest.get(path)
      if (!highest || priority === 'highest') highPriorityHighest.set(path, priority)
    }

    if (blockedSignal) {
      blockedCount.set(path, (blockedCount.get(path) || 0) + 1)
      if (!blockedSignals.has(path)) blockedSignals.set(path, blockedSignal)
    }

    if (recurringSignal) {
      recurringCount.set(path, (recurringCount.get(path) || 0) + 1)
      if (!recurringSignals.has(path)) recurringSignals.set(path, recurringSignal)
    }

    const hasElevatedDue = Boolean(due && due <= maxUpcomingIso)
    const isScheduled = Boolean(scheduled && scheduled <= todayIso)
    const isStarted = Boolean(start && start <= todayIso)
    if (hasElevatedDue || isScheduled || isStarted || recurringSignal || blockedSignal || priority) {
      elevatedCount.set(path, (elevatedCount.get(path) || 0) + 1)
    }
  }

  const buildDueInfo = (counts: Map<string, number>, earliest: Map<string, string>): Map<string, DueTaskInfo> =>
    new Map(Array.from(counts.entries()).map(([filePath, count]) => [filePath, { count, earliestDue: earliest.get(filePath) || '' }]))

  return {
    openTaskCountByPath,
    overdueTaskInfoByPath: buildDueInfo(overdueCount, overdueEarliest),
    dueTodayTaskInfoByPath: new Map(Array.from(dueTodayCount.entries()).map(([filePath, count]) => [filePath, { count, earliestDue: todayIso }])),
    highPriorityTaskInfoByPath: new Map(
      Array.from(highPriorityCount.entries()).map(([filePath, count]) => [
        filePath,
        { count, highestPriority: highPriorityHighest.get(filePath) || 'high' }
      ])
    ),
    scheduledTaskInfoByPath: buildDueInfo(scheduledCount, scheduledEarliest),
    startedTaskInfoByPath: buildDueInfo(startedCount, startedEarliest),
    blockedTaskInfoByPath: new Map(
      Array.from(blockedCount.entries()).map(([filePath, count]) => [
        filePath,
        { count, signal: blockedSignals.get(filePath) || '' }
      ])
    ),
    recurringTaskInfoByPath: new Map(
      Array.from(recurringCount.entries()).map(([filePath, count]) => [
        filePath,
        { count, signal: recurringSignals.get(filePath) || '' }
      ])
    ),
    upcomingTaskInfoByPath: buildDueInfo(upcomingCount, upcomingEarliest),
    elevatedTaskCountByPath: elevatedCount,
  }
}

export function getOverdueTaskInfoByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string): Map<string, DueTaskInfo> {
  return indexTasksByPath(tasks, todayIso).overdueTaskInfoByPath
}

export function getDueTodayTaskInfoByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string): Map<string, DueTaskInfo> {
  return indexTasksByPath(tasks, todayIso).dueTodayTaskInfoByPath
}

export function getHighPriorityTaskInfoByPath(tasks: KnowledgeMaintenanceTask[]): Map<string, HighPriorityTaskInfo> {
  return indexTasksByPath(tasks, '9999-12-31').highPriorityTaskInfoByPath
}

export function getScheduledTaskInfoByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string): Map<string, DueTaskInfo> {
  return indexTasksByPath(tasks, todayIso).scheduledTaskInfoByPath
}

export function getStartedTaskInfoByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string): Map<string, DueTaskInfo> {
  return indexTasksByPath(tasks, todayIso).startedTaskInfoByPath
}

export function getBlockedTaskInfoByPath(tasks: KnowledgeMaintenanceTask[]): Map<string, BlockedTaskInfo> {
  return indexTasksByPath(tasks, '9999-12-31').blockedTaskInfoByPath
}

export function getRecurringTaskInfoByPath(tasks: KnowledgeMaintenanceTask[]): Map<string, RecurringTaskInfo> {
  return indexTasksByPath(tasks, '9999-12-31').recurringTaskInfoByPath
}

export function getElevatedTaskCountByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string, upcomingDays: number): Map<string, number> {
  return indexTasksByPath(tasks, todayIso, upcomingDays).elevatedTaskCountByPath
}

export function getUpcomingTaskInfoByPath(tasks: KnowledgeMaintenanceTask[], todayIso: string, days: number): Map<string, DueTaskInfo> {
  return indexTasksByPath(tasks, todayIso, days).upcomingTaskInfoByPath
}

function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split('-').map((value) => Number(value))
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function extractTaskDueDate(text: string): string | null {
  const inlineMatch = text.match(/(?:^|\s|\[)due::?\s*(\d{4}-\d{2}-\d{2})(?:\]|$|\s)/i)
  if (inlineMatch) return inlineMatch[1]
  const tasksPluginMatch = text.match(/(?:^|\s)\uD83D\uDCC5\s*(\d{4}-\d{2}-\d{2})(?:$|\s)/)
  return tasksPluginMatch ? tasksPluginMatch[1] : null
}

export function extractTaskScheduledDate(text: string): string | null {
  const inlineMatch = text.match(/(?:^|\s|\[)scheduled::?\s*(\d{4}-\d{2}-\d{2})(?:\]|$|\s)/i)
  if (inlineMatch) return inlineMatch[1]
  const tasksPluginMatch = text.match(/(?:^|\s)\u23F3\s*(\d{4}-\d{2}-\d{2})(?:$|\s)/)
  return tasksPluginMatch ? tasksPluginMatch[1] : null
}

export function extractTaskStartDate(text: string): string | null {
  const inlineMatch = text.match(/(?:^|\s|\[)start::?\s*(\d{4}-\d{2}-\d{2})(?:\]|$|\s)/i)
  if (inlineMatch) return inlineMatch[1]
  const tasksPluginMatch = text.match(/(?:^|\s)\uD83D\uDEEB\s*(\d{4}-\d{2}-\d{2})(?:$|\s)/)
  return tasksPluginMatch ? tasksPluginMatch[1] : null
}

export function extractBlockedTaskSignal(text: string): string | null {
  const statusMatch = text.match(/(?:^|\s|\[)status::?\s*(blocked|waiting|wait)(?:\]|$|\s|,)/i)
  if (statusMatch) return statusMatch[1].toLowerCase() === 'wait' ? 'waiting' : statusMatch[1].toLowerCase()
  const fieldMatch = text.match(/(?:^|\s|\[)(blocked|waiting|blocked by)::?\s*([^\]\n,;]+)/i)
  if (fieldMatch) return fieldMatch[1].toLowerCase()
  const tagMatch = text.match(/(?:^|\s)#(blocked|waiting)(?:$|\s|[.,;:!?])/i)
  return tagMatch ? tagMatch[1].toLowerCase() : null
}

export function extractRecurringTaskSignal(text: string): string | null {
  if (/(?:^|\s)\uD83D\uDD01(?:$|\s)/.test(text)) return 'recurring'
  const match = text.match(/(?:^|\s|\[)(repeat|recur|recurrence)::?\s*([^\]\n,;]+)/i)
  return match ? match[1].toLowerCase() : null
}

export function extractHighTaskPriority(text: string): 'highest' | 'high' | null {
  if (/(?:^|\s)\uD83D\uDD3A(?:$|\s)/.test(text)) return 'highest'
  if (/(?:^|\s)\u23EB(?:$|\s)/.test(text)) return 'high'
  const match = text.match(/(?:^|\s|\[)priority::?\s*(highest|high)(?:\]|$|\s|,)/i)
  return match ? match[1].toLowerCase() as 'highest' | 'high' : null
}
