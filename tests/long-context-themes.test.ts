import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../packages/main/src/services/ai'
import {
  extractLongTermThemes,
  getLongTermThemes,
  type ThemeExtractorProvider
} from '../packages/main/src/services/long-context/theme-extractor'

describe('long-context theme extractor', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-themes-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function insertRelation(id: string, sourceId: string, targetId: string, firstSeenAt: number, lastSeenAt: number, score = 0.78): Promise<void> {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES (?, 'note', ?, ?, ?, 'note', ?, ?, ?, 'supports_goal', 0.82, 1, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      id,
      sourceId,
      `AI Automation ${sourceId}`,
      `${sourceId}.md`,
      targetId,
      `AI Automation ${targetId}`,
      `${targetId}.md`,
      score,
      JSON.stringify(['AI automation workflow evidence', 'External tool orchestration evidence']),
      'AI automation workflow and external tool orchestration recur across these notes.',
      firstSeenAt,
      lastSeenAt,
      firstSeenAt,
      lastSeenAt
    )
  }

  it('creates a long-term theme with memberships from high-score relations spanning seven days', async () => {
    const provider: ThemeExtractorProvider = {
      async *chatStream(_messages: ChatMessage[], _signal?: AbortSignal, _options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
        yield {
          type: 'text',
          content: '{"title":"AI Automation Workflows","summary":"The notes repeatedly connect AI automation with external tool orchestration.","keywords":["AI automation","tool orchestration"],"confidence":0.9}'
        }
      }
    }
    await insertRelation('r1', 'n1', 'n2', now - 10 * 86_400, now - 9 * 86_400)
    await insertRelation('r2', 'n2', 'n3', now - 8 * 86_400, now)

    const result = await extractLongTermThemes({ vaultPath, limit: 1, provider })
    const themes = getLongTermThemes(vaultPath)

    expect(result).toEqual({ created: 1, updated: 0 })
    expect(themes[0]).toMatchObject({
      title: 'AI Automation Workflows',
      evidenceCount: 3
    })
    expect(themes[0].memberships.map((membership) => membership.entityId).sort()).toEqual(['n1', 'n2', 'n3'])

    const { getDatabase } = await import('../packages/main/src/services/database')
    const membershipCount = getDatabase(vaultPath).prepare('SELECT COUNT(*) as count FROM theme_memberships WHERE theme_id = ?').get(themes[0].id) as { count: number }
    expect(membershipCount.count).toBe(3)
  })

  it('asks the theme extractor to write durable theme text in the active language', async () => {
    let systemPrompt = ''
    const provider: ThemeExtractorProvider = {
      async *chatStream(messages: ChatMessage[], _signal?: AbortSignal, _options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
        systemPrompt = String(messages[0].content)
        yield {
          type: 'text',
          content: '{"title":"自动化工作流","summary":"这些笔记反复连接 AI 自动化与外部工具编排。","keywords":["AI 自动化","工具编排"],"confidence":0.9}'
        }
      }
    }
    await insertRelation('r1', 'n1', 'n2', now - 10 * 86_400, now - 9 * 86_400)
    await insertRelation('r2', 'n2', 'n3', now - 8 * 86_400, now)

    const result = await extractLongTermThemes({ vaultPath, limit: 1, provider, language: 'zh-CN' })

    expect(result).toEqual({ created: 1, updated: 0 })
    expect(systemPrompt).toContain('Write title, summary, and keywords in Simplified Chinese')
    expect(getLongTermThemes(vaultPath)[0].title).toBe('自动化工作流')
  })

  it('does not create a theme with fewer than three evidence entities', async () => {
    await insertRelation('r1', 'n1', 'n2', now - 10 * 86_400, now)

    await expect(extractLongTermThemes({ vaultPath, limit: 5 })).resolves.toEqual({ created: 0, updated: 0 })
    expect(getLongTermThemes(vaultPath)).toEqual([])
  })

  it('does not create a theme when the time span is too short', async () => {
    await insertRelation('r1', 'n1', 'n2', now - 2 * 86_400, now - 86_400)
    await insertRelation('r2', 'n2', 'n3', now - 86_400, now)

    await expect(extractLongTermThemes({ vaultPath, limit: 5 })).resolves.toEqual({ created: 0, updated: 0 })
    expect(getLongTermThemes(vaultPath)).toEqual([])
  })
})
