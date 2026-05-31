import { describe, expect, it } from 'vitest'
import { buildKnowledgeMaintenanceQueue, getBlockedTaskInfoByPath, getDueTodayTaskInfoByPath, getElevatedTaskCountByPath, getHighPriorityTaskInfoByPath, getOverdueTaskCountByPath, getOverdueTaskInfoByPath, getRecurringTaskInfoByPath, getScheduledTaskInfoByPath, getStartedTaskInfoByPath, getUpcomingTaskInfoByPath } from '../packages/main/src/services/ai/maintenance-queue'
import type { OutgoingLinkIndex } from '../packages/main/src/services/indexer'

describe('buildKnowledgeMaintenanceQueue', () => {
  it('prioritizes broken links, isolated notes, empty notes, duplicates, open tasks, unlinked mentions, long notes, memory refresh, missing properties, and bridge maintenance', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'broken', title: 'Broken Source', filePath: 'Broken.md', updatedAt: 1700000000000 },
        { id: 'orphan', title: 'Orphan', filePath: 'Orphan.md', updatedAt: 1700000000001 },
        { id: 'empty', title: 'Blank', filePath: 'Blank.md', updatedAt: 1700000000001 },
        { id: 'dup-title-a', title: 'Project', filePath: 'A/Project.md', updatedAt: 1700000000001 },
        { id: 'dup-title-b', title: 'Project', filePath: 'B/Project.md', updatedAt: 1700000000001 },
        { id: 'dup-alias', title: 'Launch', filePath: 'Launch.md', updatedAt: 1700000000001 },
        { id: 'overdue', title: 'Overdue Tasks', filePath: 'Overdue.md', updatedAt: 1700000000002 },
        { id: 'due-today', title: 'Daily Review', filePath: 'Daily Review.md', updatedAt: 1700000000002 },
        { id: 'priority', title: 'Priority Note', filePath: 'Priority Note.md', updatedAt: 1700000000002 },
        { id: 'overlap', title: 'Overlap Tasks', filePath: 'Overlap Tasks.md', updatedAt: 1700000000002 },
        { id: 'upcoming', title: 'Plan Ahead', filePath: 'Plan Ahead.md', updatedAt: 1700000000002 },
        { id: 'tasks', title: 'Task Note', filePath: 'Task Note.md', updatedAt: 1700000000002 },
        { id: 'mentioned', title: 'Mentioned', filePath: 'Mentioned.md', updatedAt: 1700000000002 },
        { id: 'stale', title: 'Changed', filePath: 'Changed.md', updatedAt: 1700000000003 },
        { id: 'large', title: 'Long Research', filePath: 'Long.md', updatedAt: 1700000000003 },
        { id: 'missing', title: 'New Idea', filePath: 'New Idea.md', updatedAt: 1700000000004 },
        { id: 'missing-props', title: 'Metadata Gap', filePath: 'Metadata Gap.md', updatedAt: 1700000000004 },
        { id: 'bridge', title: 'Synthesis', filePath: 'Synthesis.md', updatedAt: 1700000000003 }
      ],
      outgoingLinksByNoteId: new Map<string, OutgoingLinkIndex[]>([
        ['broken', [{ targetTitle: 'Missing', line: 3, context: 'See [[Missing]]', resolved: false }]],
        ['bridge', [
          { targetTitle: 'A', targetPath: 'A.md', line: 1, context: '[[A]]', resolved: true },
          { targetTitle: 'B', targetPath: 'B.md', line: 2, context: '[[B]]', resolved: true }
        ]]
      ]),
      backlinkCountByNoteId: new Map([
        ['broken', 1],
        ['orphan', 0],
        ['empty', 1],
        ['dup-title-a', 1],
        ['dup-title-b', 1],
        ['dup-alias', 1],
        ['overdue', 1],
        ['due-today', 1],
        ['priority', 1],
        ['overlap', 1],
        ['upcoming', 1],
        ['tasks', 1],
        ['mentioned', 1],
        ['stale', 1],
        ['large', 1],
        ['missing', 1],
        ['missing-props', 1],
        ['bridge', 2]
      ]),
      unlinkedMentionCountByNoteId: new Map([
        ['mentioned', 3]
      ]),
      memoryStatusByNoteId: new Map([
        ['stale', 'stale'],
        ['missing', 'missing']
      ]),
      duplicateTitleCountByPath: new Map([
        ['A/Project.md', 2],
        ['B/Project.md', 2]
      ]),
      duplicateAliasesByPath: new Map([
        ['Launch.md', ['Project']]
      ]),
      emptyNotePaths: new Set(['Blank.md']),
      largeNoteCharactersByPath: new Map([
        ['Long.md', 12000]
      ]),
      missingPropertiesByPath: new Map([
        ['Metadata Gap.md', ['status', 'summary']]
      ]),
      openTaskCountByPath: new Map([
        ['Overdue.md', 3],
        ['Daily Review.md', 2],
        ['Priority Note.md', 3],
        ['Overlap Tasks.md', 3],
        ['Plan Ahead.md', 1],
        ['Task Note.md', 4]
      ]),
      elevatedTaskCountByPath: new Map([
        ['Overdue.md', 2],
        ['Daily Review.md', 2],
        ['Priority Note.md', 2],
        ['Overlap Tasks.md', 2],
        ['Plan Ahead.md', 1]
      ]),
      overdueTaskInfoByPath: new Map([
        ['Overdue.md', { count: 2, earliestDue: '2026-05-18' }]
      ]),
      dueTodayTaskInfoByPath: new Map([
        ['Daily Review.md', { count: 2, earliestDue: '2026-05-21' }]
      ]),
      highPriorityTaskInfoByPath: new Map([
        ['Priority Note.md', { count: 2, highestPriority: 'highest' }],
        ['Overlap Tasks.md', { count: 1, highestPriority: 'highest' }]
      ]),
      upcomingTaskInfoByPath: new Map([
        ['Overlap Tasks.md', { count: 2, earliestDue: '2026-05-23' }],
        ['Plan Ahead.md', { count: 1, earliestDue: '2026-05-25' }]
      ]),
      bridges: [
        { title: 'Synthesis', filePath: 'Synthesis.md', score: 8, connections: 2, folders: ['Projects', 'Research'], tags: ['delivery', 'research'] }
      ],
      limit: 25
    })

    expect(queue.map((item) => item.type)).toEqual([
      'fix_unresolved_link',
      'review_overdue_tasks',
      'review_due_today_tasks',
      'review_high_priority_tasks',
      'review_high_priority_tasks',
      'connect_orphan',
      'fill_empty_note',
      'resolve_duplicate_title',
      'resolve_duplicate_title',
      'review_upcoming_tasks',
      'review_upcoming_tasks',
      'resolve_duplicate_alias',
      'review_open_tasks',
      'link_unlinked_reference',
      'review_open_tasks',
      'review_open_tasks',
      'review_open_tasks',
      'refresh_memory',
      'split_large_note',
      'refresh_memory',
      'fill_missing_property',
      'maintain_bridge'
    ])
    expect(queue[0]).toMatchObject({
      title: 'Broken Source',
      action: 'Resolve or create [[Missing]]'
    })
    expect(queue[1]).toMatchObject({
      title: 'Overdue Tasks',
      action: 'Review 2 overdue tasks in this note',
      detail: 'Overdue tasks: 2; earliest due: 2026-05-18'
    })
    expect(queue[2]).toMatchObject({
      title: 'Daily Review',
      action: 'Review 2 tasks due today in this note',
      detail: 'Due today: 2; date: 2026-05-21'
    })
    expect(queue[3]).toMatchObject({
      title: 'Overlap Tasks',
      action: 'Review 1 high-priority task in this note'
    })
    expect(queue[4]).toMatchObject({
      title: 'Priority Note',
      action: 'Review 2 high-priority tasks in this note',
      detail: 'High-priority tasks: 2; highest priority: highest'
    })
    expect(queue[6]).toMatchObject({
      title: 'Blank',
      action: 'Fill this empty note with a summary, source, or next action'
    })
    expect(queue[7]).toMatchObject({
      title: 'Project',
      action: 'Rename or add a unique alias to disambiguate this note title'
    })
    expect(queue[9]).toMatchObject({
      title: 'Overlap Tasks',
      action: 'Review 2 upcoming tasks in this note',
      detail: 'Upcoming tasks: 2; next due: 2026-05-23'
    })
    expect(queue[10]).toMatchObject({
      title: 'Plan Ahead',
      action: 'Review 1 upcoming task in this note',
      detail: 'Upcoming tasks: 1; next due: 2026-05-25'
    })
    expect(queue[11]).toMatchObject({
      title: 'Launch',
      action: 'Make duplicate alias unique: Project'
    })
    expect(queue[12]).toMatchObject({
      title: 'Task Note',
      action: 'Review 4 open tasks in this note'
    })
    expect(queue[13]).toMatchObject({
      title: 'Mentioned',
      action: 'Convert 3 unlinked mentions into wikilinks'
    })
    expect(queue[14]).toMatchObject({
      title: 'Overdue Tasks',
      action: 'Review 1 open task in this note'
    })
    expect(queue[15]).toMatchObject({
      title: 'Overlap Tasks',
      action: 'Review 1 open task in this note'
    })
    expect(queue[16]).toMatchObject({
      title: 'Priority Note',
      action: 'Review 1 open task in this note'
    })
    expect(queue[17]).toMatchObject({
      title: 'Changed',
      action: 'Regenerate this note memory from current content'
    })
    expect(queue[18]).toMatchObject({
      title: 'Long Research',
      action: 'Split this long note into focused linked notes or add a map-of-content section'
    })
    expect(queue[19]).toMatchObject({
      title: 'New Idea',
      action: 'Generate AI memory for this note'
    })
    expect(queue[20]).toMatchObject({
      title: 'Metadata Gap',
      action: 'Fill missing properties: status, summary'
    })
    expect(queue[21]).toMatchObject({
      title: 'Synthesis',
      detail: 'Folders: Projects, Research; tags: delivery, research'
    })
  })

  it('localizes visible maintenance queue copy with the requested language', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'broken', title: 'Broken Source', filePath: 'Broken.md', updatedAt: 1700000000000 },
        { id: 'overdue', title: 'Overdue Tasks', filePath: 'Overdue.md', updatedAt: 1700000000001 },
        { id: 'memory', title: 'Memory Note', filePath: 'Memory.md', updatedAt: 1700000000002 },
        { id: 'blank', title: 'Blank', filePath: 'Blank.md', updatedAt: 1700000000003 }
      ],
      outgoingLinksByNoteId: new Map<string, OutgoingLinkIndex[]>([
        ['broken', [{ targetTitle: 'Missing', line: 3, context: 'See [[Missing]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([
        ['broken', 1],
        ['overdue', 1],
        ['memory', 1],
        ['blank', 1]
      ]),
      unlinkedMentionCountByNoteId: new Map(),
      openTaskCountByPath: new Map([
        ['Overdue.md', 2]
      ]),
      elevatedTaskCountByPath: new Map([
        ['Overdue.md', 2]
      ]),
      overdueTaskInfoByPath: new Map([
        ['Overdue.md', { count: 2, earliestDue: '2026-05-18' }]
      ]),
      memoryStatusByNoteId: new Map([
        ['memory', 'missing']
      ]),
      emptyNotePaths: new Set(['Blank.md']),
      bridges: [],
      language: 'zh-CN',
      limit: 10
    })

    expect(queue.find((item) => item.type === 'fix_unresolved_link')).toMatchObject({
      action: '处理或创建 [[Missing]]',
      reason: '断开的双链会影响图谱导航和 AI 查找笔记。'
    })
    expect(queue.find((item) => item.type === 'review_overdue_tasks')).toMatchObject({
      action: '检查这篇笔记中的 2 项逾期任务',
      detail: '逾期任务：2；最早到期：2026-05-18'
    })
    expect(queue.find((item) => item.type === 'refresh_memory')).toMatchObject({
      action: '为这篇笔记生成 AI 记忆账本',
      detail: '记忆状态：缺失'
    })
    expect(queue.find((item) => item.type === 'fill_empty_note')).toMatchObject({
      action: '补全这篇空笔记，加入摘要、来源或下一步行动',
      detail: '更新于：2023-11-14T22:13:20.003Z'
    })
    const visibleCopy = queue.map((item) => `${item.action}\n${item.reason}\n${item.detail}`).join('\n')
    expect(visibleCopy).not.toContain('Resolve or create')
    expect(visibleCopy).not.toContain('Review 2 overdue tasks')
    expect(visibleCopy).not.toContain('Memory status')
    expect(visibleCopy).not.toContain('Updated:')
  })

  it('filters maintenance items by query', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [{ id: 'a', title: 'Alpha', filePath: 'Alpha.md', updatedAt: 1700000000000 }],
      outgoingLinksByNoteId: new Map([
        ['a', [{ targetTitle: 'Missing Project', line: 1, context: '[[Missing Project]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      bridges: [],
      query: 'project'
    })

    expect(queue).toHaveLength(1)
    expect(buildKnowledgeMaintenanceQueue({
      notes: [{ id: 'a', title: 'Alpha', filePath: 'Alpha.md', updatedAt: 1700000000000 }],
      outgoingLinksByNoteId: new Map([
        ['a', [{ targetTitle: 'Missing Project', line: 1, context: '[[Missing Project]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      bridges: [],
      query: 'archive'
    })).toEqual([])
  })

  it('filters maintenance items by type', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'a', title: 'Alpha', filePath: 'Alpha.md', updatedAt: 1700000000000 },
        { id: 'b', title: 'Beta', filePath: 'Beta.md', updatedAt: 1700000000000 }
      ],
      outgoingLinksByNoteId: new Map([
        ['a', [{ targetTitle: 'Missing', line: 1, context: '[[Missing]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([['a', 1], ['b', 1]]),
      unlinkedMentionCountByNoteId: new Map([['b', 2]]),
      bridges: [],
      type: 'link_unlinked_reference'
    })

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ title: 'Beta', type: 'link_unlinked_reference' })
  })

  it('queues scheduled tasks separately from general open tasks', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'a', title: 'Scheduled Work', filePath: 'Scheduled Work.md', updatedAt: 1700000000000 }
      ],
      outgoingLinksByNoteId: new Map(),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      openTaskCountByPath: new Map([['Scheduled Work.md', 3]]),
      scheduledTaskInfoByPath: new Map([['Scheduled Work.md', { count: 1, earliestDue: '2026-05-20' }]]),
      bridges: []
    })

    expect(queue.map((item) => item.type)).toEqual(['review_scheduled_tasks', 'review_open_tasks'])
    expect(queue[0]).toMatchObject({
      title: 'Scheduled Work',
      action: 'Review 1 scheduled task in this note',
      detail: 'Scheduled tasks: 1; earliest scheduled: 2026-05-20'
    })
    expect(queue[1]).toMatchObject({
      title: 'Scheduled Work',
      action: 'Review 2 open tasks in this note',
      detail: 'Open tasks: 3; overdue: 0; due today: 0; high priority: 0; scheduled: 1; started: 0; blocked: 0; recurring: 0; upcoming: 0'
    })
  })

  it('queues started tasks separately from general open tasks', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'a', title: 'Started Work', filePath: 'Started Work.md', updatedAt: 1700000000000 }
      ],
      outgoingLinksByNoteId: new Map(),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      openTaskCountByPath: new Map([['Started Work.md', 2]]),
      startedTaskInfoByPath: new Map([['Started Work.md', { count: 1, earliestDue: '2026-05-19' }]]),
      bridges: []
    })

    expect(queue.map((item) => item.type)).toEqual(['review_started_tasks', 'review_open_tasks'])
    expect(queue[0]).toMatchObject({
      title: 'Started Work',
      action: 'Review 1 started task in this note',
      detail: 'Started tasks: 1; earliest start: 2026-05-19'
    })
    expect(queue[1]).toMatchObject({
      title: 'Started Work',
      action: 'Review 1 open task in this note',
      detail: 'Open tasks: 2; overdue: 0; due today: 0; high priority: 0; scheduled: 0; started: 1; blocked: 0; recurring: 0; upcoming: 0'
    })
  })

  it('queues blocked tasks separately from general open tasks', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'a', title: 'Blocked Work', filePath: 'Blocked Work.md', updatedAt: 1700000000000 }
      ],
      outgoingLinksByNoteId: new Map(),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      openTaskCountByPath: new Map([['Blocked Work.md', 3]]),
      blockedTaskInfoByPath: new Map([['Blocked Work.md', { count: 2, signal: 'blocked' }]]),
      bridges: []
    })

    expect(queue.map((item) => item.type)).toEqual(['review_blocked_tasks', 'review_open_tasks'])
    expect(queue[0]).toMatchObject({
      title: 'Blocked Work',
      action: 'Review 2 blocked or waiting tasks in this note',
      detail: 'Blocked tasks: 2; signal: blocked'
    })
    expect(queue[1]).toMatchObject({
      title: 'Blocked Work',
      action: 'Review 1 open task in this note',
      detail: 'Open tasks: 3; overdue: 0; due today: 0; high priority: 0; scheduled: 0; started: 0; blocked: 2; recurring: 0; upcoming: 0'
    })
  })

  it('queues recurring tasks separately from general open tasks', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'a', title: 'Recurring Work', filePath: 'Recurring Work.md', updatedAt: 1700000000000 }
      ],
      outgoingLinksByNoteId: new Map(),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      openTaskCountByPath: new Map([['Recurring Work.md', 3]]),
      recurringTaskInfoByPath: new Map([['Recurring Work.md', { count: 2, signal: 'recurring' }]]),
      bridges: []
    })

    expect(queue.map((item) => item.type)).toEqual(['review_recurring_tasks', 'review_open_tasks'])
    expect(queue[0]).toMatchObject({
      title: 'Recurring Work',
      action: 'Review 2 recurring tasks in this note',
      detail: 'Recurring tasks: 2; signal: recurring'
    })
    expect(queue[1]).toMatchObject({
      title: 'Recurring Work',
      action: 'Review 1 open task in this note',
      detail: 'Open tasks: 3; overdue: 0; due today: 0; high priority: 0; scheduled: 0; started: 0; blocked: 0; recurring: 2; upcoming: 0'
    })
  })

  it('counts overdue and due today task due markers by path', () => {
    const tasks = [
      { text: 'Follow up due:: 2026-05-20', done: false, filePath: 'A.md' },
      { text: 'Ship [due:: 2026-05-21]', done: false, filePath: 'A.md' },
      { text: 'Prepare due:: 2026-05-24', done: false, filePath: 'A.md' },
      { text: 'Later due:: 2026-05-30', done: false, filePath: 'A.md' },
      { text: 'Book due:: 2026-05-22', done: false, filePath: 'B.md' },
      { text: 'Renew license \uD83D\uDCC5 2026-05-23', done: false, filePath: 'B.md' },
      { text: 'Escalate outage \uD83D\uDD3A', done: false, filePath: 'C.md' },
      { text: 'Call vendor \u23EB', done: false, filePath: 'C.md' },
      { text: 'Write summary [priority:: high]', done: false, filePath: 'D.md' },
      { text: 'Ignored medium \uD83D\uDD3C', done: false, filePath: 'D.md' },
      { text: 'Renew contract \uD83D\uDD3A \uD83D\uDCC5 2026-05-23', done: false, filePath: 'E.md' },
      { text: 'Prep brief due:: 2026-05-24', done: false, filePath: 'E.md' },
      { text: 'Plan workshop \u23F3 2026-05-20', done: false, filePath: 'F.md' },
      { text: 'Draft agenda [scheduled:: 2026-05-21]', done: false, filePath: 'F.md' },
      { text: 'Future scheduled \u23F3 2026-05-22', done: false, filePath: 'F.md' },
      { text: 'Scheduled with due \u23F3 2026-05-20 \uD83D\uDCC5 2026-05-24', done: false, filePath: 'F.md' },
      { text: 'Begin research \uD83D\uDEEB 2026-05-19', done: false, filePath: 'G.md' },
      { text: 'Read brief [start:: 2026-05-21]', done: false, filePath: 'G.md' },
      { text: 'Future start \uD83D\uDEEB 2026-05-22', done: false, filePath: 'G.md' },
      { text: 'Started with schedule \uD83D\uDEEB 2026-05-20 \u23F3 2026-05-20', done: false, filePath: 'G.md' },
      { text: 'Wait on legal [status:: blocked]', done: false, filePath: 'H.md' },
      { text: 'Get finance answer blocked:: finance', done: false, filePath: 'H.md' },
      { text: 'Vendor reply #waiting', done: false, filePath: 'H.md' },
      { text: 'Daily review \uD83D\uDD01 every day', done: false, filePath: 'I.md' },
      { text: 'Weekly report [repeat:: every week]', done: false, filePath: 'I.md' },
      { text: 'Done due:: 2026-05-19', done: true, filePath: 'A.md' },
      { text: 'Done priority \u23EB', done: true, filePath: 'C.md' },
      { text: 'Done blocked [status:: blocked]', done: true, filePath: 'H.md' },
      { text: 'Done recurring \uD83D\uDD01 every week', done: true, filePath: 'I.md' },
      { text: 'Review due: 2026-05-18', done: false, filePath: 'B.md' }
    ]
    const counts = getOverdueTaskCountByPath(tasks, '2026-05-21')
    const info = getOverdueTaskInfoByPath(tasks, '2026-05-21')
    const dueToday = getDueTodayTaskInfoByPath(tasks, '2026-05-21')
    const highPriority = getHighPriorityTaskInfoByPath(tasks)
    const scheduled = getScheduledTaskInfoByPath(tasks, '2026-05-21')
    const started = getStartedTaskInfoByPath(tasks, '2026-05-21')
    const blocked = getBlockedTaskInfoByPath(tasks)
    const recurring = getRecurringTaskInfoByPath(tasks)
    const elevated = getElevatedTaskCountByPath(tasks, '2026-05-21', 3)
    const upcoming = getUpcomingTaskInfoByPath(tasks, '2026-05-21', 3)

    expect(counts).toEqual(new Map([
      ['A.md', 1],
      ['B.md', 1]
    ]))
    expect(info).toEqual(new Map([
      ['A.md', { count: 1, earliestDue: '2026-05-20' }],
      ['B.md', { count: 1, earliestDue: '2026-05-18' }]
    ]))
    expect(dueToday).toEqual(new Map([
      ['A.md', { count: 1, earliestDue: '2026-05-21' }]
    ]))
    expect(highPriority).toEqual(new Map([
      ['C.md', { count: 2, highestPriority: 'highest' }],
      ['D.md', { count: 1, highestPriority: 'high' }],
      ['E.md', { count: 1, highestPriority: 'highest' }]
    ]))
    expect(scheduled).toEqual(new Map([
      ['F.md', { count: 2, earliestDue: '2026-05-20' }],
      ['G.md', { count: 1, earliestDue: '2026-05-20' }]
    ]))
    expect(started).toEqual(new Map([
      ['G.md', { count: 2, earliestDue: '2026-05-19' }]
    ]))
    expect(blocked).toEqual(new Map([
      ['H.md', { count: 3, signal: 'blocked' }]
    ]))
    expect(recurring).toEqual(new Map([
      ['I.md', { count: 2, signal: 'recurring' }]
    ]))
    expect(elevated).toEqual(new Map([
      ['A.md', 3],
      ['B.md', 3],
      ['C.md', 2],
      ['D.md', 1],
      ['E.md', 2],
      ['F.md', 3],
      ['G.md', 3],
      ['H.md', 3],
      ['I.md', 2]
    ]))
    expect(upcoming).toEqual(new Map([
      ['A.md', { count: 1, earliestDue: '2026-05-24' }],
      ['B.md', { count: 2, earliestDue: '2026-05-22' }],
      ['E.md', { count: 2, earliestDue: '2026-05-23' }],
      ['F.md', { count: 1, earliestDue: '2026-05-24' }]
    ]))
  })
})
