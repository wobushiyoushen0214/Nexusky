import { describe, expect, it } from 'vitest'
import { shouldApplyAiEditStreamEvent } from '../packages/renderer/src/components/ai/edit-stream'

describe('chat edit stream helpers', () => {
  it('ignores late edit stream events after streaming stops', () => {
    expect(shouldApplyAiEditStreamEvent(false, { type: 'text', content: 'late token' })).toBe(false)
    expect(shouldApplyAiEditStreamEvent(false, { type: 'done' })).toBe(false)
  })

  it('accepts active edit text and completion events', () => {
    expect(shouldApplyAiEditStreamEvent(true, { type: 'text', content: 'token' })).toBe(true)
    expect(shouldApplyAiEditStreamEvent(true, { type: 'done' })).toBe(true)
  })

  it('ignores empty text events', () => {
    expect(shouldApplyAiEditStreamEvent(true, { type: 'text' })).toBe(false)
  })
})
