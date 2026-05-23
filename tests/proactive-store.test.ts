import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('proactive-store', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-store-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('upsert is idempotent on signature and updates mutable fields', async () => {
    const { upsertSuggestion, listSuggestions } = await import('../packages/main/src/services/proactive/proactive-store')

    const first = upsertSuggestion(vaultPath, {
      kind: 'relation',
      sourceRef: 'rel-1',
      entityType: 'note',
      entityId: 'note-1',
      title: 'Initial title',
      body: 'Initial body',
      ctaAction: 'open_note',
      ctaPayload: { path: '/foo.md' },
      importance: 70,
      signature: 'relation|rel-1|note-1'
    })

    expect(first.id).toBeTruthy()
    expect(first.status).toBe('pending')
    expect(first.importance).toBe(70)
    expect(first.ctaPayload).toEqual({ path: '/foo.md' })

    const second = upsertSuggestion(vaultPath, {
      kind: 'relation',
      sourceRef: 'rel-1',
      entityType: 'note',
      entityId: 'note-1',
      title: 'Updated title',
      body: 'Updated body',
      ctaAction: 'open_note',
      ctaPayload: { path: '/foo.md', extra: true },
      importance: 90,
      signature: 'relation|rel-1|note-1'
    })

    expect(second.id).toBe(first.id)
    expect(second.title).toBe('Updated title')
    expect(second.body).toBe('Updated body')
    expect(second.importance).toBe(90)
    expect(second.ctaPayload).toEqual({ path: '/foo.md', extra: true })

    const all = listSuggestions(vaultPath, { status: ['pending'] })
    expect(all.length).toBe(1)
    expect(all[0].id).toBe(first.id)
  })

  it('clamps importance to 0-100 and defaults missing body/payload', async () => {
    const { upsertSuggestion } = await import('../packages/main/src/services/proactive/proactive-store')

    const high = upsertSuggestion(vaultPath, {
      kind: 'cognitive_review',
      sourceRef: 'review-1',
      title: 'Review ready',
      ctaAction: 'open_review',
      importance: 9999,
      signature: 'cognitive_review|review-1|vault'
    })
    expect(high.importance).toBe(100)
    expect(high.body).toBe('')
    expect(high.ctaPayload).toEqual({})

    const low = upsertSuggestion(vaultPath, {
      kind: 'maintenance',
      sourceRef: 'maint-1',
      title: 'Maintenance',
      ctaAction: 'open_queue',
      importance: -5,
      signature: 'maintenance|maint-1|vault'
    })
    expect(low.importance).toBe(0)
  })

  it('listSuggestions filters by status, entity, and applies limit/order', async () => {
    const { upsertSuggestion, listSuggestions, updateStatus } = await import(
      '../packages/main/src/services/proactive/proactive-store'
    )

    const a = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-a', entityType: 'note', entityId: 'n-1',
      title: 'A', ctaAction: 'open_note', importance: 50, signature: 'sig-a'
    })
    const b = upsertSuggestion(vaultPath, {
      kind: 'theme_link', sourceRef: 'r-b', entityType: 'note', entityId: 'n-2',
      title: 'B', ctaAction: 'open_note', importance: 90, signature: 'sig-b'
    })
    const c = upsertSuggestion(vaultPath, {
      kind: 'maintenance', sourceRef: 'r-c', entityType: 'note', entityId: 'n-1',
      title: 'C', ctaAction: 'open_queue', importance: 70, signature: 'sig-c'
    })

    const pending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(pending.map((row) => row.id)).toEqual([b.id, c.id, a.id])

    updateStatus(vaultPath, { id: b.id, status: 'dismissed' })
    const stillPending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(stillPending.map((row) => row.id)).toEqual([c.id, a.id])

    const forNote1 = listSuggestions(vaultPath, { entityType: 'note', entityId: 'n-1' })
    expect(forNote1.map((row) => row.id).sort()).toEqual([a.id, c.id].sort())

    const limited = listSuggestions(vaultPath, { status: ['pending'], limit: 1 })
    expect(limited.length).toBe(1)
    expect(limited[0].id).toBe(c.id)
  })

  it('updateStatus auto-fills shown_at and responded_at and supports snoozeUntil', async () => {
    const { upsertSuggestion, updateStatus, getSuggestionById } = await import(
      '../packages/main/src/services/proactive/proactive-store'
    )

    const created = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-1', title: 'X',
      ctaAction: 'open_note', signature: 'sig-1'
    })

    const shown = updateStatus(vaultPath, { id: created.id, status: 'shown' })
    expect(shown?.status).toBe('shown')
    expect(shown?.shownAt).toBeGreaterThan(0)
    expect(shown?.respondedAt).toBeNull()

    const snoozeUntil = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    const snoozed = updateStatus(vaultPath, { id: created.id, status: 'snoozed', snoozeUntil })
    expect(snoozed?.status).toBe('snoozed')
    expect(snoozed?.snoozeUntil).toBe(snoozeUntil)
    expect(snoozed?.respondedAt).toBeGreaterThan(0)

    const dismissed = updateStatus(vaultPath, { id: created.id, status: 'dismissed' })
    expect(dismissed?.status).toBe('dismissed')
    expect(dismissed?.respondedAt).toBeGreaterThan(0)

    const direct = getSuggestionById(vaultPath, created.id)
    expect(direct?.status).toBe('dismissed')

    expect(updateStatus(vaultPath, { id: 'no-such-id', status: 'shown' })).toBeNull()
  })

  it('pruneExpired marks old pending/shown rows as expired and leaves others alone', async () => {
    const { upsertSuggestion, pruneExpired, listSuggestions, updateStatus } = await import(
      '../packages/main/src/services/proactive/proactive-store'
    )
    const { getDatabase } = await import('../packages/main/src/services/database')

    const now = Math.floor(Date.now() / 1000)
    const ageSeconds = 30 * 24 * 60 * 60
    const oldTs = now - ageSeconds - 60

    const stalePending = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-stale-p', title: 'StaleP',
      ctaAction: 'open_note', signature: 'sig-stale-p'
    })
    const staleShown = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-stale-s', title: 'StaleS',
      ctaAction: 'open_note', signature: 'sig-stale-s'
    })
    updateStatus(vaultPath, { id: staleShown.id, status: 'shown' })

    const staleDismissed = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-stale-d', title: 'StaleD',
      ctaAction: 'open_note', signature: 'sig-stale-d'
    })
    updateStatus(vaultPath, { id: staleDismissed.id, status: 'dismissed' })

    const freshPending = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-fresh', title: 'Fresh',
      ctaAction: 'open_note', signature: 'sig-fresh'
    })

    const db = getDatabase(vaultPath)
    db.prepare('UPDATE proactive_suggestions SET created_at = ? WHERE id IN (?, ?, ?)')
      .run(oldTs, stalePending.id, staleShown.id, staleDismissed.id)

    const changed = pruneExpired(vaultPath, { now })
    expect(changed).toBe(2)

    const expired = listSuggestions(vaultPath, { status: ['expired'] })
    expect(expired.map((row) => row.id).sort()).toEqual([stalePending.id, staleShown.id].sort())

    const stillDismissed = listSuggestions(vaultPath, { status: ['dismissed'] })
    expect(stillDismissed.map((row) => row.id)).toEqual([staleDismissed.id])

    const stillPending = listSuggestions(vaultPath, { status: ['pending'] })
    expect(stillPending.map((row) => row.id)).toEqual([freshPending.id])
  })
})
