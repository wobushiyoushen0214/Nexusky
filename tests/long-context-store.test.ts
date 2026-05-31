import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getContextSuggestions,
  submitRelationFeedback,
  upsertRelation,
  type UpsertRelationInput
} from '../packages/main/src/services/long-context/relation-store'

describe('long-context relation store', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-store-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  function relation(targetId: string, targetTitle: string, overrides: Partial<UpsertRelationInput> = {}): UpsertRelationInput {
    return {
      sourceType: 'note',
      sourceId: 'current-note',
      sourceTitle: 'Current',
      sourcePath: 'Current.md',
      targetType: 'note',
      targetId,
      targetTitle,
      targetPath: `${targetTitle}.md`,
      relationType: 'supports_goal',
      confidence: 0.72,
      localScore: 0.6,
      evidence: ['Current note mentions AI automation', `${targetTitle} mentions tool orchestration`],
      reason: 'Both notes discuss using tools to support the same AI automation goal.',
      ...overrides
    }
  }

  it('upserts the same relation pair without duplicates and preserves seen timestamps', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const firstId = upsertRelation(vaultPath, relation('target-note', 'Target'))
    const secondId = upsertRelation(vaultPath, relation('target-note', 'Target', { confidence: 0.8 }))
    const db = getDatabase(vaultPath)

    const rows = db.prepare('SELECT id, confidence, strength, first_seen_at as firstSeenAt, last_seen_at as lastSeenAt FROM ai_relations').all() as { id: string; confidence: number; strength: number; firstSeenAt: number; lastSeenAt: number }[]

    expect(secondId).toBe(firstId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: firstId, confidence: 0.8, strength: 2 })
    expect(rows[0].firstSeenAt).toBeLessThanOrEqual(rows[0].lastSeenAt)
  })

  it('returns Top N suggestions and useful feedback improves ordering', () => {
    const zetaId = upsertRelation(vaultPath, relation('zeta-note', 'Zeta'))
    upsertRelation(vaultPath, relation('alpha-note', 'Alpha'))

    expect(getContextSuggestions({ vaultPath, entityType: 'note', entityId: 'current-note', limit: 2 }).map((item) => item.targetTitle)).toEqual(['Alpha', 'Zeta'])

    submitRelationFeedback({ vaultPath, relationId: zetaId, feedbackType: 'useful' })

    const suggestions = getContextSuggestions({ vaultPath, entityType: 'note', entityId: 'current-note', limit: 2 })
    expect(suggestions[0].targetTitle).toBe('Zeta')
    expect(suggestions[0].evidence).toEqual(expect.arrayContaining(['Current note mentions AI automation']))
  })

  it('hides not_related relations and records feedback', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const relationId = upsertRelation(vaultPath, relation('wrong-note', 'Wrong'))

    submitRelationFeedback({ vaultPath, relationId, feedbackType: 'not_related', note: 'Wrong context' })

    expect(getContextSuggestions({ vaultPath, entityType: 'note', entityId: 'current-note', limit: 3 }).map((item) => item.relationId)).not.toContain(relationId)
    expect(getDatabase(vaultPath).prepare('SELECT feedback_type as feedbackType, note FROM relation_feedback WHERE relation_id = ?').get(relationId)).toEqual({
      feedbackType: 'not_related',
      note: 'Wrong context'
    })
  })

  it('snoozed relation feedback is stored and lowers future ranking without marking the relation wrong', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const relationId = upsertRelation(vaultPath, relation('snooze-note', 'Snooze'))
    const before = getContextSuggestions({ vaultPath, entityType: 'note', entityId: 'current-note', limit: 3 })
      .find((item) => item.relationId === relationId)!

    submitRelationFeedback({ vaultPath, relationId, feedbackType: 'snoozed' })

    const row = getDatabase(vaultPath).prepare('SELECT status, score FROM ai_relations WHERE id = ?').get(relationId) as { status: string; score: number }
    expect(row.status).toBe('active')
    expect(row.score).toBeLessThan(before.score)
    expect(getDatabase(vaultPath).prepare('SELECT feedback_type as feedbackType FROM relation_feedback WHERE relation_id = ?').get(relationId)).toEqual({
      feedbackType: 'snoozed'
    })
  })

  it('returns a clear error when feedback targets a missing relation', () => {
    expect(() => submitRelationFeedback({ vaultPath, relationId: 'missing', feedbackType: 'useful' })).toThrow('Relation not found: missing')
  })
})
