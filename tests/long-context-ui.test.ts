import { describe, expect, it } from 'vitest'
import { getRelationTypeLabel } from '../packages/renderer/src/components/long-context/LongContextBadge'

describe('long-context UI helpers', () => {
  it('labels relation types compactly for the editor panel', () => {
    expect(getRelationTypeLabel('supports_goal')).toBe('目标')
    expect(getRelationTypeLabel('blocked_by')).toBe('阻塞')
    expect(getRelationTypeLabel('repeated_pattern')).toBe('模式')
  })
})
