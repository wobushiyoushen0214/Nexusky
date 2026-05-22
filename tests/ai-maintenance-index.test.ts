import { describe, expect, it } from 'vitest'
import { indexTasksByPath, type KnowledgeMaintenanceTask } from '../packages/main/src/services/ai/maintenance-queue'

const TODAY = '2026-05-22'

function task(text: string, filePath = 'Note.md', done = false): KnowledgeMaintenanceTask {
  return { text, done, filePath }
}

describe('indexTasksByPath', () => {
  it('produces overdue/dueToday/upcoming aggregates from a single pass', () => {
    const tasks = [
      task('- [ ] Pay bill [due:: 2026-05-01]'),
      task('- [ ] Daily standup [due:: 2026-05-22]'),
      task('- [ ] Sprint demo [due:: 2026-05-25]'),
      task('- [ ] Year-end review [due:: 2026-12-31]'),
      task('- [x] Done already [due:: 2026-04-01]', 'Note.md', true),
    ]
    const idx = indexTasksByPath(tasks, TODAY, 7)
    expect(idx.openTaskCountByPath.get('Note.md')).toBe(4)
    expect(idx.overdueTaskInfoByPath.get('Note.md')).toEqual({ count: 1, earliestDue: '2026-05-01' })
    expect(idx.dueTodayTaskInfoByPath.get('Note.md')).toEqual({ count: 1, earliestDue: TODAY })
    expect(idx.upcomingTaskInfoByPath.get('Note.md')).toEqual({ count: 1, earliestDue: '2026-05-25' })
  })

  it('groups results per file path', () => {
    const tasks = [
      task('- [ ] A [due:: 2026-05-21]', 'a.md'),
      task('- [ ] B [due:: 2026-05-20]', 'a.md'),
      task('- [ ] C [due:: 2026-05-21]', 'b.md'),
    ]
    const idx = indexTasksByPath(tasks, TODAY)
    expect(idx.overdueTaskInfoByPath.get('a.md')).toEqual({ count: 2, earliestDue: '2026-05-20' })
    expect(idx.overdueTaskInfoByPath.get('b.md')).toEqual({ count: 1, earliestDue: '2026-05-21' })
  })

  it('tracks high priority + blocked + recurring + scheduled + started signals in one pass', () => {
    const tasks = [
      task('- [ ] Critical 🔺'),                          // highest priority
      task('- [ ] Important ⏫'),                          // high priority
      task('- [ ] Wait on Bob [status:: blocked]'),
      task('- [ ] Recurring chore [repeat:: weekly]'),
      task('- [ ] Plan release [scheduled:: 2026-05-20]'),
      task('- [ ] Start coding [start:: 2026-05-20]'),
    ]
    const idx = indexTasksByPath(tasks, TODAY)
    expect(idx.highPriorityTaskInfoByPath.get('Note.md')).toEqual({ count: 2, highestPriority: 'highest' })
    expect(idx.blockedTaskInfoByPath.get('Note.md')?.count).toBe(1)
    expect(idx.recurringTaskInfoByPath.get('Note.md')?.count).toBe(1)
    expect(idx.scheduledTaskInfoByPath.get('Note.md')?.earliestDue).toBe('2026-05-20')
    expect(idx.startedTaskInfoByPath.get('Note.md')?.earliestDue).toBe('2026-05-20')
  })

  it('elevated count includes every actionable signal', () => {
    const tasks = [
      task('- [ ] Overdue [due:: 2026-05-01]'),
      task('- [ ] Today [due:: 2026-05-22]'),
      task('- [ ] Soon [due:: 2026-05-25]'),
      task('- [ ] Blocked [status:: blocked]'),
      task('- [ ] Recurring ⏫ [repeat:: daily]'),
      task('- [ ] Untouched plain'),
    ]
    const idx = indexTasksByPath(tasks, TODAY, 7)
    expect(idx.elevatedTaskCountByPath.get('Note.md')).toBe(5)
  })

  it('ignores completed tasks for every aggregate', () => {
    const tasks = [
      task('- [x] Done overdue [due:: 2026-05-01]', 'Note.md', true),
      task('- [x] Done blocked [status:: blocked]', 'Note.md', true),
      task('- [x] Done high 🔺', 'Note.md', true),
    ]
    const idx = indexTasksByPath(tasks, TODAY)
    expect(idx.openTaskCountByPath.size).toBe(0)
    expect(idx.overdueTaskInfoByPath.size).toBe(0)
    expect(idx.blockedTaskInfoByPath.size).toBe(0)
    expect(idx.highPriorityTaskInfoByPath.size).toBe(0)
  })

  it('only counts upcoming windows within the given day range', () => {
    const tasks = [
      task('- [ ] In 2 days [due:: 2026-05-24]'),
      task('- [ ] In 10 days [due:: 2026-06-01]'),
    ]
    const idx = indexTasksByPath(tasks, TODAY, 7)
    expect(idx.upcomingTaskInfoByPath.get('Note.md')?.count).toBe(1)
    expect(idx.upcomingTaskInfoByPath.get('Note.md')?.earliestDue).toBe('2026-05-24')
  })
})
