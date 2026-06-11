import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import type { MemoryCard } from '@shared/types/ipc'
import { toast } from '../../stores/toast-store'
import { getErrorMessage } from '../../utils/errors'
import './MemoryTimelinePanel.css'

export function MemoryTimelinePanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [cards, setCards] = useState<MemoryCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCard, setSelectedCard] = useState<MemoryCard | null>(null)
  const [explanation, setExplanation] = useState<string>('')

  useEffect(() => {
    if (!vaultPath) return
    loadTimeline()
  }, [vaultPath])

  const loadTimeline = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('memory:get-timeline', { vaultPath })
      setCards(result)
    } catch (error) {
      toast(getErrorMessage(error, t('memory.error.load')), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCard = async (id: string, actions: { archived?: boolean; pinned?: boolean }) => {
    if (!vaultPath) return
    try {
      await window.api.invoke('memory:update-card', { vaultPath, id, actions })
      await loadTimeline()
    } catch (error) {
      toast(getErrorMessage(error, t('memory.error.update')), 'error')
    }
  }

  const handleExplain = async (card: MemoryCard) => {
    if (!vaultPath) return
    try {
      const result = await window.api.invoke('memory:explain-card', { vaultPath, id: card.id })
      setSelectedCard(card)
      setExplanation(result)
    } catch (error) {
      toast(getErrorMessage(error, t('memory.error.explain')), 'error')
    }
  }

  if (loading) {
    return (
      <div className="memory-timeline-panel memory-timeline-panel--loading">
        <div className="memory-timeline-spinner" />
        <p>{t('memory.loading')}</p>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="memory-timeline-panel memory-timeline-panel--empty">
        <p>{t('memory.empty')}</p>
      </div>
    )
  }

  return (
    <div className="memory-timeline-panel">
      <header className="memory-timeline-header">
        <h2>{t('memory.title')}</h2>
        <p className="memory-timeline-subtitle">{t('memory.subtitle')}</p>
      </header>

      <div className="memory-timeline-list">
        {cards.map((card) => (
          <div key={card.id} className={`memory-card memory-card--${card.tier.toLowerCase()}`}>
            <div className="memory-card__header">
              <h3>{card.title}</h3>
              <span className={`memory-card__tier memory-card__tier--${card.tier.toLowerCase()}`}>
                {t(`memory.tier.${card.tier.toLowerCase()}`)}
              </span>
            </div>

            <div className="memory-card__meta">
              <span className="memory-card__period">
                {new Date(card.period.start).toLocaleDateString()} - {new Date(card.period.end).toLocaleDateString()}
              </span>
              <span className="memory-card__confidence">
                {Math.round(card.confidence * 100)}% {t('memory.confidence')}
              </span>
            </div>

            <div className="memory-card__sources">
              {card.sources.slice(0, 3).map((source, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="memory-card__source"
                  onClick={() => {/* 跳转到笔记 */}}
                >
                  {source.title}
                </button>
              ))}
              {card.sources.length > 3 && (
                <span className="memory-card__more">+{card.sources.length - 3} {t('memory.moreSources')}</span>
              )}
            </div>

            <div className="memory-card__actions">
              <button
                type="button"
                onClick={() => handleExplain(card)}
                className="memory-card__action"
              >
                {t('memory.explain')}
              </button>
              <button
                type="button"
                onClick={() => handleUpdateCard(card.id, { pinned: !card.userActions.pinned })}
                className={`memory-card__action ${card.userActions.pinned ? 'is-active' : ''}`}
              >
                {card.userActions.pinned ? t('memory.unpin') : t('memory.pin')}
              </button>
              <button
                type="button"
                onClick={() => handleUpdateCard(card.id, { archived: true })}
                className="memory-card__action"
              >
                {t('memory.archive')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedCard && explanation && (
        <div className="memory-explanation-modal" onClick={() => { setSelectedCard(null); setExplanation('') }}>
          <div className="memory-explanation-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{selectedCard.title}</h3>
              <button type="button" onClick={() => { setSelectedCard(null); setExplanation('') }}>×</button>
            </header>
            <div className="memory-explanation-body">
              <p>{explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
