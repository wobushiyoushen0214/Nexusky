import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useProactiveStore } from '../../stores/proactive-store'
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
  const upsertSuggestion = useProactiveStore((s) => s.upsertSuggestion)

  useEffect(() => {
    if (!vaultPath) return
    void refresh(vaultPath)
  }, [vaultPath, refresh])

  useEffect(() => {
    const off = window.api.onProactiveEmitted((suggestion) => {
      upsertSuggestion(suggestion)
    })
    return off
  }, [upsertSuggestion])

  const badge = useMemo(() => suggestions.length, [suggestions])

  return (
    <div className="proactive-anchor">
      <button
        type="button"
        className="proactive-bell"
        title={t('proactive.bellTitle')}
        aria-label={t('proactive.bellTitle')}
        onClick={() => setDrawerOpen(!drawerOpen)}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge > 0 && <span className="proactive-bell__badge">{badge > 99 ? '99+' : badge}</span>}
      </button>

      {drawerOpen && (
        <div className="proactive-drawer" role="dialog" aria-label={t('proactive.bellTitle')}>
          <div className="proactive-drawer__header">
            <span>{t('proactive.bellTitle')}</span>
            <button
              type="button"
              className="proactive-drawer__close"
              onClick={() => setDrawerOpen(false)}
              aria-label="close"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
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
        </div>
      )}
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
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)

  return (
    <div className="proactive-item">
      <div className="proactive-item__head">
        <span className="proactive-item__kind">{t(`proactive.kind.${suggestion.kind}`)}</span>
        <span className="proactive-item__title">{suggestion.title}</span>
        <span className="proactive-item__importance">{suggestion.importance}</span>
      </div>
      {suggestion.body && <div className="proactive-item__body">{suggestion.body}</div>}
      <div className="proactive-item__actions">
        <button type="button" className="proactive-item__btn proactive-item__btn--primary" onClick={onOpen}>
          {t('proactive.open')}
        </button>
        <div className="proactive-item__snooze">
          <button
            type="button"
            className="proactive-item__btn"
            onClick={() => setSnoozeMenuOpen((v) => !v)}
          >
            {t('proactive.snooze')}
          </button>
          {snoozeMenuOpen && (
            <div className="proactive-item__snooze-menu">
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className="proactive-item__snooze-option"
                  onClick={() => {
                    setSnoozeMenuOpen(false)
                    onSnooze(opt.days)
                  }}
                >
                  {t(`proactive.${opt.key}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="proactive-item__btn" onClick={onDismiss}>
          {t('proactive.dismiss')}
        </button>
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
