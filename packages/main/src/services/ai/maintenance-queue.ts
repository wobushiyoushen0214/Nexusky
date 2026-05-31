import type { OutgoingLinkIndex } from '../indexer'
import type { KnowledgeBridgeNoteResult } from './graph-insights'
import type { AppLanguage } from '@shared/types/ipc'

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
  language?: AppLanguage
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm
}

function formatDisplayDateTime(value: number): string | null {
  if (!Number.isFinite(value)) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createMaintenanceCopy(language: AppLanguage = 'en') {
  const zh = language !== 'en'
  const priorityLabel = (value?: 'highest' | 'high') => {
    if (!zh) return value || ''
    return value === 'highest' ? '最高' : value === 'high' ? '高' : ''
  }
  return {
    updated: (updatedAt: number) => {
      const formatted = formatDisplayDateTime(updatedAt)
      return zh ? `更新于：${formatted ?? '未知时间'}` : `Updated: ${formatted ?? 'unknown'}`
    },
    resolveLinkAction: (targetTitle: string) => zh ? `处理或创建 [[${targetTitle}]]` : `Resolve or create [[${targetTitle}]]`,
    brokenLinkReason: () => zh ? '断开的双链会影响图谱导航和 AI 查找笔记。' : 'Broken wikilink blocks graph navigation and AI note lookup.',
    fillEmptyAction: () => zh ? '补全这篇空笔记，加入摘要、来源或下一步行动' : 'Fill this empty note with a summary, source, or next action',
    fillEmptyReason: () => zh ? '空笔记会增加噪音，通常代表捕获流程还没有完成。' : 'Empty notes add noise and usually indicate unfinished capture.',
    duplicateTitleAction: () => zh ? '重命名或添加唯一别名，避免笔记标题歧义' : 'Rename or add a unique alias to disambiguate this note title',
    duplicateTitleReason: () => zh ? '重复标题会让双链解析和 Agent 查找笔记变得含糊。' : 'Duplicate note titles make wikilink resolution and Agent note lookup ambiguous.',
    duplicateTitleDetail: (count: number, title: string) => zh ? `${count} 篇笔记共用标题：${title}` : `${count} notes share title: ${title}`,
    duplicateAliasAction: (aliases: string[]) => zh ? `调整重复别名：${aliases.join(', ')}` : `Make duplicate alias${aliases.length === 1 ? '' : 'es'} unique: ${aliases.join(', ')}`,
    duplicateAliasReason: () => zh ? '重复别名可能把双链和 Agent 读取导向错误笔记。' : 'Duplicate aliases can route wikilinks and Agent reads to the wrong note.',
    duplicateAliasDetail: (aliases: string[]) => zh ? `重复别名：${aliases.join(', ')}` : `Duplicate aliases: ${aliases.join(', ')}`,
    connectOrphanAction: () => zh ? '为这篇笔记添加至少一个有意义的入链或出链' : 'Add at least one meaningful wikilink in or out of this note',
    connectOrphanReason: () => zh ? '这篇笔记暂时孤立在知识图谱之外。' : 'This note is isolated from the knowledge graph.',
    unlinkedAction: (count: number) => zh ? `将 ${count} 处未链接提及转成双链` : `Convert ${count} unlinked ${plural(count, 'mention')} into wikilinks`,
    unlinkedReason: () => zh ? '其他笔记提到了这个标题，但还没有链接到它。' : 'Other notes mention this title without linking to it.',
    unlinkedDetail: (count: number) => zh ? `未链接提及：${count}` : `Unlinked mentions: ${count}`,
    overdueAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项逾期任务` : `Review ${count} overdue ${plural(count, 'task')} in this note`,
    overdueReason: () => zh ? '逾期任务应该优先于一般知识维护浮现。' : 'Overdue tasks should surface before general knowledge maintenance.',
    overdueDetail: (count: number, earliest?: string) => zh
      ? `逾期任务：${count}${earliest ? `；最早到期：${earliest}` : ''}`
      : earliest ? `Overdue tasks: ${count}; earliest due: ${earliest}` : `Overdue tasks: ${count}`,
    dueTodayAction: (count: number) => zh ? `检查这篇笔记中今日到期的 ${count} 项任务` : `Review ${count} ${plural(count, 'task')} due today in this note`,
    dueTodayReason: () => zh ? '今日到期任务应该先于一般笔记清理变得可见。' : 'Tasks due today should become visible before general note cleanup.',
    dueTodayDetail: (count: number, date?: string) => zh ? `今日到期：${count}；日期：${date || ''}` : `Due today: ${count}; date: ${date || ''}`,
    highPriorityAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项高优先级任务` : `Review ${count} high-priority ${plural(count, 'task')} in this note`,
    highPriorityReason: () => zh ? '高优先级任务不应该被埋在一般笔记清理里。' : 'High-priority tasks should not be buried in general note cleanup.',
    highPriorityDetail: (count: number, priority?: 'highest' | 'high') => zh ? `高优先级任务：${count}；最高优先级：${priorityLabel(priority)}` : `High-priority tasks: ${count}; highest priority: ${priority || ''}`,
    scheduledAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项已排程任务` : `Review ${count} scheduled ${plural(count, 'task')} in this note`,
    scheduledReason: () => zh ? '已排程任务即使没有截止日期，也已经可以开始处理。' : 'Scheduled tasks are ready to work even when they do not have a due date.',
    scheduledDetail: (count: number, date?: string) => zh ? `已排程任务：${count}；最早排程：${date || ''}` : `Scheduled tasks: ${count}; earliest scheduled: ${date || ''}`,
    startedAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项已开始任务` : `Review ${count} started ${plural(count, 'task')} in this note`,
    startedReason: () => zh ? '已开始任务即使没有排程或截止日期，也已经进入可执行状态。' : 'Started tasks are available to work even without scheduled or due dates.',
    startedDetail: (count: number, date?: string) => zh ? `已开始任务：${count}；最早开始：${date || ''}` : `Started tasks: ${count}; earliest start: ${date || ''}`,
    blockedAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项阻塞或等待任务` : `Review ${count} blocked or waiting ${plural(count, 'task')} in this note`,
    blockedReason: () => zh ? '阻塞任务需要跟进依赖，而不是继续做笔记清理。' : 'Blocked tasks need dependency follow-up rather than more note cleanup.',
    blockedDetail: (count: number, signal?: string) => zh ? `阻塞任务：${count}；信号：${signal || ''}` : `Blocked tasks: ${count}; signal: ${signal || ''}`,
    recurringAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项周期任务` : `Review ${count} recurring ${plural(count, 'task')} in this note`,
    recurringReason: () => zh ? '周期任务代表例行事项，应该持续留在维护计划里。' : 'Recurring tasks define routines that should stay visible in the maintenance plan.',
    recurringDetail: (count: number, signal?: string) => zh ? `周期任务：${count}；信号：${signal || ''}` : `Recurring tasks: ${count}; signal: ${signal || ''}`,
    upcomingAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项即将到期任务` : `Review ${count} upcoming ${plural(count, 'task')} in this note`,
    upcomingReason: () => zh ? '即将到期的任务能让 Agent 在逾期前准备工作。' : 'Upcoming due dates let the Agent prepare work before it becomes overdue.',
    upcomingDetail: (count: number, date?: string) => zh ? `即将到期：${count}；下一次到期：${date || ''}` : `Upcoming tasks: ${count}; next due: ${date || ''}`,
    openAction: (count: number) => zh ? `检查这篇笔记中的 ${count} 项未完成任务` : `Review ${count} open ${plural(count, 'task')} in this note`,
    openReason: () => zh ? '嵌在笔记里的未完成任务应该进入下一步行动流。' : 'Open tasks embedded in notes should feed the next-action workflow.',
    openDetail: (counts: { open: number; overdue: number; dueToday: number; highPriority: number; scheduled: number; started: number; blocked: number; recurring: number; upcoming: number }) => zh
      ? `未完成任务：${counts.open}；逾期：${counts.overdue}；今日到期：${counts.dueToday}；高优先级：${counts.highPriority}；已排程：${counts.scheduled}；已开始：${counts.started}；阻塞：${counts.blocked}；周期：${counts.recurring}；即将到期：${counts.upcoming}`
      : `Open tasks: ${counts.open}; overdue: ${counts.overdue}; due today: ${counts.dueToday}; high priority: ${counts.highPriority}; scheduled: ${counts.scheduled}; started: ${counts.started}; blocked: ${counts.blocked}; recurring: ${counts.recurring}; upcoming: ${counts.upcoming}`,
    memoryAction: (status: 'missing' | 'stale') => zh ? (status === 'stale' ? '根据当前内容重新生成这篇笔记的记忆账本' : '为这篇笔记生成 AI 记忆账本') : (status === 'stale' ? 'Regenerate this note memory from current content' : 'Generate AI memory for this note'),
    memoryReason: (status: 'missing' | 'stale') => zh ? (status === 'stale' ? '这篇笔记在生成 AI 记忆后又发生了变化。' : '这篇笔记还没有用于语义导航的 AI 记忆。') : (status === 'stale' ? 'The note changed after its AI memory was generated.' : 'This note has no AI memory for semantic navigation.'),
    memoryDetail: (status: 'missing' | 'stale') => zh ? `记忆状态：${status === 'stale' ? '过期' : '缺失'}` : `Memory status: ${status}`,
    largeAction: () => zh ? '将这篇长笔记拆成聚焦的关联笔记，或补充目录型链接区' : 'Split this long note into focused linked notes or add a map-of-content section',
    largeReason: () => zh ? '过长的笔记更难导航、总结，也更难精确建立连接。' : 'Very long notes are harder to navigate, summarize, and connect precisely.',
    largeDetail: (characters: number) => zh ? `${characters} 个字符` : `${characters} characters`,
    missingPropertyAction: (properties: string[]) => zh ? `补齐缺失属性：${properties.join(', ')}` : `Fill missing properties: ${properties.join(', ')}`,
    missingPropertyReason: () => zh ? '一致的元数据能让属性视图、筛选和 Agent 规划更可靠。' : 'Consistent metadata makes Bases, filters, and Agent planning more reliable.',
    missingPropertyDetail: (properties: string[]) => zh ? `缺失属性：${properties.join(', ')}` : `Missing properties: ${properties.join(', ')}`,
    bridgeAction: () => zh ? '检查这篇综合笔记，补摘要、目录型链接，或判断是否需要拆分' : 'Review this synthesis note for summary, map-of-content links, or possible split',
    bridgeReason: () => zh ? '这篇笔记连接了多个文件夹或标签簇。' : 'This note connects multiple folders or tag clusters.',
    bridgeDetail: (folders: string[], tags: string[]) => zh ? `文件夹：${folders.join(', ')}；标签：${tags.join(', ')}` : `Folders: ${folders.join(', ')}; tags: ${tags.join(', ')}`
  }
}

export function buildKnowledgeMaintenanceQueue(options: KnowledgeMaintenanceQueueOptions): KnowledgeMaintenanceItem[] {
  const limit = Math.max(1, Math.floor(options.limit || 5))
  const items: KnowledgeMaintenanceItem[] = []
  const query = (options.query || '').trim().toLowerCase()
  const type = options.type
  const bridgeByPath = new Map(options.bridges.map((bridge) => [bridge.filePath, bridge]))
  const copy = createMaintenanceCopy(options.language ?? 'en')

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
        action: copy.resolveLinkAction(link.targetTitle),
        reason: copy.brokenLinkReason(),
        detail: link.context || link.targetTitle
      })
    }

    if (isEmpty) {
      items.push({
        type: 'fill_empty_note',
        title: note.title,
        filePath: note.filePath,
        priority: 78,
        action: copy.fillEmptyAction(),
        reason: copy.fillEmptyReason(),
        detail: copy.updated(note.updatedAt)
      })
    }

    if (duplicateTitleCount > 1) {
      items.push({
        type: 'resolve_duplicate_title',
        title: note.title,
        filePath: note.filePath,
        priority: 76,
        action: copy.duplicateTitleAction(),
        reason: copy.duplicateTitleReason(),
        detail: copy.duplicateTitleDetail(duplicateTitleCount, note.title)
      })
    }

    if (duplicateAliases.length > 0) {
      items.push({
        type: 'resolve_duplicate_alias',
        title: note.title,
        filePath: note.filePath,
        priority: 72,
        action: copy.duplicateAliasAction(duplicateAliases),
        reason: copy.duplicateAliasReason(),
        detail: copy.duplicateAliasDetail(duplicateAliases)
      })
    }

    if (resolvedOutgoing === 0 && backlinkCount === 0) {
      items.push({
        type: 'connect_orphan',
        title: note.title,
        filePath: note.filePath,
        priority: 80,
        action: copy.connectOrphanAction(),
        reason: copy.connectOrphanReason(),
        detail: copy.updated(note.updatedAt)
      })
    } else if (unlinkedMentionCount > 0) {
      items.push({
        type: 'link_unlinked_reference',
        title: note.title,
        filePath: note.filePath,
        priority: 60 + Math.min(unlinkedMentionCount, 10),
        action: copy.unlinkedAction(unlinkedMentionCount),
        reason: copy.unlinkedReason(),
        detail: copy.unlinkedDetail(unlinkedMentionCount)
      })
    }

    if (overdueTaskCount > 0) {
      items.push({
        type: 'review_overdue_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 90 + Math.min(overdueTaskCount, 10),
        action: copy.overdueAction(overdueTaskCount),
        reason: copy.overdueReason(),
        detail: copy.overdueDetail(overdueTaskCount, overdueTaskInfo?.earliestDue)
      })
    }

    if (dueTodayTaskCount > 0) {
      items.push({
        type: 'review_due_today_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 86 + Math.min(dueTodayTaskCount, 10),
        action: copy.dueTodayAction(dueTodayTaskCount),
        reason: copy.dueTodayReason(),
        detail: copy.dueTodayDetail(dueTodayTaskCount, dueTodayTaskInfo?.earliestDue)
      })
    }

    if (highPriorityTaskCount > 0) {
      items.push({
        type: 'review_high_priority_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: highPriorityTaskInfo?.highestPriority === 'highest' ? 84 : 82,
        action: copy.highPriorityAction(highPriorityTaskCount),
        reason: copy.highPriorityReason(),
        detail: copy.highPriorityDetail(highPriorityTaskCount, highPriorityTaskInfo?.highestPriority)
      })
    }

    if (scheduledTaskCount > 0) {
      items.push({
        type: 'review_scheduled_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 79 + Math.min(scheduledTaskCount, 5),
        action: copy.scheduledAction(scheduledTaskCount),
        reason: copy.scheduledReason(),
        detail: copy.scheduledDetail(scheduledTaskCount, scheduledTaskInfo?.earliestDue)
      })
    }

    if (startedTaskCount > 0) {
      items.push({
        type: 'review_started_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 70 + Math.min(startedTaskCount, 5),
        action: copy.startedAction(startedTaskCount),
        reason: copy.startedReason(),
        detail: copy.startedDetail(startedTaskCount, startedTaskInfo?.earliestDue)
      })
    }

    if (blockedTaskCount > 0) {
      items.push({
        type: 'review_blocked_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 68 + Math.min(blockedTaskCount, 5),
        action: copy.blockedAction(blockedTaskCount),
        reason: copy.blockedReason(),
        detail: copy.blockedDetail(blockedTaskCount, blockedTaskInfo?.signal)
      })
    }

    if (recurringTaskCount > 0) {
      items.push({
        type: 'review_recurring_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 66 + Math.min(recurringTaskCount, 5),
        action: copy.recurringAction(recurringTaskCount),
        reason: copy.recurringReason(),
        detail: copy.recurringDetail(recurringTaskCount, recurringTaskInfo?.signal)
      })
    }

    if (upcomingTaskCount > 0) {
      items.push({
        type: 'review_upcoming_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 74 + Math.min(upcomingTaskCount, 5),
        action: copy.upcomingAction(upcomingTaskCount),
        reason: copy.upcomingReason(),
        detail: copy.upcomingDetail(upcomingTaskCount, upcomingTaskInfo?.earliestDue)
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
        action: copy.openAction(remainingOpenTasks),
        reason: copy.openReason(),
        detail: copy.openDetail({
          open: openTaskCount,
          overdue: overdueTaskCount,
          dueToday: dueTodayTaskCount,
          highPriority: highPriorityTaskCount,
          scheduled: scheduledTaskCount,
          started: startedTaskCount,
          blocked: blockedTaskCount,
          recurring: recurringTaskCount,
          upcoming: upcomingTaskCount
        })
      })
    }

    if (memoryStatus) {
      items.push({
        type: 'refresh_memory',
        title: note.title,
        filePath: note.filePath,
        priority: memoryStatus === 'stale' ? 58 : 52,
        action: copy.memoryAction(memoryStatus),
        reason: copy.memoryReason(memoryStatus),
        detail: copy.memoryDetail(memoryStatus)
      })
    }

    if (largeCharacters > 0) {
      items.push({
        type: 'split_large_note',
        title: note.title,
        filePath: note.filePath,
        priority: 56,
        action: copy.largeAction(),
        reason: copy.largeReason(),
        detail: copy.largeDetail(largeCharacters)
      })
    }

    if (missingProperties.length > 0) {
      items.push({
        type: 'fill_missing_property',
        title: note.title,
        filePath: note.filePath,
        priority: 50,
        action: copy.missingPropertyAction(missingProperties),
        reason: copy.missingPropertyReason(),
        detail: copy.missingPropertyDetail(missingProperties)
      })
    }

    const bridge = bridgeByPath.get(note.filePath)
    if (bridge) {
      items.push({
        type: 'maintain_bridge',
        title: note.title,
        filePath: note.filePath,
        priority: 40 + bridge.score,
        action: copy.bridgeAction(),
        reason: copy.bridgeReason(),
        detail: copy.bridgeDetail(bridge.folders, bridge.tags)
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
