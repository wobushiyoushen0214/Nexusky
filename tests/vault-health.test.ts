import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('vault-health', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-vault-health-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function seed(notes: Array<{ id: string; title: string; updatedAt?: number }>) {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    for (const note of notes) {
      const updated = note.updatedAt ?? now
      db.prepare(`
        INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(note.id, note.title, `/${note.id}.md`, now, updated, 'hash-' + note.id)
    }
  }

  it('returns zeroed counts for an empty vault', async () => {
    const { scanVaultHealth } = await import('../packages/main/src/services/vault-health')
    const summary = scanVaultHealth(vaultPath, 1_800_000_000)
    expect(summary).toMatchObject({
      noteCount: 0,
      linkCount: 0,
      unresolvedLinkCount: 0,
      orphanCount: 0,
      openTaskCount: 0,
      duplicateTitleCount: 0,
      missingMemoryCount: 0,
      staleNoteCount: 0
    })
    expect(summary.score).toBeGreaterThanOrEqual(0)
    expect(summary.score).toBeLessThanOrEqual(100)
    expect(summary.scoreFactors).toHaveLength(6)
    expect(summary.trend).toHaveLength(1)
    expect(summary.trend[0]).toMatchObject({
      snapshotDate: '2027-01-15',
      score: summary.score,
      noteCount: 0,
      repairSignalCount: 0
    })
  })

  it('counts notes, links, orphans, duplicates, tasks, and stale notes', async () => {
    const { scanVaultHealth } = await import('../packages/main/src/services/vault-health')
    const { getDatabase } = await import('../packages/main/src/services/database')
    const now = Math.floor(Date.now() / 1000)
    const ancient = now - 90 * 24 * 60 * 60

    await seed([
      { id: 'a', title: 'Shared' },
      { id: 'b', title: 'Shared' },
      { id: 'c', title: 'Lonely', updatedAt: ancient },
      { id: 'd', title: 'Linked' }
    ])

    const db = getDatabase(vaultPath)
    db.prepare(`
      INSERT INTO links (source_note_id, target_note_id, target_title, line, link_type)
      VALUES ('a', 'd', 'Linked', 1, 'explicit')
    `).run()
    db.prepare(`
      INSERT INTO links (source_note_id, target_note_id, target_title, line, link_type)
      VALUES ('a', NULL, 'Missing', 2, 'explicit')
    `).run()
    db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, 0)').run('a', '[ ] write tests')
    db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, 1)').run('a', '[x] already done')

    const summary = scanVaultHealth(vaultPath, now)
    expect(summary.noteCount).toBe(4)
    expect(summary.linkCount).toBe(2)
    expect(summary.unresolvedLinkCount).toBe(1)
    expect(summary.openTaskCount).toBe(1)
    expect(summary.duplicateTitleCount).toBe(1)
    expect(summary.orphanCount).toBe(2) // c and b have no links
    expect(summary.staleNoteCount).toBe(1)
    expect(summary.score).toBeLessThan(100)
    expect(summary.scoreFactors.find((factor) => factor.id === 'links')?.issueCount).toBe(1)
    expect(summary.scoreFactors.find((factor) => factor.id === 'structure')?.impact).toBeGreaterThan(0)
  })

  it('counts notes whose memory file is missing from .nexusky/memories', async () => {
    const { scanVaultHealth } = await import('../packages/main/src/services/vault-health')
    await seed([
      { id: 'm1', title: 'One' },
      { id: 'm2', title: 'Two' },
      { id: 'm3', title: 'Three' }
    ])
    const memDir = join(vaultPath, '.nexusky', 'memories')
    mkdirSync(memDir, { recursive: true })
    writeFileSync(join(memDir, 'm1.json'), '{}')

    const summary = scanVaultHealth(vaultPath)
    expect(summary.missingMemoryCount).toBe(2)
  })

  it('treats all notes as missing memory when the directory does not exist', async () => {
    const { scanVaultHealth } = await import('../packages/main/src/services/vault-health')
    await seed([{ id: 'only', title: 'Only' }])
    const summary = scanVaultHealth(vaultPath)
    expect(summary.missingMemoryCount).toBe(1)
  })

  it('does not penalize local-only vaults when sync has no pending work', async () => {
    const { buildScoreFactors } = await import('../packages/main/src/services/vault-health')
    const factors = buildScoreFactors({
      noteCount: 1,
      linkCount: 1,
      unresolvedLinkCount: 0,
      orphanCount: 0,
      openTaskCount: 0,
      duplicateTitleCount: 0,
      missingMemoryCount: 0,
      staleNoteCount: 0
    }, {
      status: 'idle',
      activeProviderConfigured: false,
      offlineQueueSize: 0,
      conflicts: 0,
      errors: 0
    })

    expect(factors.find((factor) => factor.id === 'sync')).toMatchObject({
      score: 100,
      impact: 0,
      status: 'good'
    })
  })

  it('keeps the latest snapshot per week for the 8-week health trend', async () => {
    const { scanVaultHealth, getVaultHealthTrend } = await import('../packages/main/src/services/vault-health')
    await seed([{ id: 'a', title: 'A' }])

    const week1 = Math.floor(Date.UTC(2026, 0, 5) / 1000)
    const week1Later = Math.floor(Date.UTC(2026, 0, 7) / 1000)
    const week2 = Math.floor(Date.UTC(2026, 0, 12) / 1000)

    scanVaultHealth(vaultPath, week1)
    const db = (await import('../packages/main/src/services/database')).getDatabase(vaultPath)
    db.prepare(`
      INSERT INTO links (source_note_id, target_note_id, target_title, line, link_type)
      VALUES ('a', NULL, 'Missing', 1, 'explicit')
    `).run()
    const later = scanVaultHealth(vaultPath, week1Later)
    const second = scanVaultHealth(vaultPath, week2)
    const trend = getVaultHealthTrend(vaultPath, week2, 8)

    expect(trend).toHaveLength(2)
    expect(trend[0]).toMatchObject({
      weekStart: '2026-01-05',
      snapshotDate: '2026-01-07',
      score: later.score
    })
    expect(trend[1]).toMatchObject({
      weekStart: '2026-01-12',
      snapshotDate: '2026-01-12',
      score: second.score
    })
  })
})
