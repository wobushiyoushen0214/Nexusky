import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../packages/main/src/services/ai'
import { getLongContextMetrics, recordContextEvent } from '../packages/main/src/services/long-context/context-events'
import { extractLongTermThemes, type ThemeExtractorProvider } from '../packages/main/src/services/long-context/theme-extractor'
import { submitRelationFeedback, upsertRelation } from '../packages/main/src/services/long-context/relation-store'

describe('long-context metrics', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-metrics-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('records suggestion, feedback, relation, and theme metrics with rates', async () => {
    recordContextEvent({
      vaultPath,
      eventType: 'suggestion_shown',
      entityType: 'note',
      entityId: 'current',
      metadata: { relationId: 'r1' },
      createdAt: now
    })
    recordContextEvent({
      vaultPath,
      eventType: 'suggestion_shown',
      entityType: 'note',
      entityId: 'current',
      metadata: { relationId: 'r2' },
      createdAt: now
    })
    recordContextEvent({
      vaultPath,
      eventType: 'suggestion_opened',
      entityType: 'note',
      entityId: 'current',
      metadata: { relationId: 'r1' },
      createdAt: now
    })
    recordContextEvent({
      vaultPath,
      eventType: 'relation_feedback_submitted',
      entityType: 'relation',
      entityId: 'r1',
      metadata: { feedbackType: 'useful' },
      createdAt: now
    })
    recordContextEvent({
      vaultPath,
      eventType: 'relation_feedback_submitted',
      entityType: 'relation',
      entityId: 'r2',
      metadata: { feedbackType: 'not_related' },
      createdAt: now
    })

    const metrics = getLongContextMetrics({ vaultPath, since: now - 10, until: now + 10 })

    expect(metrics.counts).toMatchObject({
      suggestionShown: 2,
      suggestionOpened: 1,
      suggestionUseful: 1,
      suggestionNotRelated: 1
    })
    expect(metrics.rates).toMatchObject({
      usefulRate: 0.5,
      openRate: 0.5,
      notRelatedRate: 0.5
    })
  })

  it('records relation created and reinforced events from upsertRelation', async () => {
    const relation = {
      sourceType: 'note' as const,
      sourceId: 'current',
      sourceTitle: 'Current',
      sourcePath: 'Current.md',
      targetType: 'note' as const,
      targetId: 'target',
      targetTitle: 'Target',
      targetPath: 'Target.md',
      relationType: 'supports_goal' as const,
      confidence: 0.78,
      localScore: 0.7,
      evidence: ['Current mentions automation', 'Target mentions tool orchestration'],
      reason: 'Both notes discuss the same automation workflow.'
    }

    const relationId = upsertRelation(vaultPath, relation)
    upsertRelation(vaultPath, relation)
    submitRelationFeedback({ vaultPath, relationId, feedbackType: 'dismissed' })
    recordContextEvent({
      vaultPath,
      eventType: 'relation_feedback_submitted',
      entityType: 'relation',
      entityId: relationId,
      metadata: { feedbackType: 'dismissed' }
    })

    const metrics = getLongContextMetrics({ vaultPath })

    expect(metrics.counts.relationCreated).toBe(1)
    expect(metrics.counts.relationReinforced).toBe(1)
    expect(metrics.counts.suggestionDismissed).toBe(1)
  })

  it('records theme_created events from theme extraction', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const insertRelation = db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES (?, 'note', ?, ?, ?, 'note', ?, ?, ?, 'supports_goal', 0.82, 1, 0.78, ?, ?, 'active', ?, ?, ?, ?)
    `)
    const evidence = JSON.stringify(['AI automation workflow evidence', 'External tool orchestration evidence'])
    const reason = 'AI automation workflow and external tool orchestration recur across these notes.'
    insertRelation.run('r1', 'n1', 'AI Automation n1', 'n1.md', 'n2', 'AI Automation n2', 'n2.md', evidence, reason, now - 10 * 86_400, now - 9 * 86_400, now - 10 * 86_400, now - 9 * 86_400)
    insertRelation.run('r2', 'n2', 'AI Automation n2', 'n2.md', 'n3', 'AI Automation n3', 'n3.md', evidence, reason, now - 8 * 86_400, now, now - 8 * 86_400, now)

    const provider: ThemeExtractorProvider = {
      async *chatStream(_messages: ChatMessage[], _signal?: AbortSignal, _options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
        yield {
          type: 'text',
          content: '{"title":"AI Automation Workflows","summary":"The notes repeatedly connect AI automation with external tool orchestration.","keywords":["AI automation"],"confidence":0.9}'
        }
      }
    }

    await extractLongTermThemes({ vaultPath, limit: 1, provider })

    expect(getLongContextMetrics({ vaultPath }).counts.themeCreated).toBe(1)
  })

  it('groups events into per-day buckets with weighted rates over the window', () => {
    const day = 86_400
    const dayAStart = Math.floor((now - 2 * day) / day) * day
    const dayBStart = Math.floor(now / day) * day

    // Day A: 2 shown, 1 opened, 1 useful  ->  usefulRate 0.5, openRate 0.5
    recordContextEvent({ vaultPath, eventType: 'suggestion_shown', entityType: 'note', entityId: 'a', metadata: { relationId: 'rA1' }, createdAt: dayAStart + 10 })
    recordContextEvent({ vaultPath, eventType: 'suggestion_shown', entityType: 'note', entityId: 'a', metadata: { relationId: 'rA2' }, createdAt: dayAStart + 20 })
    recordContextEvent({ vaultPath, eventType: 'suggestion_opened', entityType: 'note', entityId: 'a', metadata: { relationId: 'rA1' }, createdAt: dayAStart + 30 })
    recordContextEvent({ vaultPath, eventType: 'relation_feedback_submitted', entityType: 'relation', entityId: 'rA1', metadata: { feedbackType: 'useful' }, createdAt: dayAStart + 40 })

    // Day B: 1 shown, 1 not_related  ->  usefulRate 0, notRelatedRate 1
    recordContextEvent({ vaultPath, eventType: 'suggestion_shown', entityType: 'note', entityId: 'b', metadata: { relationId: 'rB1' }, createdAt: dayBStart + 10 })
    recordContextEvent({ vaultPath, eventType: 'relation_feedback_submitted', entityType: 'relation', entityId: 'rB1', metadata: { feedbackType: 'not_related' }, createdAt: dayBStart + 20 })

    const metrics = getLongContextMetrics({ vaultPath, since: dayAStart, until: dayBStart + day - 1 })

    expect(metrics.series.bucketSizeSec).toBe(day)
    expect(metrics.series.buckets.length).toBeGreaterThanOrEqual(3)

    const dayABucket = metrics.series.buckets.find((b) => b.bucketStart === dayAStart)
    expect(dayABucket).toBeDefined()
    expect(dayABucket!.shown).toBe(2)
    expect(dayABucket!.opened).toBe(1)
    expect(dayABucket!.useful).toBe(1)
    expect(dayABucket!.notRelated).toBe(0)
    expect(dayABucket!.usefulRate).toBe(0.5)
    expect(dayABucket!.openRate).toBe(0.5)
    expect(dayABucket!.notRelatedRate).toBe(0)

    const dayBBucket = metrics.series.buckets.find((b) => b.bucketStart === dayBStart)
    expect(dayBBucket).toBeDefined()
    expect(dayBBucket!.shown).toBe(1)
    expect(dayBBucket!.useful).toBe(0)
    expect(dayBBucket!.notRelated).toBe(1)
    expect(dayBBucket!.notRelatedRate).toBe(1)

    // Empty middle day should still be present with zero rates
    const middleBucket = metrics.series.buckets.find((b) => b.bucketStart === dayAStart + day)
    expect(middleBucket).toBeDefined()
    expect(middleBucket!.shown).toBe(0)
    expect(middleBucket!.usefulRate).toBe(0)

    // Buckets must be strictly ordered
    for (let i = 1; i < metrics.series.buckets.length; i += 1) {
      expect(metrics.series.buckets[i].bucketStart).toBeGreaterThan(metrics.series.buckets[i - 1].bucketStart)
    }
  })
})
