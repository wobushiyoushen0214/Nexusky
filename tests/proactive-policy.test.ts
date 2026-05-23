import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProactiveCandidate } from '../packages/main/src/services/proactive/proactive-triggers'
import type { ProactiveUserPrefs } from '../packages/main/src/services/proactive/proactive-policy'

function makeCandidate(over: Partial<ProactiveCandidate> = {}): ProactiveCandidate {
  return {
    kind: 'relation',
    sourceRef: 'rel-x',
    entityType: 'note',
    entityId: 'note-x',
    title: 'X',
    body: 'b',
    ctaAction: 'open_note',
    ctaPayload: {},
    importance: 70,
    signature: 'relation|rel-x|note-x',
    ...over
  }
}

function makePrefs(over: Partial<ProactiveUserPrefs> = {}): ProactiveUserPrefs {
  return {
    enabled: true,
    silentHoursStart: undefined,
    silentHoursEnd: undefined,
    defaultSnoozeDays: 7,
    perKindEnabled: {
      relation: true,
      theme_link: true,
      cognitive_review: true,
      maintenance: true
    },
    maxPerDay: 5,
    importanceFloor: 30,
    ...over
  }
}

describe('proactive-policy', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-policy-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('rejects when prefs.enabled is false', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const decision = decideEmission({
      vaultPath,
      now: Math.floor(Date.now() / 1000),
      candidate: makeCandidate(),
      userPrefs: makePrefs({ enabled: false })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('disabled')
  })

  it('rejects when the kind is disabled', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const decision = decideEmission({
      vaultPath,
      now: Math.floor(Date.now() / 1000),
      candidate: makeCandidate({ kind: 'theme_link' }),
      userPrefs: makePrefs({
        perKindEnabled: { relation: true, theme_link: false, cognitive_review: true, maintenance: true }
      })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('disabled_kind')
  })

  it('rejects below importance floor', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const decision = decideEmission({
      vaultPath,
      now: Math.floor(Date.now() / 1000),
      candidate: makeCandidate({ importance: 10 }),
      userPrefs: makePrefs({ importanceFloor: 50 })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('importance_floor')
  })

  it('rejects within silent hours (same-day window)', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const fixedDate = new Date(2026, 4, 23, 14, 30, 0)
    const now = Math.floor(fixedDate.getTime() / 1000)
    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate(),
      userPrefs: makePrefs({ silentHoursStart: '13:00', silentHoursEnd: '15:00' })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('silent_hours')
  })

  it('rejects within silent hours (overnight window)', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const fixedDate = new Date(2026, 4, 23, 2, 0, 0)
    const now = Math.floor(fixedDate.getTime() / 1000)
    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate(),
      userPrefs: makePrefs({ silentHoursStart: '22:00', silentHoursEnd: '08:00' })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('silent_hours')
  })

  it('rejects duplicate when a pending suggestion with the same signature exists', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'rel-x', entityType: 'note', entityId: 'note-x',
      title: 'X', ctaAction: 'open_note', signature: 'relation|rel-x|note-x', importance: 70
    })

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate(),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('duplicate_pending')
  })

  it('rejects when an existing snoozed suggestion has not yet expired', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const created = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'rel-x', entityType: 'note', entityId: 'note-x',
      title: 'X', ctaAction: 'open_note', signature: 'relation|rel-x|note-x', importance: 70
    })
    updateStatus(vaultPath, { id: created.id, status: 'snoozed', snoozeUntil: now + 3600 })

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate(),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('snoozed')
    expect(decision.suppressUntil).toBe(now + 3600)
  })

  it('allows emission when a snoozed suggestion has expired', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const created = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'rel-x', entityType: 'note', entityId: 'note-x',
      title: 'X', ctaAction: 'open_note', signature: 'relation|rel-x|note-x', importance: 70
    })
    updateStatus(vaultPath, { id: created.id, status: 'snoozed', snoozeUntil: now - 60 })

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate({ entityId: 'note-other' }),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(true)
    expect(decision.reason).toBe('ok')
  })

  it('rejects duplicate after dismissal', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const created = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'rel-x', entityType: 'note', entityId: 'note-x',
      title: 'X', ctaAction: 'open_note', signature: 'relation|rel-x|note-x', importance: 70
    })
    updateStatus(vaultPath, { id: created.id, status: 'dismissed' })

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate(),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('duplicate')
  })

  it('enforces maxPerDay rate limit', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    for (let i = 0; i < 5; i++) {
      const row = upsertSuggestion(vaultPath, {
        kind: 'relation', sourceRef: `r-${i}`, entityType: 'note', entityId: `n-${i}`,
        title: `T${i}`, ctaAction: 'open_note', signature: `sig-${i}`, importance: 70
      })
      updateStatus(vaultPath, { id: row.id, status: 'shown' })
    }

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate({ signature: 'sig-fresh', entityId: 'n-fresh' }),
      userPrefs: makePrefs({ maxPerDay: 5 })
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('rate_limit_day')
  })

  it('enforces per-entity rate limit (1 per entity per 24h)', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const row = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-1', entityType: 'note', entityId: 'note-same',
      title: 'A', ctaAction: 'open_note', signature: 'sig-A', importance: 70
    })
    updateStatus(vaultPath, { id: row.id, status: 'shown' })

    const decision = decideEmission({
      vaultPath,
      now,
      candidate: makeCandidate({ signature: 'sig-B', entityId: 'note-same' }),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('rate_limit_entity')
  })

  it('enforces global 5-minute cooldown across entities', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const row = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-cold', entityType: 'note', entityId: 'note-cold-A',
      title: 'A', ctaAction: 'open_note', signature: 'sig-cold-A', importance: 70
    })
    updateStatus(vaultPath, { id: row.id, status: 'shown' })

    // Different entity, so per-entity 24h limit does not apply; only the global cooldown should fire.
    const decision = decideEmission({
      vaultPath,
      now: now + 60, // 1 minute later, still inside the 5-minute cooldown
      candidate: makeCandidate({ signature: 'sig-cold-B', entityId: 'note-cold-B' }),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(false)
    expect(decision.reason).toBe('rate_limit_global')
    expect(decision.suppressUntil).toBeGreaterThan(now + 60)
  })

  it('clears global cooldown after 5 minutes elapse', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const { upsertSuggestion, updateStatus } = await import('../packages/main/src/services/proactive/proactive-store')
    const now = Math.floor(Date.now() / 1000)

    const row = upsertSuggestion(vaultPath, {
      kind: 'relation', sourceRef: 'r-warm', entityType: 'note', entityId: 'note-warm-A',
      title: 'A', ctaAction: 'open_note', signature: 'sig-warm-A', importance: 70
    })
    updateStatus(vaultPath, { id: row.id, status: 'shown' })

    const decision = decideEmission({
      vaultPath,
      now: now + 6 * 60, // 6 minutes later
      candidate: makeCandidate({ signature: 'sig-warm-B', entityId: 'note-warm-B' }),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(true)
    expect(decision.reason).toBe('ok')
  })

  it('allows emission when all checks pass', async () => {
    const { decideEmission } = await import('../packages/main/src/services/proactive/proactive-policy')
    const decision = decideEmission({
      vaultPath,
      now: Math.floor(Date.now() / 1000),
      candidate: makeCandidate(),
      userPrefs: makePrefs()
    })
    expect(decision.emit).toBe(true)
    expect(decision.reason).toBe('ok')
  })
})

