import { describe, expect, it } from 'vitest'
import { isCurrentBatchOperation, shouldApplyBatchOperationUpdate, shouldApplyBatchProgressEvent } from '../packages/renderer/src/components/ai/batch-operation'

describe('chat batch operation helpers', () => {
  it('identifies stale batch operations', () => {
    expect(isCurrentBatchOperation(3, 3)).toBe(true)
    expect(isCurrentBatchOperation(4, 3)).toBe(false)
  })

  it('blocks updates for cancelled or stale operations', () => {
    expect(shouldApplyBatchOperationUpdate(3, 3, false)).toBe(true)
    expect(shouldApplyBatchOperationUpdate(3, 3, true)).toBe(false)
    expect(shouldApplyBatchOperationUpdate(4, 3, false)).toBe(false)
  })

  it('requires progress events to match the active request id', () => {
    expect(shouldApplyBatchProgressEvent(3, 3, false, 3)).toBe(true)
    expect(shouldApplyBatchProgressEvent(3, 3, false, 2)).toBe(false)
    expect(shouldApplyBatchProgressEvent(3, 3, false, undefined)).toBe(false)
  })
})
