import type { ReactNode } from 'react'
import type { LongContextFeedbackType, LongContextSuggestion } from '@shared/types/ipc'
import { LongContextBadge } from './LongContextBadge'

interface RelatedContextCardProps {
  suggestion: LongContextSuggestion
  feedback?: LongContextFeedbackType
  onOpen: (suggestion: LongContextSuggestion) => void
  onFeedback: (suggestion: LongContextSuggestion, feedbackType: LongContextFeedbackType) => void
}

export function RelatedContextCard({ suggestion, feedback, onOpen, onFeedback }: RelatedContextCardProps) {
  const evidence = suggestion.evidence.slice(0, 2)

  return (
    <article className="related-context-card">
      <div className="related-context-card__header">
        <button
          type="button"
          className="related-context-card__title"
          onClick={() => onOpen(suggestion)}
          title={suggestion.targetPath || suggestion.targetTitle}
        >
          {suggestion.targetTitle}
        </button>
        <LongContextBadge type={suggestion.relationType} confidence={suggestion.confidence} />
      </div>

      <p className="related-context-card__reason">{suggestion.reason}</p>

      {evidence.length > 0 && (
        <ul className="related-context-card__evidence">
          {evidence.map((item, index) => (
            <li key={`${suggestion.relationId}-${index}`}>{item}</li>
          ))}
        </ul>
      )}

      <div className="related-context-card__footer">
        <span className="related-context-card__score">{Math.round(suggestion.score * 100)} 分</span>
        <div className="related-context-card__actions">
          <IconButton title="打开" onClick={() => onOpen(suggestion)}>
            <path d="M7 17L17 7" />
            <path d="M9 7h8v8" />
          </IconButton>
          <IconButton title="有用" active={feedback === 'useful'} onClick={() => onFeedback(suggestion, 'useful')}>
            <path d="M20 6L9 17l-5-5" />
          </IconButton>
          <IconButton title="不相关" onClick={() => onFeedback(suggestion, 'not_related')}>
            <path d="M4 12h16" />
            <path d="M8 8l8 8" />
          </IconButton>
          <IconButton title="原因不对" active={feedback === 'wrong_reason'} onClick={() => onFeedback(suggestion, 'wrong_reason')}>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </IconButton>
          <IconButton title="忽略" onClick={() => onFeedback(suggestion, 'dismissed')}>
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </IconButton>
        </div>
      </div>
    </article>
  )
}

function IconButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`related-context-card__icon-button${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}
