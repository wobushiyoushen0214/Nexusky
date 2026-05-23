import { store } from '../store'
import {
  DEFAULT_PROACTIVE_PREFS,
  type ProactiveUserPrefs
} from './proactive-policy'

const STORE_KEY = 'proactiveUserPrefs'

export function getProactivePrefs(): ProactiveUserPrefs {
  const raw = store.get(STORE_KEY) as Partial<ProactiveUserPrefs> | undefined
  return mergeWithDefaults(raw)
}

export function setProactivePrefs(input: Partial<ProactiveUserPrefs>): ProactiveUserPrefs {
  const current = getProactivePrefs()
  const next: ProactiveUserPrefs = {
    ...current,
    ...input,
    perKindEnabled: {
      ...current.perKindEnabled,
      ...(input.perKindEnabled || {})
    }
  }
  store.set(STORE_KEY, next)
  return next
}

export function resetProactivePrefs(): ProactiveUserPrefs {
  store.set(STORE_KEY, DEFAULT_PROACTIVE_PREFS)
  return DEFAULT_PROACTIVE_PREFS
}

export function mergeWithDefaults(
  raw: Partial<ProactiveUserPrefs> | undefined
): ProactiveUserPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PROACTIVE_PREFS
  return {
    ...DEFAULT_PROACTIVE_PREFS,
    ...raw,
    perKindEnabled: {
      ...DEFAULT_PROACTIVE_PREFS.perKindEnabled,
      ...(raw.perKindEnabled || {})
    }
  }
}
