import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useVaultStore } from '../../stores/vault-store'
import type { MemoryCard } from '@shared/types/ipc'
import { toast } from '../../stores/toast-store'
import { getErrorMessage } from '../../utils/errors'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import './MemoryTimelinePanel.css'

function getValidDate(value: number) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getTimelineAnchor(card: MemoryCard) {
  return card.period.end || card.updatedAt || card.createdAt || card.period.start
}

function formatTimelineDate(value: number, locale: string) {
  const date = getValidDate(value)
  if (!date) return ''
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function formatTimelineDay(value: number, locale: string) {
  const date = getValidDate(value)
  if (!date) return ''
  return date.toLocaleDateString(locale, {
    month: '2-digit',
    day: '2-digit'
  })
}

function formatTimelineYear(value: number, locale: string) {
  const date = getValidDate(value)
  if (!date) return ''
  return date.toLocaleDateString(locale, {
    year: 'numeric'
  })
}

function formatTimelinePeriod(card: MemoryCard, locale: string) {
  const start = formatTimelineDate(card.period.start, locale)
  const end = formatTimelineDate(card.period.end, locale)
  if (!start) return end
  if (!end || start === end) return start
  return `${start} - ${end}`
}

interface MemoryTimelineItemProps {
  card: MemoryCard
  locale: string
  t: TFunction
  onExplain: (card: MemoryCard) => void
  onUpdate: (id: string, actions: { archived?: boolean; pinned?: boolean }) => void
}

function MemoryTimelineItem({ card, locale, t, onExplain, onUpdate }: MemoryTimelineItemProps) {
  const tier = card.tier.toLowerCase()
  const badgeVariant: 'default' | 'secondary' | 'outline' =
    tier === 'cold' ? 'secondary' : tier === 'warm' ? 'outline' : 'default'
  const visibleSources = card.sources.slice(0, 3)
  const anchor = getTimelineAnchor(card)

  return (
    <article
      role="listitem"
      className={`memory-card memory-card--${tier} ${card.userActions.pinned ? 'is-pinned' : ''}`}
    >
      <time className="memory-card__date" dateTime={getValidDate(anchor)?.toISOString()}>
        <span className="memory-card__date-day">{formatTimelineDay(anchor, locale)}</span>
        <span className="memory-card__date-year">{formatTimelineYear(anchor, locale)}</span>
      </time>

      <div className="memory-card__rail" aria-hidden="true">
        <span className="memory-card__dot" />
      </div>

      <div className="memory-card__surface">
        <div className="memory-card__topline">
          <div className="memory-card__title-block">
            <div className="memory-card__title-row">
              <h3>{card.title}</h3>
              <Badge className="memory-card__tier" variant={badgeVariant}>
                {t(`memory.tier.${tier}`)}
              </Badge>
            </div>
            <div className="memory-card__meta">
              <span>{formatTimelinePeriod(card, locale)}</span>
              <span>
                {Math.round(card.confidence * 100)}% {t('memory.confidence')}
              </span>
            </div>
          </div>

          <div className="memory-card__actions" aria-label={t('memory.actions')}>
            <MemoryActionButton onClick={() => onExplain(card)}>
              {t('memory.explain')}
            </MemoryActionButton>
            <MemoryActionButton
              active={card.userActions.pinned}
              onClick={() => onUpdate(card.id, { pinned: !card.userActions.pinned })}
            >
              {card.userActions.pinned ? t('memory.unpin') : t('memory.pin')}
            </MemoryActionButton>
            <MemoryActionButton onClick={() => onUpdate(card.id, { archived: true })}>
              {t('memory.archive')}
            </MemoryActionButton>
          </div>
        </div>

        {visibleSources.length > 0 && (
          <div className="memory-card__sources" aria-label={t('memory.sources')}>
            <span className="memory-card__source-label">{t('memory.sources')}</span>
            {visibleSources.map((source, idx) => (
              <MemorySourceChip
                key={`${source.noteId}-${idx}`}
                title={source.filePath || source.title}
              >
                {source.title}
              </MemorySourceChip>
            ))}
            {card.sources.length > visibleSources.length && (
              <span className="memory-card__more">
                +{card.sources.length - visibleSources.length} {t('memory.moreSources')}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function MemorySourceChip({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span className="memory-card__source" title={title}>
      {children}
    </span>
  )
}

function MemoryActionButton({
  active = false,
  children,
  onClick
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="xs"
      onClick={onClick}
      className={`memory-card__action ${active ? 'is-active' : ''}`}
    >
      {children}
    </Button>
  )
}

export function MemoryTimelinePanel() {
  const { t, i18n } = useTranslation()
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

  const closeExplanation = () => {
    setSelectedCard(null)
    setExplanation('')
  }

  if (loading) {
    return (
      <div className="memory-timeline-panel memory-timeline-panel--loading">
        <Spinner className="memory-timeline-spinner" aria-hidden="true" />
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
        <div className="memory-timeline-heading">
          <h2>{t('memory.title')}</h2>
          <p className="memory-timeline-subtitle">{t('memory.subtitle')}</p>
        </div>
        <span className="memory-timeline-count">{t('memory.count', { count: cards.length })}</span>
      </header>

      <ScrollArea className="memory-timeline-scroll">
        <div className="memory-timeline-list" role="list">
          {cards.map((card) => (
            <MemoryTimelineItem
              key={card.id}
              card={card}
              locale={i18n.language}
              t={t}
              onExplain={handleExplain}
              onUpdate={handleUpdateCard}
            />
          ))}
        </div>
      </ScrollArea>

      <Dialog open={Boolean(selectedCard && explanation)} onOpenChange={(open) => { if (!open) closeExplanation() }}>
        {selectedCard && explanation && (
          <DialogContent className="memory-explanation-content" closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>{selectedCard.title}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="memory-explanation-scroll">
              <div className="memory-explanation-body">
                <p>{explanation}</p>
              </div>
            </ScrollArea>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
