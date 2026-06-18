import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LongContextFeedbackType } from '@shared/types/ipc'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { CONTEXT_RELATION_FEEDBACK_TYPES, getRelationFeedbackStatusKey } from './relation-feedback'
import './long-context.css'

interface RelationFeedbackControlsProps {
  feedback?: LongContextFeedbackType
  includeDismiss?: boolean
  onFeedback: (feedbackType: LongContextFeedbackType) => void
}

const feedbackIconPaths: Record<LongContextFeedbackType, ReactNode> = {
  useful: (
    <>
      <path d="M20 6L9 17l-5-5" />
    </>
  ),
  wrong_reason: (
    <>
      <path d="M4 12h16" />
      <path d="M8 8h8" />
    </>
  ),
  snoozed: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  not_related: (
    <>
      <path d="M4 12h16" />
      <path d="M8 8l8 8" />
    </>
  ),
  dismissed: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  )
}

function getFeedbackLabelKey(feedbackType: LongContextFeedbackType): string {
  if (feedbackType === 'wrong_reason') return 'relatedContext.feedback.lowerRank'
  if (feedbackType === 'dismissed') return 'relatedContext.card.dismiss'
  if (feedbackType === 'not_related') return 'relatedContext.card.notRelated'
  if (feedbackType === 'snoozed') return 'relatedContext.card.snooze'
  return 'relatedContext.card.useful'
}

export function RelationFeedbackControls({ feedback, includeDismiss = false, onFeedback }: RelationFeedbackControlsProps) {
  const { t } = useTranslation()
  const feedbackTypes = includeDismiss
    ? [...CONTEXT_RELATION_FEEDBACK_TYPES, 'dismissed' as const]
    : CONTEXT_RELATION_FEEDBACK_TYPES

  return (
    <div className="relation-feedback-controls">
      {feedback && (
        <span className="relation-feedback-controls__status">
          {t(getRelationFeedbackStatusKey(feedback))}
        </span>
      )}
      <div className="relation-feedback-controls__buttons">
        {feedbackTypes.map((feedbackType) => (
          <Tooltip key={feedbackType}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`relation-feedback-controls__button${feedback === feedbackType ? ' is-active' : ''}`}
                aria-label={t(getFeedbackLabelKey(feedbackType))}
                onClick={() => onFeedback(feedbackType)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {feedbackIconPaths[feedbackType]}
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t(getFeedbackLabelKey(feedbackType))}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
