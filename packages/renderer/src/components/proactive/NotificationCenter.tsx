import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useProactiveStore } from '../../stores/proactive-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet'
import type { ProactiveSuggestion } from '@shared/types/ipc'
import './proactive.css'

const SNOOZE_OPTIONS: { key: 'snooze1d' | 'snooze7d' | 'snooze30d'; days: number }[] = [
  { key: 'snooze1d', days: 1 },
  { key: 'snooze7d', days: 7 },
  { key: 'snooze30d', days: 30 }
]

export function NotificationCenter() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const suggestions = useProactiveStore((s) => s.suggestions)
  const drawerOpen = useProactiveStore((s) => s.drawerOpen)
  const setDrawerOpen = useProactiveStore((s) => s.setDrawerOpen)
  const refresh = useProactiveStore((s) => s.refresh)
  const respond = useProactiveStore((s) => s.respond)
  const respondAll = useProactiveStore((s) => s.respondAll)
  const upsertSuggestion = useProactiveStore((s) => s.upsertSuggestion)
  const [bulkStatus, setBulkStatus] = useState<'opened' | 'dismissed' | null>(null)

  useEffect(() => {
    if (!vaultPath) return
    void refresh(vaultPath)
  }, [vaultPath, refresh])

  useEffect(() => {
    if (typeof window.api?.onProactiveEmitted !== 'function') return
    const off = window.api.onProactiveEmitted((suggestion) => {
      upsertSuggestion(suggestion)
      // The suggestion has now been surfaced to the user (bell badge / toast),
      // so record it as shown. proactive-policy's per-day / per-entity / global
      // rate limits count shown suggestions; without this write shown_at stays
      // null and those limits never fire in production.
      if (vaultPath) void respond(vaultPath, suggestion.id, 'shown')
    })
    return off
  }, [upsertSuggestion, respond, vaultPath])

  const badge = useMemo(() => suggestions.length, [suggestions])
  const hasSuggestions = suggestions.length > 0
  const bulkDisabled = !vaultPath || !hasSuggestions || bulkStatus !== null
  const platform = window.api?.platform ?? 'darwin'

  const handleRespondAll = async (status: 'opened' | 'dismissed') => {
    if (!vaultPath || bulkStatus !== null) return
    setBulkStatus(status)
    try {
      await respondAll(vaultPath, status)
    } finally {
      setBulkStatus(null)
    }
  }

  return (
    <div className="proactive-anchor" data-platform={platform}>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="proactive-bell"
          title={t('proactive.bellTitle')}
          aria-label={t('proactive.bellTitle')}
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {badge > 0 && <span className="proactive-bell__badge">{badge > 99 ? '99+' : badge}</span>}
        </Button>

        <SheetContent
          side="right"
          className="proactive-drawer"
          data-platform={platform}
          showOverlay={false}
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="proactive-drawer__header">
            <SheetTitle className="proactive-drawer__title">
              <span>{t('proactive.bellTitle')}</span>
              {hasSuggestions && (
                <span className="proactive-drawer__count">{t('proactive.count', { count: suggestions.length })}</span>
              )}
            </SheetTitle>
            <div className="proactive-drawer__tools">
              {hasSuggestions && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="proactive-drawer__action"
                    onClick={() => void handleRespondAll('opened')}
                    disabled={bulkDisabled}
                    aria-label={t('proactive.markAllRead')}
                  >
                    {t('proactive.markAllRead')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    className="proactive-drawer__action proactive-drawer__action--danger"
                    onClick={() => void handleRespondAll('dismissed')}
                    disabled={bulkDisabled}
                    aria-label={t('proactive.deleteAll')}
                  >
                    {t('proactive.deleteAll')}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="proactive-drawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('common.close')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </div>
          </div>
          <div className="proactive-drawer__list">
            {suggestions.length === 0 ? (
              <div className="proactive-drawer__empty">{t('proactive.empty')}</div>
            ) : (
              suggestions.map((suggestion) => (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  onOpen={() => handleOpen(suggestion, respond, vaultPath)}
                  onSnooze={(days) => {
                    if (!vaultPath) return
                    const snoozeUntil = Math.floor(Date.now() / 1000) + days * 86_400
                    void respond(vaultPath, suggestion.id, 'snoozed', snoozeUntil)
                  }}
                  onDismiss={() => {
                    if (!vaultPath) return
                    void respond(vaultPath, suggestion.id, 'dismissed')
                  }}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

interface SuggestionItemProps {
  suggestion: ProactiveSuggestion
  onOpen: () => void
  onSnooze: (days: number) => void
  onDismiss: () => void
}

function SuggestionItem({ suggestion, onOpen, onSnooze, onDismiss }: SuggestionItemProps) {
  const { t } = useTranslation()

  return (
    <div className="proactive-item">
      <div className="proactive-item__head">
        <span className="proactive-item__kind">{t(`proactive.kind.${suggestion.kind}`)}</span>
        <span className="proactive-item__title">{suggestion.title}</span>
        <span className="proactive-item__importance">{suggestion.importance}</span>
      </div>
      {suggestion.body && <div className="proactive-item__body">{suggestion.body}</div>}
      <div className="proactive-item__actions">
        <Button type="button" size="xs" className="proactive-item__btn proactive-item__btn--primary" onClick={onOpen}>
          {t('proactive.open')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="proactive-item__btn">
              {t('proactive.snooze')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="proactive-item__snooze-content">
              {SNOOZE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  onSelect={() => {
                    onSnooze(opt.days)
                  }}
                >
                  {t(`proactive.${opt.key}`)}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" size="xs" className="proactive-item__btn" onClick={onDismiss}>
          {t('proactive.dismiss')}
        </Button>
      </div>
    </div>
  )
}

async function handleOpen(
  suggestion: ProactiveSuggestion,
  respond: ReturnType<typeof useProactiveStore.getState>['respond'],
  vaultPath: string | null
): Promise<void> {
  if (!vaultPath) return
  await respond(vaultPath, suggestion.id, 'opened')
  dispatchCtaAction(suggestion)
}

function dispatchCtaAction(suggestion: ProactiveSuggestion): void {
  const detail = {
    action: suggestion.ctaAction,
    payload: suggestion.ctaPayload,
    suggestionId: suggestion.id
  }
  window.dispatchEvent(new CustomEvent('proactive:cta', { detail }))
}
