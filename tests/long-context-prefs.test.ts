import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LONG_CONTEXT_PREFS,
  mergeWithDefaults
} from '../packages/main/src/services/long-context/long-context-prefs'

describe('long-context prefs schema', () => {
  it('returns defaults when no value is provided', () => {
    const merged = mergeWithDefaults(undefined)
    expect(merged).toEqual({ ...DEFAULT_LONG_CONTEXT_PREFS })
  })

  it('keeps user-supplied finite values that fall within range', () => {
    const merged = mergeWithDefaults({ confidenceThreshold: 0.4, tokenBudget: 800, hotLimit: 5 })
    expect(merged.confidenceThreshold).toBe(0.4)
    expect(merged.tokenBudget).toBe(800)
    expect(merged.hotLimit).toBe(5)
  })

  it('clamps numeric values back into the allowed range', () => {
    const merged = mergeWithDefaults({
      confidenceThreshold: 2,
      tokenBudget: 50,
      decayHalfLifeDays: 10,
      hotLimit: 99,
      coldLimit: 0,
      archiveAfterDays: 4000
    })
    expect(merged.confidenceThreshold).toBe(1)
    expect(merged.tokenBudget).toBe(200)
    expect(merged.decayHalfLifeDays).toBe(30)
    expect(merged.hotLimit).toBe(10)
    expect(merged.coldLimit).toBe(1)
    expect(merged.archiveAfterDays).toBe(365)
  })

  it('rounds integer-flagged values', () => {
    const merged = mergeWithDefaults({ tokenBudget: 1234.7, hotLimit: 3.9 })
    expect(merged.tokenBudget).toBe(1235)
    expect(merged.hotLimit).toBe(4)
  })

  it('falls back to defaults on NaN', () => {
    const merged = mergeWithDefaults({ tokenBudget: Number.NaN, decayHalfLifeDays: Number.NaN })
    expect(merged.tokenBudget).toBe(DEFAULT_LONG_CONTEXT_PREFS.tokenBudget)
    expect(merged.decayHalfLifeDays).toBe(DEFAULT_LONG_CONTEXT_PREFS.decayHalfLifeDays)
  })

  it('preserves all 11 keys including ratios', () => {
    const merged = mergeWithDefaults({ hotRatio: 0.7, warmRatio: 0.2, coldRatio: 0.1 })
    expect(merged.hotRatio).toBe(0.7)
    expect(merged.warmRatio).toBe(0.2)
    expect(merged.coldRatio).toBe(0.1)
    expect(Object.keys(merged).sort()).toEqual([
      'archiveAfterDays',
      'coldLimit',
      'coldRatio',
      'confidenceThreshold',
      'decayHalfLifeDays',
      'hotLimit',
      'hotRatio',
      'tokenBudget',
      'topN',
      'warmLimit',
      'warmRatio'
    ])
  })
})
