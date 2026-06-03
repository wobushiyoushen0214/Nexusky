import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { getErrorMessage } from '../../utils/errors'
import type { LongContextFeedbackType, LongContextInspection, LongContextMemoryTier, LongContextPackItemPayload, LongContextSuggestion, NoteSearchResult } from '@shared/types/ipc'
import { RelatedContextCard } from './RelatedContextCard'
import { getRelationTypeLabel } from './LongContextBadge'
import './long-context.css'

interface RelatedContextPanelProps {
  currentFilePath: string
  content: string
  placement?: RelatedContextPanelPlacement
}

type LoadState = 'idle' | 'loading' | 'error'
type RelatedContextPanelPlacement = 'inline' | 'top' | 'side'
type RelatedContextDirection = -1 | 1
type ContextPackTier = LongContextMemoryTier

export function getRelatedContextPanelClassName(placement: RelatedContextPanelPlacement = 'inline'): string {
  return `related-context-panel${placement === 'inline' ? '' : ` related-context-panel--${placement}`}`
}

export function getRelatedContextCarouselIndex(currentIndex: number, total: number, direction: RelatedContextDirection): number {
  if (total <= 0) return 0
  return (currentIndex + direction + total) % total
}

function isCarouselPlacement(placement: RelatedContextPanelPlacement): boolean {
  return placement === 'top' || placement === 'side'
}

export function getContextPackTierItems(inspection: LongContextInspection | null, tier: ContextPackTier): LongContextPackItemPayload[] {
  if (!inspection) return []
  return inspection.pack[tier]
}

export function getContextPackSummary(inspection: LongContextInspection | null): { hot: number; warm: number; cold: number; dropped: number; used: number; budget: number } {
  if (!inspection) return { hot: 0, warm: 0, cold: 0, dropped: 0, used: 0, budget: 0 }
  return {
    hot: inspection.pack.hot.length,
    warm: inspection.pack.warm.length,
    cold: inspection.pack.cold.length,
    dropped: inspection.pack.droppedItems.length,
    used: inspection.pack.estimatedTokens,
    budget: inspection.pack.tokenBudget
  }
}

