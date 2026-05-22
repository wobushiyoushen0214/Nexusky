import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getContextSuggestions,
  refreshRelationScores,
  submitRelationFeedback,
  upsertRelation,
  type UpsertRelationInput
} from '../packages/main/src/services/long-context/relation-store'

describe('long-context relation decay governance', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-decay-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  function relation(targetId: string, overrides: Partial<UpsertRelationInput> = {}): UpsertRelationInput {
    return {
      sourceType: 'note',
      sourceId: 'current-note',
      sourceTitle: 'Current',
      sourcePath: 'Current.md',
      targetType: 'note',
      targetId,
      targetTitle: targetId,
      targetPath: `${targetId}.md`,
      relationType: 'supports_goal',
      confidence: 0.72,
      localScore: 0.6,
      evidence: ['Current note mentions AI automation', `${targetId} mentions tool orchestration`],
      reason: 'Both notes discuss using tools to support the same AI automation goal.',
      ...overrides
    }
  }

  async function setRelationFields(id: string, fields: Record<string, number | string>): Promise<void> {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const assignments = Object.keys(fields).map((field) => `${field} = ?`).join(', ')
    getDatabase(vaultPath).prepare(`UPDATE ai_relations SET ${assignments} WHERE id = ?`).run(...Object.values(fields), id)
  }

  async function getRelation(id: string): Promise<{ score: number; status: string; strength: number }> {
    const { getDatabase } = await import('../packages/main/src/services/database')
    return getDatabase(vaultPath).prepare('SELECT score, status, strength FROM ai_relations WHERE id = ?').get(id) as { score: number; status: string; strength: number }
  }

  it('lowers the refreshed score for a relation last seen ninety days ago', async () => {
    const relationId = upsertRelation(vaultPath, relation('old-context'))

    await setRelationFields(relationId, { last_seen_at: now, updated_at: now })
    refreshRelationScores({ vaultPath, now })
    const freshScore = (await getRelation(relationId)).score

    await setRelationFields(relationId, { last_seen_at: now - 90 * 86_400, updated_at: now - 90 * 86_400 })
    refreshRelationScores({ vaultPath, now })
    const decayedScore = (await getRelation(relationId)).score

    expect(decayedScore).toBeLessThan(freshScore - 0.05)
  })

  it('boosts refreshed score when the same relation has recurred three times', async () => {
    const weakId = upsertRelation(vaultPath, relation('single-recurrence'))
    const recurringId = upsertRelation(vaultPath, relation('triple-recurrence'))
    await setRelationFields(weakId, { strength: 1, last_seen_at: now, updated_at: now })
    await setRelationFields(recurringId, { strength: 3, last_seen_at: now, updated_at: now })

    refreshRelationScores({ vaultPath, now })

    expect((await getRelation(recurringId)).score).toBeGreaterThan((await getRelation(weakId)).score)
  })

  it('archives stale weak active relations after the archive window', async () => {
    const relationId = upsertRelation(vaultPath, relation('stale-weak-context', {
      confidence: 0.34,
      localScore: 0.3,
      evidence: ['Thin signal']
    }))
    await setRelationFields(relationId, {
      confidence: 0.34,
      strength: 1,
      last_seen_at: now - 240 * 86_400,
      updated_at: now - 240 * 86_400
    })

    const result = refreshRelationScores({ vaultPath, now, archiveAfterDays: 180, archiveScoreThreshold: 0.45 })

    expect(result.archived).toBe(1)
    expect((await getRelation(relationId)).status).toBe('archived')
  })

  it('keeps user-rejected relations hidden across rediscovery and refresh', async () => {
    const relationId = upsertRelation(vaultPath, relation('wrong-context'))
    submitRelationFeedback({ vaultPath, relationId, feedbackType: 'not_related' })

    upsertRelation(vaultPath, relation('wrong-context', { confidence: 0.9, localScore: 0.9 }))
    refreshRelationScores({ vaultPath, now })

    const row = await getRelation(relationId)
    expect(row.status).toBe('wrong')
    expect(row.score).toBeLessThan(0.25)
    expect(getContextSuggestions({ vaultPath, entityType: 'note', entityId: 'current-note', limit: 5 }).map((item) => item.relationId)).not.toContain(relationId)
  })
})
