import { describe, expect, it } from 'vitest'
import type {
  IPCChannelMap,
  KnowledgeMaintenanceItem,
  MaintenanceApplyResult,
  MaintenanceFeedbackResult
} from '../packages/shared/src/types/ipc'

describe('maintenance IPC types', () => {
  it('types maintenance:get-queue and maintenance:apply-fix', () => {
    const item: KnowledgeMaintenanceItem = {
      type: 'review_open_tasks',
      title: 'Demo',
      filePath: 'Demo.md',
      priority: 80,
      action: 'review',
      reason: 'Open tasks pending',
      detail: '3 tasks open'
    }
    const getParams: IPCChannelMap['maintenance:get-queue']['params'] = {
      vaultPath: '/tmp/vault',
      type: 'review_open_tasks',
      query: '',
      limit: 50,
      scanGroups: ['tasks'],
      language: 'zh-CN'
    }
    const getResult: IPCChannelMap['maintenance:get-queue']['result'] = {
      items: [item],
      total: 1,
      counts: { review_open_tasks: 1 } as never,
      scan: {
        state: 'complete',
        completedTypes: ['review_open_tasks'],
        pendingTypes: [],
        completedGroups: ['tasks'],
        pendingGroups: [],
        updatedAt: 1,
        durationMs: 12
      }
    }
    const applyParams: IPCChannelMap['maintenance:apply-fix']['params'] = {
      vaultPath: '/tmp/vault',
      item,
      action: 'mark_done',
      mode: 'preview',
      payload: { taskText: 'Buy milk' },
      language: 'zh-CN'
    }
    const applyResult: MaintenanceApplyResult = {
      ok: true,
      appliedAction: 'mark_done',
      resultMessage: 'Marked a task as done',
      preview: {
        filePath: 'Demo.md',
        summary: 'Marked a task as done',
        before: '- [ ] Buy milk',
        after: '- [x] Buy milk',
        beforeHash: 'before',
        afterHash: 'after',
        createsFile: false
      }
    }
    const feedbackParams: IPCChannelMap['maintenance:record-feedback']['params'] = {
      vaultPath: '/tmp/vault',
      item,
      status: 'snoozed',
      snoozeUntil: 1770000000
    }
    const feedbackResult: MaintenanceFeedbackResult = {
      ok: true,
      signature: 'sig',
      status: 'snoozed',
      snoozeUntil: 1770000000
    }
    const feedbackSummaryParams: IPCChannelMap['maintenance:get-feedback-summary']['params'] = {
      vaultPath: '/tmp/vault'
    }
    const feedbackSummaryResult: IPCChannelMap['maintenance:get-feedback-summary']['result'] = {
      last7Days: { done: 1, skipped: 0, snoozed: 1, not_relevant: 0 },
      last30Days: { done: 2, skipped: 1, snoozed: 1, not_relevant: 1 },
      updatedAt: 1770000000
    }

    expect(getParams.type).toBe('review_open_tasks')
    expect(getParams.scanGroups).toEqual(['tasks'])
    expect(getParams.language).toBe('zh-CN')
    expect(getResult.total).toBe(1)
    expect(getResult.scan.state).toBe('complete')
    expect(getResult.scan.completedGroups).toEqual(['tasks'])
    expect(applyParams.action).toBe('mark_done')
    expect(applyParams.mode).toBe('preview')
    expect(applyParams.language).toBe('zh-CN')
    expect(applyResult.appliedAction).toBe('mark_done')
    expect(applyResult.preview?.createsFile).toBe(false)
    expect(feedbackParams.status).toBe('snoozed')
    expect(feedbackResult.ok).toBe(true)
    expect(feedbackResult.snoozeUntil).toBe(1770000000)
    expect(feedbackSummaryParams.vaultPath).toBe('/tmp/vault')
    expect(feedbackSummaryResult.last7Days.done).toBe(1)
    expect(feedbackSummaryResult.last30Days.not_relevant).toBe(1)
  })
})