describe('isWithinSilentHours', () => {
  it('returns false when either bound is missing', async () => {
    const { isWithinSilentHours } = await import('../packages/main/src/services/proactive/proactive-policy')
    const now = Math.floor(Date.now() / 1000)
    expect(isWithinSilentHours(now, undefined, '22:00')).toBe(false)
    expect(isWithinSilentHours(now, '22:00', undefined)).toBe(false)
  })

  it('handles same-day windows', async () => {
    const { isWithinSilentHours } = await import('../packages/main/src/services/proactive/proactive-policy')
    const morning = Math.floor(new Date(2026, 4, 23, 9, 30).getTime() / 1000)
    const noon = Math.floor(new Date(2026, 4, 23, 12, 0).getTime() / 1000)
    expect(isWithinSilentHours(morning, '09:00', '11:00')).toBe(true)
    expect(isWithinSilentHours(noon, '09:00', '11:00')).toBe(false)
  })

  it('handles overnight windows', async () => {
    const { isWithinSilentHours } = await import('../packages/main/src/services/proactive/proactive-policy')
    const lateNight = Math.floor(new Date(2026, 4, 23, 23, 30).getTime() / 1000)
    const earlyMorning = Math.floor(new Date(2026, 4, 23, 6, 30).getTime() / 1000)
    const midDay = Math.floor(new Date(2026, 4, 23, 12, 0).getTime() / 1000)
    expect(isWithinSilentHours(lateNight, '22:00', '08:00')).toBe(true)
    expect(isWithinSilentHours(earlyMorning, '22:00', '08:00')).toBe(true)
    expect(isWithinSilentHours(midDay, '22:00', '08:00')).toBe(false)
  })

  it('returns false on malformed bounds', async () => {
    const { isWithinSilentHours } = await import('../packages/main/src/services/proactive/proactive-policy')
    const now = Math.floor(Date.now() / 1000)
    expect(isWithinSilentHours(now, '99:99', '08:00')).toBe(false)
    expect(isWithinSilentHours(now, 'not-a-time', '08:00')).toBe(false)
  })
})
