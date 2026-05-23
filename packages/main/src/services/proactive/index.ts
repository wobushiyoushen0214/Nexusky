export {
  evaluateTriggers,
  type ProactiveTriggerInput,
  type ProactiveTriggerKind,
  type ProactiveCandidate,
  type ProactiveCandidateKind,
  type ProactiveCtaAction,
  type ProactiveEntityType
} from './proactive-triggers'

export {
  decideEmission,
  isWithinSilentHours,
  DEFAULT_PROACTIVE_PREFS,
  type ProactivePolicyContext,
  type ProactivePolicyDecision,
  type ProactivePolicyReason,
  type ProactiveUserPrefs
} from './proactive-policy'

export {
  runProactiveCycle,
  type RunProactiveCycleParams,
  type RunProactiveCycleResult,
  type ProactiveCycleEvaluation
} from './proactive-orchestrator'

export {
  upsertSuggestion,
  listSuggestions,
  updateStatus,
  pruneExpired,
  getSuggestionById,
  type ProactiveSuggestionRow,
  type ProactiveSuggestionKind,
  type ProactiveSuggestionStatus,
  type UpsertProactiveSuggestionInput,
  type ListProactiveSuggestionsParams,
  type UpdateProactiveStatusInput
} from './proactive-store'

export {
  getProactivePrefs,
  setProactivePrefs,
  resetProactivePrefs,
  mergeWithDefaults as mergeProactivePrefs
} from './proactive-prefs'
