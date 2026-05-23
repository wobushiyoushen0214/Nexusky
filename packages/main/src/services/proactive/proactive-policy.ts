import { getDatabase } from '../database'
import type { ProactiveCandidate, ProactiveCandidateKind } from './proactive-triggers'

export interface ProactiveUserPrefs {
  enabled: boolean
  silentHoursStart?: string
  silentHoursEnd?: string
  defaultSnoozeDays: number
  perKindEnabled: Record<ProactiveCandidateKind, boolean>
  maxPerDay: number
  importanceFloor: number
}

export const DEFAULT_PROACTIVE_PREFS: ProactiveUserPrefs = {
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
  importanceFloor: 30
}

export type ProactivePolicyReason =
  | 'ok'
  | 'duplicate'
  | 'duplicate_pending'
  | 'rate_limit_day'
  | 'rate_limit_entity'
  | 'rate_limit_global'
  | 'snoozed'
  | 'silent_hours'
  | 'disabled'
  | 'disabled_kind'
  | 'importance_floor'

export interface ProactivePolicyContext {
  vaultPath: string
  now: number
  candidate: ProactiveCandidate
  userPrefs: ProactiveUserPrefs
}

export interface ProactivePolicyDecision {
  emit: boolean
  reason: ProactivePolicyReason
  suppressUntil?: number
}

const PER_ENTITY_WINDOW_SECONDS = 24 * 60 * 60
const PER_DAY_WINDOW_SECONDS = 24 * 60 * 60
const GLOBAL_COOLDOWN_SECONDS = 5 * 60

export function decideEmission(ctx: ProactivePolicyContext): ProactivePolicyDecision {
  const { userPrefs, candidate, now } = ctx

  if (!userPrefs.enabled) {
    return { emit: false, reason: 'disabled' }
  }

  if (!userPrefs.perKindEnabled[candidate.kind]) {
    return { emit: false, reason: 'disabled_kind' }
  }

  if (candidate.importance < userPrefs.importanceFloor) {
    return { emit: false, reason: 'importance_floor' }
  }

  if (isWithinSilentHours(now, userPrefs.silentHoursStart, userPrefs.silentHoursEnd)) {
    return { emit: false, reason: 'silent_hours' }
  }

  const db = getDatabase(ctx.vaultPath)

  const existing = db.prepare(`
    SELECT id, status, snooze_until, responded_at, shown_at
    FROM proactive_suggestions
    WHERE signature = ?
  `).get(candidate.signature) as {
    id: string
    status: string
    snooze_until: number | null
    responded_at: number | null
    shown_at: number | null
  } | undefined

  if (existing) {
    if (existing.status === 'snoozed') {
      if (existing.snooze_until && existing.snooze_until > now) {
        return { emit: false, reason: 'snoozed', suppressUntil: existing.snooze_until }
      }
    } else if (existing.status === 'dismissed' || existing.status === 'opened') {
      return { emit: false, reason: 'duplicate' }
    } else if (existing.status === 'pending' || existing.status === 'shown') {
      return { emit: false, reason: 'duplicate_pending' }
    }
  }

  const dayCutoff = now - PER_DAY_WINDOW_SECONDS
  const dayRow = db.prepare(`
    SELECT COUNT(*) AS c
    FROM proactive_suggestions
    WHERE shown_at IS NOT NULL
      AND shown_at >= ?
  `).get(dayCutoff) as { c: number }
  if (dayRow.c >= userPrefs.maxPerDay) {
    return { emit: false, reason: 'rate_limit_day' }
  }

  if (candidate.entityId) {
    const entityCutoff = now - PER_ENTITY_WINDOW_SECONDS
    const entityRow = db.prepare(`
      SELECT COUNT(*) AS c
      FROM proactive_suggestions
      WHERE shown_at IS NOT NULL
        AND shown_at >= ?
        AND entity_type = ?
        AND entity_id = ?
    `).get(entityCutoff, candidate.entityType, candidate.entityId) as { c: number }
    if (entityRow.c >= 1) {
      return { emit: false, reason: 'rate_limit_entity' }
    }
  }

  const recentRow = db.prepare(`
    SELECT MAX(shown_at) AS last
    FROM proactive_suggestions
    WHERE shown_at IS NOT NULL
  `).get() as { last: number | null }
  if (recentRow.last !== null && now - recentRow.last < GLOBAL_COOLDOWN_SECONDS) {
    return {
      emit: false,
      reason: 'rate_limit_global',
      suppressUntil: recentRow.last + GLOBAL_COOLDOWN_SECONDS
    }
  }

  return { emit: true, reason: 'ok' }
}

export function isWithinSilentHours(now: number, start?: string, end?: string): boolean {
  if (!start || !end) return false
  const parsedStart = parseHHMM(start)
  const parsedEnd = parseHHMM(end)
  if (parsedStart === null || parsedEnd === null) return false

  const d = new Date(now * 1000)
  const currentMinutes = d.getHours() * 60 + d.getMinutes()

  if (parsedStart === parsedEnd) return false

  if (parsedStart < parsedEnd) {
    return currentMinutes >= parsedStart && currentMinutes < parsedEnd
  }
  return currentMinutes >= parsedStart || currentMinutes < parsedEnd
}

function parseHHMM(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}
