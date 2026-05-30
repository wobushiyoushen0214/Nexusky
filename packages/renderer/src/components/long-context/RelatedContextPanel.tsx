import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { getErrorMessage } from '../../utils/errors'
import type { LongContextFeedbackType, LongContextSuggestion, NoteSearchResult } from '@shared/types/ipc'
import { RelatedContextCard } from './RelatedContextCard'
import './long-context.css'

interface RelatedContextPanelProps {
  currentFilePath: string
  content: string
  placement?: RelatedContextPanelPlacement
}

type LoadState = 'idle' | 'loading' | 'error'
type RelatedContextPanelPlacement = 'inline' | 'top' | 'side'
type RelatedContextDirection = -1 | 1

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

export function RelatedContextPanel({ currentFilePath, content, placement = 'inline' }: RelatedContextPanelProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<LongContextSuggestion[]>([])
  const [feedbackByRelation, setFeedbackByRelation] = useState<Record<string, LongContextFeedbackType>>({})
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
        refresh
      })
      setSuggestions(rows)
      setState('idle')
    } catch (err) {
      setError(getErrorMessage(err, t('relatedContext.loadFailed')))
      setState('error')
    }
  }, [vaultPath, noteId, t])

  useEffect(() => {
    if (!noteId) return
    loadSuggestions(false)
  }, [noteId, loadSuggestions])

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
    if (feedbackType === 'not_related' || feedbackType === 'dismissed') {
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
