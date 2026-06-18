import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LongContextFeedbackType, LongContextSuggestion } from '@shared/types/ipc'
import { Button } from '../ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { LongContextBadge } from './LongContextBadge'
import { RelationFeedbackControls } from './RelationFeedbackControls'

interface RelatedContextCardProps {
  suggestion: LongContextSuggestion
  feedback?: LongContextFeedbackType
  onOpen: (suggestion: LongContextSuggestion) => void
  onFeedback: (suggestion: LongContextSuggestion, feedbackType: LongContextFeedbackType) => void
}

export function RelatedContextCard({ suggestion, feedback, onOpen, onFeedback }: RelatedContextCardProps) {
  const { t } = useTranslation()
  const evidence = suggestion.evidence.slice(0, 2)
  const titleHint = suggestion.targetPath || suggestion.targetTitle

  return (
    <Card asChild>
      <article className="related-context-card">
        <CardHeader className="related-context-card__header">
          <CardTitle className="related-context-card__title-shell">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="related-context-card__title"
                  aria-label={titleHint}
                  onClick={() => onOpen(suggestion)}
                >
                  {suggestion.targetTitle}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{titleHint}</TooltipContent>
            </Tooltip>
          </CardTitle>
          <LongContextBadge type={suggestion.relationType} confidence={suggestion.confidence} />
        </CardHeader>

        <CardContent className="related-context-card__content">
          <div className="related-context-card__why">{t('relatedContext.card.whyThis')}</div>
          <p className="related-context-card__reason">{suggestion.reason}</p>

          {evidence.length > 0 && (
            <ul className="related-context-card__evidence">
              {evidence.map((item, index) => (
                <li key={`${suggestion.relationId}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </CardContent>

        <CardFooter className="related-context-card__footer">
          <span className="related-context-card__score">{t('relatedContext.card.score', { score: Math.round(suggestion.score * 100) })}</span>
          <div className="related-context-card__actions">
            <IconButton title={t('relatedContext.card.open')} onClick={() => onOpen(suggestion)}>
              <path d="M7 17L17 7" />
              <path d="M9 7h8v8" />
            </IconButton>
            <RelationFeedbackControls
              feedback={feedback}
              includeDismiss
              onFeedback={(feedbackType) => onFeedback(suggestion, feedbackType)}
            />
          </div>
        </CardFooter>
      </article>
    </Card>
  )
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="related-context-card__icon-button"
          aria-label={title}
          onClick={onClick}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {children}
          </svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
