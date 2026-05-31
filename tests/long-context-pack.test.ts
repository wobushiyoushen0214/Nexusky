import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLongContextPack } from '../packages/main/src/services/long-context/context-pack-builder'
import { upsertRelation } from '../packages/main/src/services/long-context/relation-store'

describe('long-context context pack builder', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(async () => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-pack-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const insertNote = db.prepare('INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash) VALUES (?, ?, ?, ?, ?, ?)')
    insertNote.run('n-current', 'Current', 'Current.md', now, now, 'hash-current')
    insertNote.run('n-tool', 'Tool Orchestration', 'Tool.md', now, now, 'hash-tool')
    insertNote.run('n-mcp', 'MCP Experiment', 'MCP.md', now, now, 'hash-mcp')

    upsertRelation(vaultPath, {
      sourceType: 'note',
      sourceId: 'n-current',
      sourceTitle: 'Current',
      sourcePath: 'Current.md',
      targetType: 'note',
      targetId: 'n-tool',
      targetTitle: 'Tool Orchestration',
      targetPath: 'Tool.md',
      relationType: 'supports_goal',
      confidence: 0.84,
      localScore: 0.78,
      evidence: ['Current note mentions AI automation', 'Tool note explains external tool orchestration'],
      reason: 'Both notes connect AI automation with external tool orchestration.'
    })
    upsertRelation(vaultPath, {
      sourceType: 'note',
      sourceId: 'n-current',
      sourceTitle: 'Current',
      sourcePath: 'Current.md',
      targetType: 'note',
      targetId: 'n-mcp',
      targetTitle: 'MCP Experiment',
      targetPath: 'MCP.md',
      relationType: 'inspired_by',
      confidence: 0.76,
      localScore: 0.66,
      evidence: ['MCP experiment tested tool calls', 'Current note revisits AI workflow automation'],
      reason: 'The older MCP experiment may inspire the current automation workflow.'
    })

    db.prepare(`
      INSERT INTO long_term_themes (
        id, title, summary, keywords_json, strength, evidence_count, status,
        first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES ('theme-ai', 'AI Automation Workflows', 'Repeated work on AI automation and external tools.', ?, 0.82, 3, 'active', ?, ?, ?, ?)
    `).run(JSON.stringify(['AI automation', 'tool orchestration']), now - 10 * 86_400, now, now, now)
    db.prepare(`
      INSERT INTO theme_memberships (
        id, theme_id, entity_type, entity_id, entity_title, entity_path, confidence, evidence_json, created_at, updated_at
      )
      VALUES ('tm-current', 'theme-ai', 'note', 'n-current', 'Current', 'Current.md', 0.82, ?, ?, ?)
    `).run(JSON.stringify(['Current note mentions AI automation']), now, now)
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('builds hot, warm, and cold memory with evidence under the token budget', () => {
    const pack = buildLongContextPack({
      vaultPath,
      currentFilePath: join(vaultPath, 'Current.md'),
      tokenBudget: 600,
      hotLimit: 1,
      warmLimit: 1,
      coldLimit: 2,
      language: 'en'
    })

    expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.tokenBudget)
    expect(pack.hot).toHaveLength(1)
    expect(pack.warm).toHaveLength(1)
    expect(pack.cold.length).toBeGreaterThanOrEqual(1)
    expect(pack.systemText).toContain('Hot Memory')
    expect(pack.systemText).toContain('Warm Memory')
    expect(pack.systemText).toContain('Cold Memory')
    expect(pack.systemText).toContain('evidence:')
    expect(pack.sources.map((source) => source.filePath)).toEqual(expect.arrayContaining(['Tool.md', 'Current.md']))
  })

  it('formats archived context in Simplified Chinese when requested', () => {
    const pack = buildLongContextPack({
      vaultPath,
      currentFilePath: join(vaultPath, 'Current.md'),
      tokenBudget: 600,
      hotLimit: 1,
      warmLimit: 1,
      coldLimit: 2,
      language: 'zh-CN'
    })

    expect(pack.systemText).toContain('活跃记忆')
    expect(pack.systemText).toContain('邻近记忆')
    expect(pack.systemText).toContain('归档记忆')
    expect(pack.systemText).toContain('证据:')
    expect(pack.systemText).not.toContain('supports_goal')
  })
})
