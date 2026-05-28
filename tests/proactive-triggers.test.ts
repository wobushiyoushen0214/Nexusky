import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('proactive-triggers', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-triggers-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function setupNote(id: string, title: string, opts: { updatedAt?: number } = {}) {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    const updated = opts.updatedAt ?? now
    db.prepare(`
      INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, title, `/${id}.md`, now, updated, 'hash-' + id)
  }

  it('long_context_high_score returns candidates from high-score recent ai_relations', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-1', 'Note 1')
    await setupNote('n-2', 'Note 2')

    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, 'note', 'n-1', 'Note 1', '/n-1.md',
                'note', 'n-2', 'Note 2', '/n-2.md',
                'topical', 0.9, 0.9, ?, '[]', 'High overlap', 'active',
                ?, ?, ?, ?)
    `).run('rel-high', 0.85, now, now, now, now)

    db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, 'note', 'n-1', 'Note 1', '/n-1.md',
                'note', 'n-3', 'Note 3', '/n-3.md',
                'topical', 0.5, 0.5, ?, '[]', 'Low overlap', 'active',
                ?, ?, ?, ?)
    `).run('rel-low', 0.5, now, now, now, now)

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-1',
      trigger: 'long_context_high_score',
      now
    })

    expect(candidates.length).toBe(1)
    expect(candidates[0].kind).toBe('relation')
    expect(candidates[0].sourceRef).toBe('rel-high')
    expect(candidates[0].ctaPayload.otherTitle).toBe('Note 2')
    expect(candidates[0].importance).toBeGreaterThanOrEqual(60)
    expect(candidates[0].signature).toContain('rel-high')
  })

  it('theme_proximity matches when keywords overlap meets the threshold', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-10', 'Some Note')

    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO long_term_themes (
        id, title, summary, keywords_json, strength, evidence_count, status,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0.9, 5, 'active', ?, ?, ?, ?)
    `).run('theme-1', 'Productivity', '', JSON.stringify(['focus', 'habit', 'discipline', 'goal']),
            now, now, now, now)

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-10',
      trigger: 'theme_proximity',
      context: {
        content: 'Building a daily focus habit takes discipline and a clear goal.'
      },
      now
    })

    expect(candidates.length).toBe(1)
    expect(candidates[0].kind).toBe('theme_link')
    expect(candidates[0].sourceRef).toBe('theme-1')
    expect((candidates[0].ctaPayload.matchedKeywords as string[]).length).toBeGreaterThanOrEqual(3)
  })

  it('theme_proximity skips themes the note is already a member of', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-20', 'Member Note')

    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO long_term_themes (id, title, summary, keywords_json, strength, evidence_count, status,
        first_seen_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, '', ?, 0.9, 5, 'active', ?, ?, ?, ?)
    `).run('theme-2', 'Writing', JSON.stringify(['draft', 'review', 'publish']), now, now, now, now)

    db.prepare(`
      INSERT INTO theme_memberships (id, theme_id, entity_type, entity_id, entity_title, entity_path,
        confidence, evidence_json, created_at, updated_at)
      VALUES ('mem-1', 'theme-2', 'note', 'n-20', 'Member Note', '/n-20.md', 0.9, '[]', ?, ?)
    `).run(now, now)

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-20',
      trigger: 'theme_proximity',
      context: { content: 'I will draft a review and publish soon.' },
      now
    })

    expect(candidates.length).toBe(0)
  })

  it('cognitive_review_ready emits a single candidate when reviewFilePath is provided', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'vault',
      entityId: 'vault',
      trigger: 'cognitive_review_ready',
      context: {
        reviewFilePath: '.nexusky/reviews/2026-05-23.md',
        reviewTitle: 'Weekly review'
      }
    })

    expect(candidates.length).toBe(1)
    expect(candidates[0].kind).toBe('cognitive_review')
    expect(candidates[0].ctaAction).toBe('open_review')
    expect(candidates[0].ctaPayload.filePath).toBe('.nexusky/reviews/2026-05-23.md')
    expect(candidates[0].signature).toContain('.nexusky/reviews/2026-05-23.md')
  })

  it('cognitive_review_ready returns nothing without reviewFilePath', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'vault',
      entityId: 'vault',
      trigger: 'cognitive_review_ready'
    })

    expect(candidates.length).toBe(0)
  })

  it('stale_island_note flags notes older than 30 days with no links', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')

    const now = Math.floor(Date.now() / 1000)
    const oldTs = now - 40 * 24 * 60 * 60
    await setupNote('n-island', 'Lonely Note', { updatedAt: oldTs })

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-island',
      trigger: 'stale_island_note',
      now
    })

    expect(candidates.length).toBe(1)
    expect(candidates[0].kind).toBe('maintenance')
    expect(candidates[0].sourceRef).toContain('stale_island')
  })

  it('stale_island_note skips fresh notes', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')

    const now = Math.floor(Date.now() / 1000)
    await setupNote('n-fresh', 'Fresh Note', { updatedAt: now })

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-fresh',
      trigger: 'stale_island_note',
      now
    })

    expect(candidates.length).toBe(0)
  })

  it('stale_island_note skips notes that have any link', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    const now = Math.floor(Date.now() / 1000)
    const oldTs = now - 40 * 24 * 60 * 60
    await setupNote('n-with-link', 'Linked Note', { updatedAt: oldTs })
    await setupNote('n-target', 'Target Note', { updatedAt: oldTs })

    const db = getDatabase(vaultPath)
    db.prepare(`
      INSERT INTO links (source_note_id, target_note_id, target_title, line, link_type)
      VALUES (?, ?, ?, 1, 'explicit')
    `).run('n-with-link', 'n-target', 'Target Note')

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-with-link',
      trigger: 'stale_island_note',
      now
    })

    expect(candidates.length).toBe(0)
  })

  it('overdue_task_burst fires when 3+ tasks are overdue', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-tasks', 'Task Hub')

    const db = getDatabase(vaultPath)
    const insert = db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, 0)')
    insert.run('n-tasks', '[ ] Buy groceries 📅 2026-01-01')
    insert.run('n-tasks', '[ ] Email Alice 📅 2026-02-15')
    insert.run('n-tasks', '[ ] Submit report due: 2026-03-10')
    insert.run('n-tasks', '[ ] Future thing 📅 2099-12-31')

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-tasks',
      trigger: 'overdue_task_burst'
    })

    expect(candidates.length).toBe(1)
    expect(candidates[0].kind).toBe('maintenance')
    expect(candidates[0].ctaPayload.overdueCount).toBe(3)
    expect(candidates[0].ctaPayload.earliestDue).toBe('2026-01-01')
  })

  it('overdue_task_burst does not fire when overdue count is below threshold', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-tasks-2', 'Small Task Set')

    const db = getDatabase(vaultPath)
    const insert = db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, 0)')
    insert.run('n-tasks-2', '[ ] Just one 📅 2026-01-01')
    insert.run('n-tasks-2', '[ ] Another 📅 2026-02-01')

    const candidates = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-tasks-2',
      trigger: 'overdue_task_burst'
    })

    expect(candidates.length).toBe(0)
  })

  it('thresholds override loosens the high-score relation cutoff', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS } = await import(
      '../packages/main/src/services/proactive/proactive-policy'
    )
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-30', 'A')
    await setupNote('n-31', 'B')

    const db = getDatabase(vaultPath)
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO ai_relations (
        id, source_type, source_id, source_title, source_path,
        target_type, target_id, target_title, target_path,
        relation_type, confidence, strength, score, evidence_json, reason, status,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, 'note', 'n-30', 'A', '/n-30.md',
                'note', 'n-31', 'B', '/n-31.md',
                'topical', 0.6, 0.6, 0.6, '[]', 'Medium overlap', 'active',
                ?, ?, ?, ?)
    `).run('rel-mid', now, now, now, now)

    const withDefaultThresholds = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-30',
      trigger: 'long_context_high_score',
      now
    })
    expect(withDefaultThresholds.length).toBe(0)

    const withLowered = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-30',
      trigger: 'long_context_high_score',
      now,
      thresholds: {
        ...DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS,
        highScoreThreshold: 0.5
      }
    })
    expect(withLowered.length).toBe(1)
    expect(withLowered[0].sourceRef).toBe('rel-mid')
  })

  it('thresholds override raises the overdue task burst floor', async () => {
    const { evaluateTriggers } = await import('../packages/main/src/services/proactive/proactive-triggers')
    const { DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS } = await import(
      '../packages/main/src/services/proactive/proactive-policy'
    )
    const { getDatabase } = await import('../packages/main/src/services/database')

    await setupNote('n-40', 'Task Hub 2')

    const db = getDatabase(vaultPath)
    const insert = db.prepare('INSERT INTO tasks (note_id, text, done) VALUES (?, ?, 0)')
    insert.run('n-40', '[ ] One 📅 2026-01-01')
    insert.run('n-40', '[ ] Two 📅 2026-02-01')
    insert.run('n-40', '[ ] Three 📅 2026-03-01')

    const baseline = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-40',
      trigger: 'overdue_task_burst'
    })
    expect(baseline.length).toBe(1)

    const raised = evaluateTriggers({
      vaultPath,
      entityType: 'note',
      entityId: 'n-40',
      trigger: 'overdue_task_burst',
      thresholds: { ...DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS, overdueTaskMin: 10 }
    })
    expect(raised.length).toBe(0)
  })
})