export function RelatedContextPanel({ currentFilePath, content, placement = 'inline' }: RelatedContextPanelProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const language = useUIStore((s) => s.language)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<LongContextSuggestion[]>([])
  const [feedbackByRelation, setFeedbackByRelation] = useState<Record<string, LongContextFeedbackType>>({})
  const [inspection, setInspection] = useState<LongContextInspection | null>(null)
  const [packExpanded, setPackExpanded] = useState(false)
  const [activePackTier, setActivePackTier] = useState<ContextPackTier>('hot')
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const contentRef = useRef(content)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    let cancelled = false
    setNoteId(null)
    setSuggestions([])
    setFeedbackByRelation({})
    setInspection(null)
    setPackExpanded(false)
    setActivePackTier('hot')
    setActiveSuggestionIndex(0)
    if (!vaultPath || !currentFilePath) return

    const relativePath = currentFilePath
      .replace(vaultPath, '')
      .replace(/^[\\/]/, '')
      .replace(/\\/g, '/')

    window.api.invoke('db:get-all-notes', { vaultPath })
      .then((notes: NoteSearchResult[]) => {
        if (cancelled) return
        const note = notes.find((item) => item.filePath === relativePath)
        setNoteId(note?.id || null)
      })
      .catch(() => {
        if (!cancelled) setNoteId(null)
      })

    return () => {
      cancelled = true
    }
  }, [vaultPath, currentFilePath])

  const loadSuggestions = useCallback(async (refresh = false) => {
    if (!vaultPath || !noteId) return
    setState('loading')
    setError('')
    try {
      const rows = await window.api.invoke('long-context:get-suggestions', {
        vaultPath,
        entityType: 'note',
        entityId: noteId,
        content: contentRef.current,
        limit: 3,
        refresh,
        language
      })
      setSuggestions(rows)
      setState('idle')
    } catch (err) {
      setError(getErrorMessage(err, t('relatedContext.loadFailed')))
      setState('error')
    }
  }, [vaultPath, noteId, language, t])

  useEffect(() => {
    if (!noteId) return
    loadSuggestions(false)
  }, [noteId, loadSuggestions])

  useEffect(() => {
    let cancelled = false
    if (!vaultPath || !currentFilePath || !noteId) {
      setInspection(null)
      return
    }

    window.api.invoke('long-context:inspect-pack', {
      vaultPath,
      currentFilePath,
      language
    }).then((result) => {
      if (!cancelled) setInspection(result)
    }).catch(() => {
      if (!cancelled) setInspection(null)
    })

    return () => {
      cancelled = true
    }
  }, [vaultPath, currentFilePath, noteId, language, suggestions.length])

  useEffect(() => {
    setActiveSuggestionIndex((current) => {
      if (suggestions.length === 0) return 0
      return Math.min(current, suggestions.length - 1)
    })
  }, [suggestions.length])

  const openSuggestion = useCallback((suggestion: LongContextSuggestion) => {
    if (!vaultPath || !suggestion.targetPath) return
    if (noteId) {
      window.api.invoke('long-context:record-suggestion-opened', {
        vaultPath,
        entityType: 'note',
        entityId: noteId,
        relationId: suggestion.relationId,
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
        targetTitle: suggestion.targetTitle,
        targetPath: suggestion.targetPath
      }).catch(() => {})
    }
    useEditorStore.getState().openFile(`${vaultPath}/${suggestion.targetPath}`)
  }, [vaultPath, noteId])

  const submitFeedback = useCallback(async (suggestion: LongContextSuggestion, feedbackType: LongContextFeedbackType) => {
    if (!vaultPath) return
    setFeedbackByRelation((prev) => ({ ...prev, [suggestion.relationId]: feedbackType }))
    if (feedbackType === 'not_related' || feedbackType === 'dismissed' || feedbackType === 'snoozed') {
      setSuggestions((prev) => prev.filter((item) => item.relationId !== suggestion.relationId))
    }
    try {
      await window.api.invoke('long-context:submit-feedback', {
        vaultPath,
        relationId: suggestion.relationId,
        feedbackType
      })
    } catch (err) {
      toast(getErrorMessage(err, t('relatedContext.feedbackFailed')), 'error')
    }
  }, [vaultPath, t])

  if (!noteId) return null

  const usesCarousel = isCarouselPlacement(placement)
  const activeIndex = suggestions.length > 0 ? Math.min(activeSuggestionIndex, suggestions.length - 1) : 0
  const visibleSuggestions = usesCarousel && suggestions.length > 0
    ? [suggestions[activeIndex]]
    : suggestions
  const countText = suggestions.length > 0
    ? usesCarousel
      ? t('relatedContext.countCarousel', { current: activeIndex + 1, total: suggestions.length })
      : t('relatedContext.count', { count: suggestions.length })
    : state === 'loading'
      ? t('relatedContext.loading')
      : state === 'error'
        ? t('relatedContext.error')
        : t('relatedContext.empty')
  const showCarouselControls = usesCarousel && suggestions.length > 1
  const moveCarousel = (direction: RelatedContextDirection) => {
    setActiveSuggestionIndex((current) => getRelatedContextCarouselIndex(current, suggestions.length, direction))
  }
  const packSummary = getContextPackSummary(inspection)
  const activePackItems = getContextPackTierItems(inspection, activePackTier)
  const hasPackItems = packSummary.hot + packSummary.warm + packSummary.cold > 0

  return (
    <section className={getRelatedContextPanelClassName(placement)} aria-label={t('relatedContext.label')}>
      <div className="related-context-panel__header">
        <div>
          <div className="related-context-panel__eyebrow">{t('relatedContext.label')}</div>
          <div className="related-context-panel__count">{countText}</div>
        </div>
        <div className="related-context-panel__actions">
          {showCarouselControls && (
            <>
              <button
                type="button"
                className="related-context-panel__nav"
                onClick={() => moveCarousel(-1)}
                title={t('relatedContext.nav.previous')}
                aria-label={t('relatedContext.nav.previous')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className="related-context-panel__nav"
                onClick={() => moveCarousel(1)}
                title={t('relatedContext.nav.next')}
                aria-label={t('relatedContext.nav.next')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            className="related-context-panel__refresh"
            onClick={() => loadSuggestions(true)}
            disabled={state === 'loading'}
            title={t('relatedContext.nav.refresh')}
            aria-label={t('relatedContext.nav.refresh')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-15 6.7" />
              <path d="M3 12a9 9 0 0 1 15-6.7" />
              <path d="M18 3v5h-5" />
              <path d="M6 21v-5h5" />
            </svg>
          </button>
        </div>
      </div>

      {(inspection || hasPackItems) && (
        <div className={`related-context-pack${packExpanded ? ' is-expanded' : ''}`}>
          <button
            type="button"
            className="related-context-pack__summary"
            onClick={() => setPackExpanded((value) => !value)}
            aria-expanded={packExpanded}
          >
            <span className="related-context-pack__summary-main">
              <span className="related-context-pack__summary-title">{t('relatedContext.pack.title')}</span>
              <span className="related-context-pack__summary-counts">
                {t('relatedContext.pack.summary', { hot: packSummary.hot, warm: packSummary.warm, cold: packSummary.cold })}
              </span>
            </span>
            <span className="related-context-pack__summary-meta">
              {packSummary.budget > 0 ? t('relatedContext.pack.tokens', { used: packSummary.used, budget: packSummary.budget }) : t('relatedContext.pack.empty')}
              <svg className="related-context-pack__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          {packExpanded && (
            <div className="related-context-pack__body">
              <div className="related-context-pack__tabs" role="tablist" aria-label={t('relatedContext.pack.tiers')}>
                {(['hot', 'warm', 'cold'] as ContextPackTier[]).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    role="tab"
                    aria-selected={activePackTier === tier}
                    className={`related-context-pack__tab${activePackTier === tier ? ' is-active' : ''}`}
                    onClick={() => setActivePackTier(tier)}
                  >
                    {t(`relatedContext.pack.tier.${tier}`)} <span>{getContextPackTierItems(inspection, tier).length}</span>
                  </button>
                ))}
              </div>

              {activePackItems.length === 0 ? (
                <div className="related-context-pack__empty">{t('relatedContext.pack.emptyTier')}</div>
              ) : (
                <div className="related-context-pack__items">
                  {activePackItems.slice(0, 4).map((item, index) => (
                    <ContextPackItemRow key={`${item.relationId || item.title}-${index}`} item={item} />
                  ))}
                </div>
              )}

              {packSummary.dropped > 0 && (
                <div className="related-context-pack__dropped">{t('relatedContext.pack.dropped', { count: packSummary.dropped })}</div>
              )}
            </div>
          )}
        </div>
      )}

      {state === 'loading' && suggestions.length === 0 && (
        <div className="related-context-panel__skeleton">
          <span />
          <span />
          <span />
        </div>
      )}

      {state === 'error' && (
        <div className="related-context-panel__error">
          <span>{error}</span>
          <button type="button" onClick={() => loadSuggestions(false)}>{t('relatedContext.retry')}</button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className={`related-context-panel__list${usesCarousel ? ' related-context-panel__list--carousel' : ''}`}>
          {visibleSuggestions.map((suggestion) => (
            <RelatedContextCard
              key={suggestion.relationId}
              suggestion={suggestion}
              feedback={feedbackByRelation[suggestion.relationId]}
              onOpen={openSuggestion}
              onFeedback={submitFeedback}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ContextPackItemRow({ item }: { item: LongContextPackItemPayload }) {
  const { t } = useTranslation()
  const meta = [
    item.relationType ? getRelationTypeLabel(item.relationType, t) : '',
    typeof item.confidence === 'number' ? t('relatedContext.pack.confidence', { value: Math.round(item.confidence * 100) }) : '',
    typeof item.score === 'number' ? t('relatedContext.pack.score', { value: item.score.toFixed(2) }) : ''
  ].filter(Boolean).join(' · ')

  return (
    <div className="related-context-pack__item">
      <div className="related-context-pack__item-header">
        <span className="related-context-pack__item-title">{item.title}</span>
        {meta && <span className="related-context-pack__item-meta">{meta}</span>}
      </div>
      <p className="related-context-pack__item-reason">{item.reason}</p>
      {item.evidence.length > 0 && (
        <div className="related-context-pack__item-evidence">
          {item.evidence.slice(0, 2).map((line, index) => (
            <span key={`${item.title}-${index}`}>{line}</span>
          ))}
        </div>
      )}
    </div>
  )
}
