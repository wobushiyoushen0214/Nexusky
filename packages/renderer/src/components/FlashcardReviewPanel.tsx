import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import type { FlashcardQueueItem, FlashcardReviewRating } from '@shared/types/ipc'

interface FlashcardReviewPanelProps {
  open: boolean
  onClose: () => void
}

const RATINGS: { rating: FlashcardReviewRating; key: string; color: string }[] = [
  { rating: 'again', key: '1', color: 'var(--danger)' },
  { rating: 'hard', key: '2', color: 'var(--warning)' },
  { rating: 'good', key: '3', color: 'var(--accent)' },
  { rating: 'easy', key: '4', color: 'var(--success)' },
]

function getTodayStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clozePrompt(text: string) {
  return text.replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '____')
}

function clozeAnswer(text: string) {
  return text.replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '$1')
}

export function FlashcardReviewPanel({ open, onClose }: FlashcardReviewPanelProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const [cards, setCards] = useState<FlashcardQueueItem[]>([])
  const [totalDue, setTotalDue] = useState(0)
  const [index, setIndex] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [answerVisible, setAnswerVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState<FlashcardReviewRating | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = useMemo(() => getTodayStamp(), [])
  const card = cards[index]
  const sessionTotal = reviewedCount + cards.length
  const answerText = card?.type === 'cloze' && card.back
    ? `${clozeAnswer(card.front)}\n\n${card.back}`
    : card?.type === 'cloze'
      ? clozeAnswer(card.front)
      : card?.back

  const loadQueue = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    setError(null)
    setAnswerVisible(false)
    setReviewedCount(0)
    setIndex(0)
    try {
      const result = await window.api.invoke('flashcards:list-due', { vaultPath, today, limit: 50 })
      setCards(result.cards)
      setTotalDue(result.total)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('flashcards.review.loadFailed')
      setError(message)
      setCards([])
      setTotalDue(0)
    } finally {
      setLoading(false)
    }
  }, [today, t, vaultPath])

  useEffect(() => {
    if (open) void loadQueue()
  }, [loadQueue, open])

  const handleReview = useCallback(async (rating: FlashcardReviewRating) => {
    if (!vaultPath || !card || reviewing) return
    setReviewing(rating)
    try {
      const result = await window.api.invoke('flashcards:review', {
        vaultPath,
        filePath: card.filePath,
        startLine: card.startLine,
        rating,
        reviewedAt: today,
      })
      if (!result.ok) {
        toast(result.error || t('flashcards.review.reviewFailed'), 'error')
        return
      }

      const nextCards = cards.filter((_, i) => i !== index)
      if (rating === 'again' && result.card && result.card.due <= today) {
        nextCards.push(result.card)
      }
      setCards(nextCards)
      setIndex((current) => Math.min(current, Math.max(0, nextCards.length - 1)))
      setReviewedCount((count) => count + 1)
      setAnswerVisible(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('flashcards.review.reviewFailed')
      toast(message, 'error')
    } finally {
      setReviewing(null)
    }
  }, [card, cards, index, reviewing, t, today, vaultPath])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (!card || loading || reviewing) return
      if (!answerVisible && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        setAnswerVisible(true)
        return
      }
      const rating = RATINGS.find((item) => item.key === event.key)?.rating
      if (answerVisible && rating) {
        event.preventDefault()
        void handleReview(rating)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [answerVisible, card, handleReview, loading, onClose, open, reviewing])

  const handleOpenSource = async () => {
    if (!vaultPath || !card) return
    await openFile(`${vaultPath}/${card.filePath}`)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: { line: card.startLine } }))
    }, 200)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.42)',
      }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'min(680px, calc(100vh - 48px))',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('flashcards.review.title')}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>
              {loading ? t('flashcards.review.loading') : t('flashcards.review.progress', { reviewed: reviewedCount, total: sessionTotal, due: totalDue })}
            </div>
          </div>
          <button onClick={onClose} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            {t('common.close')}
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ height: 88, borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }} />
              <div style={{ height: 140, borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', opacity: 0.7 }} />
            </div>
          ) : error ? (
            <div style={{ padding: '34px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
              <button onClick={() => void loadQueue()} style={{ height: 30, padding: '0 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, cursor: 'pointer' }}>
                {t('common.retry')}
              </button>
            </div>
          ) : !card ? (
            <div style={{ padding: '42px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('flashcards.review.emptyTitle')}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{t('flashcards.review.emptyHint')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 600 }}>
                    {card.type === 'cloze' ? t('flashcards.review.cloze') : t('flashcards.review.basic')}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</span>
                </div>
                <button onClick={handleOpenSource} style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  {t('flashcards.review.openSource')}
                </button>
              </div>

              <div style={{ padding: '18px 18px 20px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('flashcards.review.prompt')}</div>
                <div style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {card.type === 'cloze' ? clozePrompt(card.front) : card.front}
                </div>
              </div>

              <div style={{ padding: '18px 18px 20px', minHeight: 128, borderRadius: 8, background: answerVisible ? 'var(--bg-base)' : 'transparent', border: answerVisible ? '1px solid var(--border-subtle)' : '1px dashed var(--border-subtle)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {answerVisible ? (
                  <>
                    <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('flashcards.review.answer')}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{answerText}</div>
                  </>
                ) : (
                  <button onClick={() => setAnswerVisible(true)} style={{ alignSelf: 'center', height: 32, padding: '0 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {t('flashcards.review.showAnswer')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {card && !loading && !error && (
          <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {RATINGS.map((item) => (
              <button
                key={item.rating}
                disabled={!answerVisible || Boolean(reviewing)}
                onClick={() => void handleReview(item.rating)}
                style={{
                  height: 34,
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: answerVisible ? 'var(--bg-base)' : 'transparent',
                  color: answerVisible ? item.color : 'var(--text-tertiary)',
                  opacity: !answerVisible || reviewing ? 0.55 : 1,
                  cursor: !answerVisible || reviewing ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {reviewing === item.rating ? t('flashcards.review.saving') : t(`flashcards.review.ratings.${item.rating}`, { key: item.key })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
