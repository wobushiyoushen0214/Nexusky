import { describe, expect, it } from 'vitest'
import { buildKnowledgeMaintenanceQueue, getDueTodayTaskInfoByPath, getOverdueTaskCountByPath, getOverdueTaskInfoByPath, getUpcomingTaskInfoByPath } from '../packages/main/src/services/ai/maintenance-queue'
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
        ['Plan Ahead.md', 1],
        ['Task Note.md', 4]
      ]),
      overdueTaskInfoByPath: new Map([
        ['Overdue.md', { count: 2, earliestDue: '2026-05-18' }]
      ]),
      dueTodayTaskInfoByPath: new Map([
        ['Daily Review.md', { count: 2, earliestDue: '2026-05-21' }]
      ]),
      upcomingTaskInfoByPath: new Map([
        ['Plan Ahead.md', { count: 1, earliestDue: '2026-05-25' }]
      ]),
      bridges: [
        { title: 'Synthesis', filePath: 'Synthesis.md', score: 8, connections: 2, folders: ['Projects', 'Research'], tags: ['delivery', 'research'] }
      ],
      limit: 20
    })

    expect(queue.map((item) => item.type)).toEqual([
      'fix_unresolved_link',
      'review_overdue_tasks',
      'review_due_today_tasks',
      'connect_orphan',
      'fill_empty_note',
      'resolve_duplicate_title',
      'resolve_duplicate_title',
      'review_upcoming_tasks',
      'resolve_duplicate_alias',
      'review_open_tasks',
      'link_unlinked_reference',
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
    expect(queue[4]).toMatchObject({
      title: 'Blank',
      action: 'Fill this empty note with a summary, source, or next action'
    })
    expect(queue[5]).toMatchObject({
      title: 'Project',
      action: 'Rename or add a unique alias to disambiguate this note title'
    })
    expect(queue[7]).toMatchObject({
      title: 'Plan Ahead',
      action: 'Review 1 upcoming task in this note',
      detail: 'Upcoming tasks: 1; next due: 2026-05-25'
    })
    expect(queue[8]).toMatchObject({
      title: 'Launch',
      action: 'Make duplicate alias unique: Project'
    })
    expect(queue[9]).toMatchObject({
      title: 'Task Note',
      action: 'Review 4 open tasks in this note'
    })
    expect(queue[10]).toMatchObject({
      title: 'Mentioned',
      action: 'Convert 3 unlinked mentions into wikilinks'
    })
    expect(queue[11]).toMatchObject({
      title: 'Overdue Tasks',
      action: 'Review 1 open task in this note'
    })
    expect(queue[12]).toMatchObject({
      title: 'Changed',
      action: 'Regenerate this note memory from current content'
    })
    expect(queue[13]).toMatchObject({
      title: 'Long Research',
      action: 'Split this long note into focused linked notes or add a map-of-content section'
    })
    expect(queue[14]).toMatchObject({
      title: 'New Idea',
      action: 'Generate AI memory for this note'
    })
    expect(queue[15]).toMatchObject({
      title: 'Metadata Gap',
      action: 'Fill missing properties: status, summary'
    })
    expect(queue[16]).toMatchObject({
      title: 'Synthesis',
      detail: 'Folders: Projects, Research; tags: delivery, research'
    })
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

  it('counts overdue and due today task due markers by path', () => {
    const tasks = [
      { text: 'Follow up due:: 2026-05-20', done: false, filePath: 'A.md' },
      { text: 'Ship [due:: 2026-05-21]', done: false, filePath: 'A.md' },
      { text: 'Prepare due:: 2026-05-24', done: false, filePath: 'A.md' },
      { text: 'Later due:: 2026-05-30', done: false, filePath: 'A.md' },
      { text: 'Book due:: 2026-05-22', done: false, filePath: 'B.md' },
      { text: 'Renew license \uD83D\uDCC5 2026-05-23', done: false, filePath: 'B.md' },
      { text: 'Done due:: 2026-05-19', done: true, filePath: 'A.md' },
      { text: 'Review due: 2026-05-18', done: false, filePath: 'B.md' }
    ]
    const counts = getOverdueTaskCountByPath(tasks, '2026-05-21')
    const info = getOverdueTaskInfoByPath(tasks, '2026-05-21')
    const dueToday = getDueTodayTaskInfoByPath(tasks, '2026-05-21')
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
    expect(upcoming).toEqual(new Map([
      ['A.md', { count: 1, earliestDue: '2026-05-24' }],
      ['B.md', { count: 2, earliestDue: '2026-05-22' }]
    ]))
  })
})
