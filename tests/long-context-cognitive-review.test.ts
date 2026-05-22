import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { generateCognitiveReview } from '../packages/main/src/services/long-context/cognitive-review'

describe('long-context cognitive review', () => {
  let vaultPath: string
  const until = 1_800_000_000
  const since = until - 7 * 86_400

  beforeEach(async () => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-review-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const insertNote = db.prepare('INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash) VALUES (?, ?, ?, ?, ?, ?)')
    insertNote.run('n-current', 'Current Automation', 'Current.md', since, until, 'hash-current')
    insertNote.run('n-tool', 'Tool Orchestration', 'Tool.md', since, until, 'hash-tool')
    insertNote.run('n-mcp', 'MCP Experiment', 'MCP.md', since - 45 * 86_400, until, 'hash-mcp')

    insertRelation(db, {
      id: 'rel-new',
      sourceId: 'n-current',
      sourceTitle: 'Current Automation',
      sourcePath: 'Current.md',
      targetId: 'n-tool',
      targetTitle: 'Tool Orchestration',
      targetPath: 'Tool.md',
      relationType: 'supports_goal',
      firstSeenAt: since + 100,
      lastSeenAt: since + 100,
      createdAt: since + 100,
      strength: 1
    })
    insertRelation(db, {
      id: 'rel-resurfaced',
      sourceId: 'n-mcp',
      sourceTitle: 'MCP Experiment',
      sourcePath: 'MCP.md',
      targetId: 'n-current',
      targetTitle: 'Current Automation',
      targetPath: 'Current.md',
      relationType: 'inspired_by',
      firstSeenAt: since - 45 * 86_400,
      lastSeenAt: until - 100,
      createdAt: since - 45 * 86_400,
      strength: 3
    })

    db.prepare(`
      INSERT INTO long_term_themes (
        id, title, summary, keywords_json, strength, evidence_count, status,
        first_seen_at, last_seen_at, created_at, updated_at
      )
      VALUES ('theme-ai', 'AI Automation Workflows', 'Tool use keeps returning as a durable theme.', ?, 0.84, 3, 'active', ?, ?, ?, ?)
    `).run(JSON.stringify(['AI automation', 'tools']), since - 20 * 86_400, until - 200, since - 20 * 86_400, since + 200)

    const insertEvent = db.prepare(`
      INSERT INTO context_events (id, event_type, entity_type, entity_id, entity_title, content_snapshot, created_at)
      VALUES (?, 'ai_question_asked', 'chat', ?, ?, ?, ?)
    `)
    insertEvent.run('event-q1', 'chat-1', 'Chat question', 'How should I automate tool calling?', since + 300)
    insertEvent.run('event-q2', 'chat-2', 'Chat question', 'How should I automate tool calling?', since + 400)

    db.prepare(`
      INSERT INTO kanban_tasks (id, column_id, title, description, sort_order, priority, source_file_path, created_at, updated_at)
      VALUES ('task-blocked', 'col-todo', 'Blocked deployment', 'Waiting for OAuth callback verification', 0, 2, 'Current.md', ?, ?)
    `).run(since + 500, since + 500)
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('generates an evidence-backed cognitive review markdown and can write it to the vault', () => {
    const result = generateCognitiveReview({ vaultPath, since, until })

    expect(result.stats).toMatchObject({
      newRelations: 1,
      themeChanges: 1,
      repeatedQuestions: 1,
      blockers: 1,
      resurfacedContexts: 1
    })
    expect(result.markdown).toContain('## New Relationships')
    expect(result.markdown).toContain('Current Automation')
    expect(result.markdown).toContain('## Theme Changes')
    expect(result.markdown).toContain('AI Automation Workflows')
    expect(result.markdown).toContain('## Forgotten Context Resurfaced')
    expect(result.markdown).toContain('MCP Experiment')
    expect(result.markdown).toContain('not a short-term activity summary')

    const written = generateCognitiveReview({ vaultPath, since, until, write: true })
    expect(written.filePath).toBeDefined()
    const absolutePath = join(vaultPath, written.filePath!)
    expect(existsSync(absolutePath)).toBe(true)
    expect(readFileSync(absolutePath, 'utf-8')).toContain('Cognitive Review')
  })
})

function insertRelation(db: Database.Database, relation: {
  id: string
  sourceId: string
  sourceTitle: string
  sourcePath: string
  targetId: string
  targetTitle: string
  targetPath: string
  relationType: string
  firstSeenAt: number
  lastSeenAt: number
  createdAt: number
  strength: number
}): void {
  db.prepare(`
    INSERT INTO ai_relations (
      id, source_type, source_id, source_title, source_path,
      target_type, target_id, target_title, target_path,
      relation_type, confidence, strength, score, evidence_json, reason, status,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    VALUES (?, 'note', ?, ?, ?, 'note', ?, ?, ?, ?, 0.82, ?, 0.76, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    relation.id,
    relation.sourceId,
    relation.sourceTitle,
    relation.sourcePath,
    relation.targetId,
    relation.targetTitle,
    relation.targetPath,
    relation.relationType,
    relation.strength,
    JSON.stringify(['AI automation evidence', 'External tools evidence']),
    'The notes repeatedly connect AI automation with external tool orchestration.',
    relation.firstSeenAt,
    relation.lastSeenAt,
    relation.createdAt,
    relation.lastSeenAt
  )
}
