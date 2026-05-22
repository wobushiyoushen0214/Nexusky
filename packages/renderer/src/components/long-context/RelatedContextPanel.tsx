import { useCallback, useEffect, useRef, useState } from 'react'
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
}

type LoadState = 'idle' | 'loading' | 'error'

export function RelatedContextPanel({ currentFilePath, content }: RelatedContextPanelProps) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<LongContextSuggestion[]>([])
  const [feedbackByRelation, setFeedbackByRelation] = useState<Record<string, LongContextFeedbackType>>({})
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const contentRef = useRef(content)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    let cancelled = false
    setNoteId(null)
    setSuggestions([])
    setFeedbackByRelation({})
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
      setError(getErrorMessage(err, '上下文加载失败'))
      setState('error')
    }
  }, [vaultPath, noteId])

  useEffect(() => {
    if (!noteId) return
    loadSuggestions(false)
  }, [noteId, loadSuggestions])

  const openSuggestion = useCallback((suggestion: LongContextSuggestion) => {
    if (!vaultPath || !suggestion.targetPath) return
    useEditorStore.getState().openFile(`${vaultPath}/${suggestion.targetPath}`)
  }, [vaultPath])

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
      toast(getErrorMessage(err, '反馈提交失败'), 'error')
    }
  }, [vaultPath])

  if (!noteId) return null

  return (
    <section className="related-context-panel" aria-label="相关上下文">
      <div className="related-context-panel__header">
        <div>
          <div className="related-context-panel__eyebrow">相关上下文</div>
          <div className="related-context-panel__count">{suggestions.length > 0 ? `${suggestions.length} 条` : state === 'loading' ? '读取中' : state === 'error' ? '出错' : '0 条'}</div>
        </div>
        <button
          type="button"
          className="related-context-panel__refresh"
          onClick={() => loadSuggestions(true)}
          disabled={state === 'loading'}
          title="刷新"
          aria-label="刷新"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-15 6.7" />
            <path d="M3 12a9 9 0 0 1 15-6.7" />
            <path d="M18 3v5h-5" />
            <path d="M6 21v-5h5" />
          </svg>
        </button>
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
          <button type="button" onClick={() => loadSuggestions(false)}>重试</button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="related-context-panel__list">
          {suggestions.map((suggestion) => (
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
