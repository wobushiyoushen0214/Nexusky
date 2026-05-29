import { describe, expect, it } from 'vitest'
import {
  buildGenerateNotesCompletion,
  formatGenerateNotesDoneMessage,
  normalizeGeneratedNoteError
} from '../packages/main/src/services/ai/generate-notes-result'
import type { IPCChannelMap } from '../packages/shared/src/types/ipc'

describe('generate notes completion result', () => {
  it('reports partial generation failures instead of treating them as success', () => {
    const result = buildGenerateNotesCompletion({
      aborted: false,
      files: ['/vault/A.md'],
      total: 2,
      failedItems: [{ title: 'B', stage: 'generate', error: 'provider failed' }]
    })

    expect(result.success).toBe(false)
    expect(result.files).toHaveLength(1)
    expect(result.failed).toBe(1)
    expect(result.total).toBe(2)
    expect(result.error).toContain('B')
    expect(formatGenerateNotesDoneMessage(result)).toBe('完成但有失败：已生成 1 个文件，失败 1 篇')
  })

  it('keeps failed counts on cancellation', () => {
    const result = buildGenerateNotesCompletion({
      aborted: true,
      files: ['/vault/A.md'],
      total: 3,
      failedItems: [{ title: 'B', stage: 'write', error: 'disk full' }]
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('已取消')
    expect(result.failed).toBe(1)
    expect(formatGenerateNotesDoneMessage(result)).toBe('已停止，已生成 1 个文件')
  })

  it('matches the ai:generate-notes IPC result shape', () => {
    const result: IPCChannelMap['ai:generate-notes']['result'] = {
      success: false,
      files: ['/vault/A.md'],
      failed: 1,
      total: 2,
      failedItems: [{ title: 'B', stage: 'generate', error: 'provider failed' }],
      error: '1 篇笔记生成失败，首个失败：B - provider failed'
    }

    expect(result.failedItems[0].stage).toBe('generate')
  })

  it('normalizes empty and overly long provider errors', () => {
    expect(normalizeGeneratedNoteError('')).toBe('unknown_error')
    expect(normalizeGeneratedNoteError('x'.repeat(200))).toHaveLength(163)
  })
})
