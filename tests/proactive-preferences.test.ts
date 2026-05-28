import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../packages/main/src/services/store', () => {
  const data = new Map<string, unknown>()
  return {
    store: {
      get: (key: string) => data.get(key),
      set: (key: string, value: unknown) => { data.set(key, value) },
      delete: (key: string) => { data.delete(key) }
    }
  }
})

describe('proactive prefs persistence', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getProactivePrefs returns defaults when store is empty', async () => {
    const { getProactivePrefs, resetProactivePrefs } = await import(
      '../packages/main/src/services/proactive/proactive-prefs'
    )
    const { DEFAULT_PROACTIVE_PREFS } = await import(
      '../packages/main/src/services/proactive/proactive-policy'
    )

    resetProactivePrefs()
    const prefs = getProactivePrefs()
    expect(prefs.enabled).toBe(DEFAULT_PROACTIVE_PREFS.enabled)
    expect(prefs.maxPerDay).toBe(DEFAULT_PROACTIVE_PREFS.maxPerDay)
    expect(prefs.perKindEnabled.relation).toBe(true)
  })

  it('setProactivePrefs deep-merges perKindEnabled with current prefs', async () => {
    const { getProactivePrefs, setProactivePrefs, resetProactivePrefs } = await import(
      '../packages/main/src/services/proactive/proactive-prefs'
    )

    resetProactivePrefs()
    const partial = setProactivePrefs({
      maxPerDay: 2,
      perKindEnabled: {
        relation: false,
        theme_link: true,
        cognitive_review: true,
        maintenance: true
      }
    })
    expect(partial.maxPerDay).toBe(2)
    expect(partial.perKindEnabled.relation).toBe(false)
    expect(partial.perKindEnabled.theme_link).toBe(true)

    const reloaded = getProactivePrefs()
    expect(reloaded.maxPerDay).toBe(2)
    expect(reloaded.perKindEnabled.relation).toBe(false)

    resetProactivePrefs()
    const cleared = getProactivePrefs()
    expect(cleared.maxPerDay).toBe(5)
    expect(cleared.perKindEnabled.relation).toBe(true)
  })

  it('mergeWithDefaults returns DEFAULT_PROACTIVE_PREFS for nullish input', async () => {
    const { mergeWithDefaults } = await import('../packages/main/src/services/proactive/proactive-prefs')
    const { DEFAULT_PROACTIVE_PREFS } = await import('../packages/main/src/services/proactive/proactive-policy')

    expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_PROACTIVE_PREFS)
  })

  it('setProactivePrefs deep-merges triggerThresholds with current prefs', async () => {
    const { setProactivePrefs, resetProactivePrefs, getProactivePrefs } = await import(
      '../packages/main/src/services/proactive/proactive-prefs'
    )
    const { DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS } = await import(
      '../packages/main/src/services/proactive/proactive-policy'
    )

    resetProactivePrefs()
    const partial = setProactivePrefs({
      triggerThresholds: {
        ...DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS,
        highScoreThreshold: 0.6,
        staleIslandDays: 45
      }
    })
    expect(partial.triggerThresholds.highScoreThreshold).toBeCloseTo(0.6)
    expect(partial.triggerThresholds.staleIslandDays).toBe(45)
    expect(partial.triggerThresholds.overdueTaskMin).toBe(DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS.overdueTaskMin)

    const reloaded = getProactivePrefs()
    expect(reloaded.triggerThresholds.highScoreThreshold).toBeCloseTo(0.6)
    expect(reloaded.triggerThresholds.staleIslandDays).toBe(45)
  })

  it('mergeWithDefaults backfills triggerThresholds for legacy stored prefs', async () => {
    const { mergeWithDefaults } = await import('../packages/main/src/services/proactive/proactive-prefs')
    const { DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS } = await import(
      '../packages/main/src/services/proactive/proactive-policy'
    )

    const legacy = {
      enabled: true,
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
    const merged = mergeWithDefaults(legacy as never)
    expect(merged.triggerThresholds).toEqual(DEFAULT_PROACTIVE_TRIGGER_THRESHOLDS)
  })
})
