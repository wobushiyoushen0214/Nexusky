import { describe, expect, it } from 'vitest'
import { decay, feedbackScore, rankRelation, recurrence } from '../packages/main/src/services/long-context/relation-ranker'

describe('long-context relation ranker', () => {
  const now = 1_800_000_000
  const baseInput = {
    localScore: 0.6,
    aiConfidence: 0.72,
    recurrenceCount: 1,
    lastSeenAt: now,
    evidence: ['Current note mentions AI automation', 'Candidate note mentions tool orchestration'],
    now
  }

  it('boosts useful feedback and lowers not_related feedback', () => {
    const base = rankRelation(baseInput)
    const useful = rankRelation({ ...baseInput, feedback: { useful: 1 } })
    const notRelated = rankRelation({ ...baseInput, feedback: { notRelated: 1 } })

    expect(useful).toBeGreaterThan(base)
    expect(notRelated).toBeLessThan(base)
    expect(feedbackScore({ useful: 1, wrongReason: 1 })).toBe(0)
  })

  it('decays old relations and strengthens recurrence', () => {
    expect(decay(90)).toBeLessThan(decay(0))
    expect(recurrence(3)).toBeGreaterThan(recurrence(1))
  })
})
