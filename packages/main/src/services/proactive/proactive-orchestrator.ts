import {
  evaluateTriggers,
  type ProactiveCandidate,
  type ProactiveTriggerKind,
  type ProactiveEntityType
} from './proactive-triggers'
import {
  decideEmission,
  DEFAULT_PROACTIVE_PREFS,
  type ProactivePolicyDecision,
  type ProactivePolicyReason,
  type ProactiveUserPrefs
} from './proactive-policy'
import {
  upsertSuggestion,
  type ProactiveSuggestionRow
} from './proactive-store'
import { getProactivePrefs } from './proactive-prefs'
import { broadcastProactiveEmitted } from './proactive-broadcaster'

export interface RunProactiveCycleParams {
  vaultPath: string
  entityType: ProactiveEntityType
  entityId: string
  trigger: ProactiveTriggerKind
  now?: number
  context?: Record<string, unknown>
  userPrefs?: Partial<ProactiveUserPrefs>
}

export interface ProactiveCycleEvaluation {
  candidate: ProactiveCandidate
  decision: ProactivePolicyDecision
  emitted: boolean
  suggestion?: ProactiveSuggestionRow
}

export interface RunProactiveCycleResult {
  evaluated: number
  emitted: number
  evaluations: ProactiveCycleEvaluation[]
  suggestions: ProactiveSuggestionRow[]
  skippedReasons: Partial<Record<ProactivePolicyReason, number>>
}

export function runProactiveCycle(params: RunProactiveCycleParams): RunProactiveCycleResult {
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const userPrefs = mergePrefs(params.userPrefs)
  const candidates = evaluateTriggers({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    trigger: params.trigger,
    now,
    context: params.context
  })

  const evaluations: ProactiveCycleEvaluation[] = []
  const suggestions: ProactiveSuggestionRow[] = []
  const skippedReasons: Partial<Record<ProactivePolicyReason, number>> = {}
  let emittedCount = 0

  for (const candidate of candidates) {
    const decision = decideEmission({
      vaultPath: params.vaultPath,
      now,
      candidate,
      userPrefs
    })

    if (!decision.emit) {
      skippedReasons[decision.reason] = (skippedReasons[decision.reason] ?? 0) + 1
      evaluations.push({ candidate, decision, emitted: false })
      continue
    }

    const suggestion = upsertSuggestion(params.vaultPath, {
      kind: candidate.kind,
      sourceRef: candidate.sourceRef,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: candidate.title,
      body: candidate.body,
      ctaAction: candidate.ctaAction,
      ctaPayload: candidate.ctaPayload,
      importance: candidate.importance,
      signature: candidate.signature
    })

    suggestions.push(suggestion)
    evaluations.push({ candidate, decision, emitted: true, suggestion })
    emittedCount += 1
    broadcastProactiveEmitted(suggestion)
  }

  return {
    evaluated: candidates.length,
    emitted: emittedCount,
    evaluations,
    suggestions,
    skippedReasons
  }
}

function mergePrefs(override?: Partial<ProactiveUserPrefs>): ProactiveUserPrefs {
  const base = readPrefsSafely()
  if (!override) return base
  return {
    ...base,
    ...override,
    perKindEnabled: {
      ...base.perKindEnabled,
      ...(override.perKindEnabled || {})
    }
  }
}

function readPrefsSafely(): ProactiveUserPrefs {
  try {
    return getProactivePrefs()
  } catch {
    return DEFAULT_PROACTIVE_PREFS
  }
}
