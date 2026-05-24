import { store } from '../store'

export interface LongContextUserPrefs {
  confidenceThreshold: number
  tokenBudget: number
  hotRatio: number
  warmRatio: number
  coldRatio: number
  decayHalfLifeDays: number
  topN: number
  hotLimit: number
  warmLimit: number
  coldLimit: number
  archiveAfterDays: number
}

export const DEFAULT_LONG_CONTEXT_PREFS: LongContextUserPrefs = Object.freeze({
  confidenceThreshold: 0.65,
  tokenBudget: 3000,
  hotRatio: 0.5,
  warmRatio: 0.3,
  coldRatio: 0.2,
  decayHalfLifeDays: 90,
  topN: 3,
  hotLimit: 3,
  warmLimit: 3,
  coldLimit: 3,
  archiveAfterDays: 180
}) as LongContextUserPrefs

const STORE_KEY = 'longContextUserPrefs'

const CLAMPS: Record<keyof LongContextUserPrefs, { min: number; max: number; integer?: boolean }> = {
  confidenceThreshold: { min: 0, max: 1 },
  tokenBudget: { min: 200, max: 8000, integer: true },
  hotRatio: { min: 0, max: 1 },
  warmRatio: { min: 0, max: 1 },
  coldRatio: { min: 0, max: 1 },
  decayHalfLifeDays: { min: 30, max: 365, integer: true },
  topN: { min: 1, max: 10, integer: true },
  hotLimit: { min: 1, max: 10, integer: true },
  warmLimit: { min: 1, max: 10, integer: true },
  coldLimit: { min: 1, max: 10, integer: true },
  archiveAfterDays: { min: 60, max: 365, integer: true }
}

export function getLongContextPrefs(): LongContextUserPrefs {
  const raw = store.get(STORE_KEY) as Partial<LongContextUserPrefs> | undefined
  return mergeWithDefaults(raw)
}

export function setLongContextPrefs(input: Partial<LongContextUserPrefs>): LongContextUserPrefs {
  const current = getLongContextPrefs()
  const next: LongContextUserPrefs = { ...current, ...input }
  const sanitized = mergeWithDefaults(next)
  store.set(STORE_KEY, sanitized)
  return sanitized
}

export function resetLongContextPrefs(): LongContextUserPrefs {
  store.set(STORE_KEY, DEFAULT_LONG_CONTEXT_PREFS)
  return { ...DEFAULT_LONG_CONTEXT_PREFS }
}

export function mergeWithDefaults(raw: Partial<LongContextUserPrefs> | undefined): LongContextUserPrefs {
  const merged: LongContextUserPrefs = { ...DEFAULT_LONG_CONTEXT_PREFS, ...(raw || {}) }
  for (const key of Object.keys(CLAMPS) as (keyof LongContextUserPrefs)[]) {
    const spec = CLAMPS[key]
    const value = Number(merged[key])
    if (!Number.isFinite(value)) {
      merged[key] = DEFAULT_LONG_CONTEXT_PREFS[key]
      continue
    }
    const clamped = Math.max(spec.min, Math.min(spec.max, value))
    merged[key] = spec.integer ? Math.round(clamped) : clamped
  }
  return merged
}
