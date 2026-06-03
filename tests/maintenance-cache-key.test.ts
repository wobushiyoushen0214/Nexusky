import { describe, expect, it } from 'vitest'
import { buildMaintenanceQueueCacheKey, type MaintenanceQueueCacheKeyInput } from '../packages/main/src/services/maintenance/queue-builder'

const baseInput: MaintenanceQueueCacheKeyInput = {
  vaultPath: 'C:/vault',
  query: 'Broken Link',
  type: 'fix_unresolved_link',
  limit: 50,
  minCharacters: 8000,
  upcomingDays: 7,
  requiredProperties: ['status', 'summary'],
  scanGroups: ['links'],
  language: 'en',
  todayIso: '2026-05-31',
  memorySignature: '1:memory',
  feedbackSignature: '0:feedback',
  notes: [
    { filePath: 'B.md', updatedAt: 2000, contentHash: 'hash-b' },
    { filePath: 'A.md', updatedAt: 1000, contentHash: 'hash-a' }
  ]
}

describe('maintenance queue cache key', () => {
  it('is stable for note order and normalized query casing', () => {
    const first = buildMaintenanceQueueCacheKey(baseInput)
    const second = buildMaintenanceQueueCacheKey({
      ...baseInput,
      query: '  broken link  ',
      notes: [...baseInput.notes].reverse()
    })

    expect(first).toBe(second)
    expect(first).toContain('maintenance-queue:v1')
    expect(first).toContain('scan:fix_unresolved_link')
    expect(first).toContain('groups:links')
    expect(first).toContain('language:en')
    expect(first).toContain('today:2026-05-31')
  })

  it('changes when file mtimes, scan type, scan groups, language, settings, or memory state change', () => {
    const base = buildMaintenanceQueueCacheKey(baseInput)

    expect(buildMaintenanceQueueCacheKey({
      ...baseInput,
      notes: [
        { filePath: 'B.md', updatedAt: 2001, contentHash: 'hash-b' },
        { filePath: 'A.md', updatedAt: 1000, contentHash: 'hash-a' }
      ]
    })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, type: 'review_open_tasks' })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, scanGroups: ['tasks'] })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, language: 'zh-CN' })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, upcomingDays: 14 })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, memorySignature: '2:memory' })).not.toBe(base)
    expect(buildMaintenanceQueueCacheKey({ ...baseInput, feedbackSignature: '1:feedback' })).not.toBe(base)
  })
})
