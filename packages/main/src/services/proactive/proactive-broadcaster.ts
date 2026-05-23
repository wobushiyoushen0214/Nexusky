import type { ProactiveSuggestionRow } from './proactive-store'

export type ProactiveEmittedListener = (suggestion: ProactiveSuggestionRow) => void

const listeners = new Set<ProactiveEmittedListener>()

export function subscribeProactiveEmitted(listener: ProactiveEmittedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function broadcastProactiveEmitted(suggestion: ProactiveSuggestionRow): void {
  if (listeners.size === 0) return
  for (const listener of listeners) {
    try {
      listener(suggestion)
    } catch {
      // Listeners must never disrupt the orchestrator path.
    }
  }
}

export function clearProactiveEmittedListeners(): void {
  listeners.clear()
}
