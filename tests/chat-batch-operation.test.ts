import { describe, expect, it } from 'vitest'
import { isCurrentBatchOperation, shouldApplyBatchOperationUpdate } from '../packages/renderer/src/components/ai/batch-operation'

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
})
