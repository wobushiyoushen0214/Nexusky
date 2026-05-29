import { describe, expect, it } from 'vitest'
import type {
  IPCChannelMap,
  KnowledgeMaintenanceItem,
  MaintenanceApplyResult
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
      limit: 50
    }
    const getResult: IPCChannelMap['maintenance:get-queue']['result'] = {
      items: [item],
      total: 1,
      counts: { review_open_tasks: 1 } as never
    }
    const applyParams: IPCChannelMap['maintenance:apply-fix']['params'] = {
      vaultPath: '/tmp/vault',
      item,
      action: 'mark_done',
      mode: 'preview',
      payload: { taskText: 'Buy milk' }
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

    expect(getParams.type).toBe('review_open_tasks')
    expect(getResult.total).toBe(1)
    expect(applyParams.action).toBe('mark_done')
    expect(applyParams.mode).toBe('preview')
    expect(applyResult.appliedAction).toBe('mark_done')
    expect(applyResult.preview?.createsFile).toBe(false)
  })
})
