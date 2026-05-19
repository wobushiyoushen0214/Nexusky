import { describe, expect, it } from 'vitest'
import { normalizeToolLimit } from '../packages/main/src/services/ai/tool-limits'

describe('normalizeToolLimit', () => {
  it('accepts numeric and string limits', () => {
    expect(normalizeToolLimit(8)).toBe(8)
    expect(normalizeToolLimit('7')).toBe(7)
  })

  it('clamps search limits to the allowed range', () => {
    expect(normalizeToolLimit(0)).toBe(1)
    expect(normalizeToolLimit(100)).toBe(10)
    expect(normalizeToolLimit(3.8)).toBe(3)
  })

  it('falls back when the model sends an invalid limit', () => {
    expect(normalizeToolLimit(undefined)).toBe(5)
    expect(normalizeToolLimit('many')).toBe(5)
  })
})
