import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { indexNote } from '../packages/main/src/services/indexer'
import { closeDatabase, getDatabase } from '../packages/main/src/services/database'
import { runLongContextBackgroundCycle } from '../packages/main/src/services/long-context/background'
import {
  listSuggestions,
  type ProactiveSuggestionRow
} from '../packages/main/src/services/proactive/proactive-store'
import {
  subscribeProactiveEmitted,
  clearProactiveEmittedListeners
} from '../packages/main/src/services/proactive/proactive-broadcaster'
import type { RelationClassifierProvider } from '../packages/main/src/services/long-context/relation-classifier'

describe('proactive background integration', () => {
  let vaultPath: string
  const now = 1_800_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now * 1000)
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-bg-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
    clearProactiveEmittedListeners()
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    clearProactiveEmittedListeners()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  function writeNote(fileName: string, content: string): string {
    const filePath = join(vaultPath, fileName)
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  function getNote(db: Database.Database, filePath: string): { id: string; title: string } {
    return db.prepare('SELECT id, title FROM notes WHERE file_path = ?').get(filePath) as { id: string; title: string }
  }

  it('emits a pending suggestion after the long-context background cycle discovers a high-score relation', async () => {
    const currentPath = writeNote('Current.md', '# AI Automation\n\nMCP tools help AI automation workflows. #ai')
    const historyPath = writeNote('History.md', '# Tool Orchestration\n\nExternal tools and MCP support AI automation. #ai')
    indexNote(vaultPath, currentPath)
    indexNote(vaultPath, historyPath)
    const db = getDatabase(vaultPath)
    const current = getNote(db, 'Current.md')

    const emitted: ProactiveSuggestionRow[] = []
    subscribeProactiveEmitted((s) => emitted.push(s))

    const result = await runLongContextBackgroundCycle({
      vaultPath,
      entityType: 'note',
      entityId: current.id,
      content: readFileSync(currentPath, 'utf-8'),
      eventType: 'note_updated',
      trigger: 'test',
      relationProvider: relationProvider(),
      writeReview: false,
      reviewMinIntervalSeconds: 365 * 86_400
    })

    expect(result.discovery.discovered).toBeGreaterThan(0)

    const pending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(pending.length).toBeGreaterThan(0)
    expect(pending[0].kind).toBe('relation')

    expect(emitted.length).toBeGreaterThan(0)
    expect(emitted[0].kind).toBe('relation')
  })

  it('emits a cognitive_review suggestion when a review is generated', async () => {
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

    expect(result.review?.filePath).toBeTruthy()

    const reviewSuggestions = listSuggestions(vaultPath, { status: ['pending'] })
      .filter((row) => row.kind === 'cognitive_review')
    expect(reviewSuggestions.length).toBe(1)
    expect(reviewSuggestions[0].ctaAction).toBe('open_review')
  })
})

function relationProvider(): RelationClassifierProvider {
  return {
    async *chatStream() {
      yield {
        type: 'text',
        content: JSON.stringify({
          relationType: 'supports_goal',
          confidence: 0.92,
          reason: 'Both items connect AI automation with MCP and external tool orchestration.',
          evidence: ['MCP tools help AI automation workflows.', 'External tools and MCP support AI automation.']
        })
      }
    }
  }
}
