import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('proactive-orchestrator', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-orchestrator-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function setupRelation(score = 0.9) {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)

    db.prepare(`
      INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash)
      VALUES ('n-src', 'Source', '/n-src.md', ?, ?, 'h1'),
             ('n-tgt', 'Target', '/n-tgt.md', ?, ?, 'h2')
    `).run(now, now, now, now)

    db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, 'note', 'n-src', 'Source', '/n-src.md',
                'note', 'n-tgt', 'Target', '/n-tgt.md',
                'topical', 0.9, 0.9, ?, '[]', 'Overlap', 'active',
                ?, ?, ?, ?)
    `).run('rel-A', score, now, now, now, now)

    return now
  }

  it('evaluates candidates and emits a pending suggestion via upsert', async () => {
    const { runProactiveCycle } = await import('../packages/main/src/services/proactive/proactive-orchestrator')
    const { listSuggestions } = await import('../packages/main/src/services/proactive/proactive-store')

    const now = await setupRelation()

    const result = runProactiveCycle({
      vaultPath,
      entityType: 'note',
      entityId: 'n-src',
      trigger: 'long_context_high_score',
      now
    })

    expect(result.evaluated).toBe(1)
    expect(result.emitted).toBe(1)
    expect(result.suggestions[0].status).toBe('pending')

    const pending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(pending.length).toBe(1)
    expect(pending[0].signature).toContain('rel-A')
  })

  it('records skippedReasons when policy blocks emission', async () => {
    const { runProactiveCycle } = await import('../packages/main/src/services/proactive/proactive-orchestrator')

    const now = await setupRelation()

    const first = runProactiveCycle({
      vaultPath, entityType: 'note', entityId: 'n-src',
      trigger: 'long_context_high_score', now
    })
    expect(first.emitted).toBe(1)

    const second = runProactiveCycle({
      vaultPath, entityType: 'note', entityId: 'n-src',
      trigger: 'long_context_high_score', now
    })
    expect(second.emitted).toBe(0)
    expect(second.skippedReasons.duplicate_pending).toBe(1)
  })

  it('reactivates a snoozed suggestion once its snooze_until has passed', async () => {
    const { runProactiveCycle } = await import('../packages/main/src/services/proactive/proactive-orchestrator')
    const { listSuggestions, updateStatus, getSuggestionById } = await import(
      '../packages/main/src/services/proactive/proactive-store'
    )

    const now = await setupRelation()

    const first = runProactiveCycle({
      vaultPath, entityType: 'note', entityId: 'n-src',
      trigger: 'long_context_high_score', now
    })
    const created = first.suggestions[0]
    expect(created).toBeTruthy()

    updateStatus(vaultPath, { id: created.id, status: 'snoozed', snoozeUntil: now - 60 })

    const later = now + 86400
    const second = runProactiveCycle({
      vaultPath, entityType: 'note', entityId: 'n-src',
      trigger: 'long_context_high_score', now: later,
      userPrefs: { maxPerDay: 100 }
    })

    expect(second.emitted).toBe(1)
    const after = getSuggestionById(vaultPath, created.id)
    expect(after?.status).toBe('pending')
    expect(after?.snoozeUntil).toBeNull()
    expect(after?.shownAt).toBeNull()
    expect(after?.respondedAt).toBeNull()

    const pending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(pending.map((row) => row.id)).toEqual([created.id])
  })

  it('respects userPrefs override even when store has different values', async () => {
    const { runProactiveCycle } = await import('../packages/main/src/services/proactive/proactive-orchestrator')

    const now = await setupRelation()

    const result = runProactiveCycle({
      vaultPath, entityType: 'note', entityId: 'n-src',
      trigger: 'long_context_high_score', now,
      userPrefs: { enabled: false }
    })

    expect(result.evaluated).toBe(1)
    expect(result.emitted).toBe(0)
    expect(result.skippedReasons.disabled).toBe(1)
  })
})
