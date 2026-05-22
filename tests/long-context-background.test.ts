import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { indexNote } from '../packages/main/src/services/indexer'
import { closeDatabase, getDatabase } from '../packages/main/src/services/database'
import { runLongContextBackgroundCycle } from '../packages/main/src/services/long-context/background'
import { upsertRelation } from '../packages/main/src/services/long-context/relation-store'
import { getLongTermThemes } from '../packages/main/src/services/long-context/theme-extractor'
import type { RelationClassifierProvider } from '../packages/main/src/services/long-context/relation-classifier'
import type { ThemeExtractorProvider } from '../packages/main/src/services/long-context/theme-extractor'

describe('long-context background analysis', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now * 1000)
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-background-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('discovers relations and writes a cognitive-review memory file without a manual refresh', async () => {
    const currentPath = writeNote('Current.md', '# AI Automation\n\nMCP tools help AI automation workflows. #ai')
    const historyPath = writeNote('History.md', '# Tool Orchestration\n\nExternal tools and MCP support AI automation. #ai')
    indexNote(vaultPath, currentPath)
    indexNote(vaultPath, historyPath)
    const db = getDatabase(vaultPath)
    const current = getNote(db, 'Current.md')

    const result = await runLongContextBackgroundCycle({
      vaultPath,
      entityType: 'note',
      entityId: current.id,
      content: readFileSync(currentPath, 'utf-8'),
      eventType: 'note_updated',
      trigger: 'test',
      relationProvider: relationProvider(),
      forceReview: true,
      reviewMinIntervalSeconds: 0
    })

    expect(result.eventRecorded).toBe(true)
    expect(result.discovery.discovered).toBeGreaterThan(0)
    expect(result.review?.filePath).toBe('.nexusky/reviews/2027-01-15-cognitive-review.md')
    expect(existsSync(join(vaultPath, result.review!.filePath!))).toBe(true)
    expect(readFileSync(join(vaultPath, result.review!.filePath!), 'utf-8')).toContain('## New Relationships')

    const events = db.prepare('SELECT event_type as eventType FROM context_events ORDER BY created_at ASC').all() as { eventType: string }[]
    expect(events.map((event) => event.eventType)).toContain('note_updated')
    expect(events.map((event) => event.eventType)).toContain('relation_created')
    expect(events.map((event) => event.eventType)).toContain('cognitive_review_generated')

    const relationCount = db.prepare('SELECT COUNT(*) as count FROM ai_relations').get() as { count: number }
    expect(relationCount.count).toBeGreaterThan(0)
  })

  it('promotes accumulated background relations into durable themes', async () => {
    const currentPath = writeNote('Current.md', '# AI Automation\n\nMCP tools help AI automation workflows. #ai')
    const historyPath = writeNote('History.md', '# Tool Orchestration\n\nExternal tools and MCP support AI automation. #ai')
    const oldPath = writeNote('Old.md', '# Automation Notes\n\nEarlier AI automation experiments used tool calling. #ai')
    indexNote(vaultPath, currentPath)
    indexNote(vaultPath, historyPath)
    indexNote(vaultPath, oldPath)

    const db = getDatabase(vaultPath)
    const current = getNote(db, 'Current.md')
    const old = getNote(db, 'Old.md')

    vi.setSystemTime((now - 8 * 86_400) * 1000)
    upsertRelation(vaultPath, {
      sourceType: 'note',
      sourceId: current.id,
      sourceTitle: current.title,
      sourcePath: current.filePath,
      targetType: 'note',
      targetId: old.id,
      targetTitle: old.title,
      targetPath: old.filePath,
      relationType: 'supports_goal',
      confidence: 0.86,
      localScore: 0.82,
      evidence: ['AI automation uses external tools.', 'MCP tool calling appears in both notes.'],
      reason: 'Both notes describe AI automation through external tool orchestration.'
    })

    vi.setSystemTime(now * 1000)
    const result = await runLongContextBackgroundCycle({
      vaultPath,
      entityType: 'note',
      entityId: current.id,
      content: readFileSync(currentPath, 'utf-8'),
      eventType: 'note_updated',
      trigger: 'test',
      relationProvider: relationProvider(),
      themeProvider: themeProvider(),
      forceThemeExtraction: true,
      forceReview: true,
      reviewMinIntervalSeconds: 0
    })

    expect(result.discovery.discovered).toBeGreaterThan(0)
    expect(result.themes.created).toBeGreaterThan(0)
    const themes = getLongTermThemes(vaultPath)
    expect(themes[0].title).toBe('AI Automation Workflows')
    expect(themes[0].memberships.length).toBeGreaterThanOrEqual(3)
  })

  function writeNote(fileName: string, content: string): string {
    const filePath = join(vaultPath, fileName)
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  }
})

function getNote(db: Database.Database, filePath: string): { id: string; title: string; filePath: string } {
  return db.prepare('SELECT id, title, file_path as filePath FROM notes WHERE file_path = ?').get(filePath) as { id: string; title: string; filePath: string }
}

function relationProvider(): RelationClassifierProvider {
  return {
    async *chatStream() {
      yield {
        type: 'text',
        content: JSON.stringify({
          relationType: 'supports_goal',
          confidence: 0.88,
          reason: 'Both items connect AI automation with MCP and external tool orchestration.',
          evidence: ['MCP tools help AI automation workflows.', 'External tools and MCP support AI automation.']
        })
      }
    }
  }
}

function themeProvider(): ThemeExtractorProvider {
  return {
    async *chatStream() {
      yield {
        type: 'text',
        content: JSON.stringify({
          title: 'AI Automation Workflows',
          summary: 'AI tool orchestration keeps recurring across the user knowledge base.',
          keywords: ['AI automation', 'MCP', 'tool orchestration'],
          confidence: 0.9
        })
      }
    }
  }
}
