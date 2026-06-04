import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KnowledgeMaintenanceItem } from '../packages/shared/src/types/ipc'

function makeItem(overrides: Partial<KnowledgeMaintenanceItem> = {}): KnowledgeMaintenanceItem {
  return {
    type: 'review_open_tasks',
    title: 'Demo',
    filePath: 'Demo.md',
    priority: 80,
    action: 'Review 2 open tasks in this note',
    reason: 'Open tasks embedded in notes should feed the next-action workflow.',
    detail: 'Open tasks: 2',
    ...overrides
  }
}

describe('maintenance feedback', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-maintenance-feedback-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('hides done, skipped, not relevant, and active snoozed items by signature', async () => {
    const {
      filterMaintenanceItemsByFeedback,
      recordMaintenanceFeedback
    } = await import('../packages/main/src/services/maintenance/feedback')
    const item = makeItem()
    const changedItem = makeItem({ detail: 'Open tasks: 3' })
    const other = makeItem({ type: 'connect_orphan', action: 'Add a link', detail: 'Updated: 2026-06-03 10:00' })

    recordMaintenanceFeedback({ vaultPath, item, status: 'done', now: 100 })
    expect(filterMaintenanceItemsByFeedback(vaultPath, [item, changedItem, other], 101)).toEqual([changedItem, other])

    recordMaintenanceFeedback({ vaultPath, item: changedItem, status: 'snoozed', snoozeUntil: 200, now: 101 })
    expect(filterMaintenanceItemsByFeedback(vaultPath, [item, changedItem, other], 150)).toEqual([other])
    expect(filterMaintenanceItemsByFeedback(vaultPath, [item, changedItem, other], 201)).toEqual([changedItem, other])

    recordMaintenanceFeedback({ vaultPath, item: other, status: 'not_relevant', now: 202 })
    expect(filterMaintenanceItemsByFeedback(vaultPath, [item, changedItem, other], 203)).toEqual([changedItem])
  })

  it('updates the feedback signature when persisted feedback changes', async () => {
    const {
      getMaintenanceFeedbackSignature,
      recordMaintenanceFeedback
    } = await import('../packages/main/src/services/maintenance/feedback')
    const item = makeItem()

    const empty = getMaintenanceFeedbackSignature(vaultPath)
    const done = recordMaintenanceFeedback({ vaultPath, item, status: 'done', now: 100 })
    const afterDone = getMaintenanceFeedbackSignature(vaultPath)
    recordMaintenanceFeedback({ vaultPath, item, status: 'snoozed', snoozeUntil: 200, now: 101 })
    const afterSnooze = getMaintenanceFeedbackSignature(vaultPath)

    expect(done.status).toBe('done')
    expect(afterDone).not.toBe(empty)
    expect(afterSnooze).not.toBe(afterDone)
  })

  it('summarizes recent maintenance feedback by 7 and 30 day windows', async () => {
    const {
      getMaintenanceFeedbackSummary,
      recordMaintenanceFeedback
    } = await import('../packages/main/src/services/maintenance/feedback')
    const now = 1_800_000_000

    recordMaintenanceFeedback({ vaultPath, item: makeItem({ title: 'Done' }), status: 'done', now: now - 2 * 24 * 60 * 60 })
    recordMaintenanceFeedback({ vaultPath, item: makeItem({ title: 'Skipped' }), status: 'skipped', now: now - 8 * 24 * 60 * 60 })
    recordMaintenanceFeedback({ vaultPath, item: makeItem({ title: 'Snoozed' }), status: 'snoozed', now: now - 1 * 24 * 60 * 60 })
    recordMaintenanceFeedback({ vaultPath, item: makeItem({ title: 'Not relevant' }), status: 'not_relevant', now: now - 29 * 24 * 60 * 60 })
    recordMaintenanceFeedback({ vaultPath, item: makeItem({ title: 'Old done' }), status: 'done', now: now - 31 * 24 * 60 * 60 })

    const summary = getMaintenanceFeedbackSummary(vaultPath, now)

    expect(summary.last7Days).toEqual({
      done: 1,
      skipped: 0,
      snoozed: 1,
      not_relevant: 0
    })
    expect(summary.last30Days).toEqual({
      done: 1,
      skipped: 1,
      snoozed: 1,
      not_relevant: 1
    })
  })
})
