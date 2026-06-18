import type { LongContextFeedbackType, LongContextSuggestion } from '@shared/types/ipc'

export const CONTEXT_RELATION_FEEDBACK_TYPES: LongContextFeedbackType[] = [
  'useful',
  'wrong_reason',
  'snoozed',
  'not_related'
]

export function isSuppressiveRelationFeedback(feedbackType: LongContextFeedbackType): boolean {
  return feedbackType === 'not_related' || feedbackType === 'dismissed' || feedbackType === 'snoozed'
}

export function getRelationFeedbackStatusKey(feedbackType: LongContextFeedbackType): string {
  return `relatedContext.feedback.status.${feedbackType}`
}

export function applyRelationFeedbackToSuggestions(
  suggestions: LongContextSuggestion[],
  relationId: string,
  feedbackType: LongContextFeedbackType
): LongContextSuggestion[] {
  if (!isSuppressiveRelationFeedback(feedbackType)) return suggestions
  return suggestions.filter((suggestion) => suggestion.relationId !== relationId)
}
