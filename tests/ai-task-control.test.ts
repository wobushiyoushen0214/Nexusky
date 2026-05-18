import { describe, expect, it } from 'vitest'
import { abortAiTask, finishAiTask, startAiTask } from '../packages/main/src/services/ai-task-control'

describe('ai task control', () => {
  it('aborts the previous task when a new task starts for the same window', () => {
    const windowId = 10_001
    const first = startAiTask(windowId)
    const second = startAiTask(windowId)

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)

    finishAiTask(windowId, second)
  })

  it('only finishes the active controller', () => {
    const windowId = 10_002
    const first = startAiTask(windowId)
    const second = startAiTask(windowId)

    finishAiTask(windowId, first)
    expect(abortAiTask(windowId)).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  it('returns false when no active task exists', () => {
    expect(abortAiTask(10_003)).toBe(false)
  })
})
