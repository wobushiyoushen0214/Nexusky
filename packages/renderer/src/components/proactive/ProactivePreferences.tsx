import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProactiveUserPrefs, ProactiveSuggestionKind, ProactiveTriggerThresholds } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Checkbox } from '../ui/checkbox'
import { Empty, EmptyDescription } from '../ui/empty'
import { Input } from '../ui/input'
import { Slider } from '../ui/slider'
import { Spinner } from '../ui/spinner'
import './proactive.css'

const KIND_ORDER: ProactiveSuggestionKind[] = [
  'relation',
  'theme_link',
  'cognitive_review',
  'maintenance'
]

const DEFAULT_TRIGGER_THRESHOLDS: ProactiveTriggerThresholds = {
  highScoreThreshold: 0.75,
  highScoreRecentHours: 24,
  staleIslandDays: 30,
  themeKeywordOverlapMin: 3,
  overdueTaskMin: 3
}

export function ProactivePreferencesTab() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [prefs, setPrefs] = useState<ProactiveUserPrefs | null>(null)
  const [saving, setSaving] = useState(false)
  const [debugResult, setDebugResult] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const next = await window.api.invoke('proactive:get-prefs', undefined)
      setPrefs(next)
    })()
  }, [])

  async function save(next: ProactiveUserPrefs) {
    setSaving(true)
    setPrefs(next)
    try {
      const saved = await window.api.invoke('proactive:set-prefs', { prefs: next })
      setPrefs(saved)
    } finally {
      setSaving(false)
    }
  }

  if (!prefs) {
    return (
      <Empty className="proactive-preferences__loading">
        <Spinner aria-hidden="true" />
        <EmptyDescription>{t('settings.loading')}</EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="proactive-preferences">
      <h3 className="proactive-preferences__title">
        {t('settings.proactive.title')}
      </h3>
      <p className="proactive-preferences__description">
        {t('settings.proactive.description')}
      </p>

      <Card className="proactive-preferences__section">
        <CardContent className="proactive-preferences__section-content">
          <div className="proactive-preferences__check-row">
            <Checkbox
              id="proactive-enabled"
              checked={prefs.enabled}
              onCheckedChange={(checked) => void save({ ...prefs, enabled: checked === true })}
            />
            <label htmlFor="proactive-enabled" className="proactive-preferences__check-label">
              {t('settings.proactive.enabled')}
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="proactive-preferences__section">
        <CardHeader className="proactive-preferences__section-header">
          <CardTitle className="proactive-preferences__section-title">{t('settings.proactive.perKind')}</CardTitle>
        </CardHeader>
        <CardContent className="proactive-preferences__section-content">
          {KIND_ORDER.map((kind) => (
            <div key={kind} className="proactive-preferences__check-row proactive-preferences__check-row--compact">
              <Checkbox
                id={`proactive-kind-${kind}`}
                checked={prefs.perKindEnabled[kind]}
                onCheckedChange={(checked) => void save({
                  ...prefs,
                  perKindEnabled: { ...prefs.perKindEnabled, [kind]: checked === true }
                })}
              />
              <label htmlFor={`proactive-kind-${kind}`} className="proactive-preferences__check-label proactive-preferences__check-label--compact">
                {t(`settings.proactive.kind.${kind}`)}
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="proactive-preferences__section">
        <CardContent className="proactive-preferences__section-content">
          <div className="proactive-preferences__time-grid">
            <div className="proactive-preferences__field">
              <label className="proactive-preferences__label" htmlFor="proactive-silent-start">{t('settings.proactive.silentHoursStart')}</label>
              <Input
                id="proactive-silent-start"
                className="proactive-preferences__input"
                type="text"
                value={prefs.silentHoursStart ?? ''}
                placeholder="22:00"
                onChange={(e) => save({ ...prefs, silentHoursStart: e.target.value || undefined })}
              />
            </div>
            <div className="proactive-preferences__field">
              <label className="proactive-preferences__label" htmlFor="proactive-silent-end">{t('settings.proactive.silentHoursEnd')}</label>
              <Input
                id="proactive-silent-end"
                className="proactive-preferences__input"
                type="text"
                value={prefs.silentHoursEnd ?? ''}
                placeholder="08:00"
                onChange={(e) => save({ ...prefs, silentHoursEnd: e.target.value || undefined })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="proactive-preferences__section">
        <CardContent className="proactive-preferences__section-content">
          <div className="proactive-preferences__range-row">
            <label className="proactive-preferences__label" htmlFor="proactive-max-per-day">
              {t('settings.proactive.maxPerDay')}: <span className="proactive-preferences__range-value">{prefs.maxPerDay}</span>
            </label>
            <Slider
              id="proactive-max-per-day"
              className="proactive-preferences__range"
              min={1}
              max={20}
              value={[prefs.maxPerDay]}
              onValueChange={([value]) => void save({ ...prefs, maxPerDay: value })}
              aria-label={t('settings.proactive.maxPerDay')}
            />
          </div>

          <div className="proactive-preferences__range-row">
            <label className="proactive-preferences__label" htmlFor="proactive-default-snooze">
              {t('settings.proactive.defaultSnoozeDays')}: <span className="proactive-preferences__range-value">{prefs.defaultSnoozeDays}</span>
            </label>
            <Slider
              id="proactive-default-snooze"
              className="proactive-preferences__range"
              min={1}
              max={30}
              value={[prefs.defaultSnoozeDays]}
              onValueChange={([value]) => void save({ ...prefs, defaultSnoozeDays: value })}
              aria-label={t('settings.proactive.defaultSnoozeDays')}
            />
          </div>

          <div className="proactive-preferences__range-row">
            <label className="proactive-preferences__label" htmlFor="proactive-importance-floor">
              {t('settings.proactive.importanceFloor')}: <span className="proactive-preferences__range-value">{prefs.importanceFloor}</span>
            </label>
            <Slider
              id="proactive-importance-floor"
              className="proactive-preferences__range"
              min={0}
              max={100}
              value={[prefs.importanceFloor]}
              onValueChange={([value]) => void save({ ...prefs, importanceFloor: value })}
              aria-label={t('settings.proactive.importanceFloor')}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="proactive-preferences__section proactive-preferences__thresholds">
        <CardHeader className="proactive-preferences__section-header">
          <CardTitle className="proactive-preferences__section-title">{t('settings.proactive.triggerThresholds')}</CardTitle>
        </CardHeader>
        <CardContent className="proactive-preferences__section-content">
          {renderThresholdSlider(
            'proactive-threshold-high-score',
            t('settings.proactive.highScoreThreshold'),
            prefs.triggerThresholds.highScoreThreshold,
            0,
            1,
            0.05,
            (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, highScoreThreshold: v } }),
            (v) => v.toFixed(2)
          )}
          {renderThresholdSlider(
            'proactive-threshold-recent-hours',
            t('settings.proactive.highScoreRecentHours'),
            prefs.triggerThresholds.highScoreRecentHours,
            1,
            168,
            1,
            (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, highScoreRecentHours: v } }),
            (v) => `${v} h`
          )}
          {renderThresholdSlider(
            'proactive-threshold-stale-island',
            t('settings.proactive.staleIslandDays'),
            prefs.triggerThresholds.staleIslandDays,
            7,
            180,
            1,
            (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, staleIslandDays: v } }),
            (v) => `${v} d`
          )}
          {renderThresholdSlider(
            'proactive-threshold-theme-overlap',
            t('settings.proactive.themeKeywordOverlapMin'),
            prefs.triggerThresholds.themeKeywordOverlapMin,
            1,
            10,
            1,
            (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, themeKeywordOverlapMin: v } })
          )}
          {renderThresholdSlider(
            'proactive-threshold-overdue-task',
            t('settings.proactive.overdueTaskMin'),
            prefs.triggerThresholds.overdueTaskMin,
            1,
            20,
            1,
            (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, overdueTaskMin: v } })
          )}
        </CardContent>
      </Card>

      <div className="proactive-preferences__actions">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!vaultPath || saving}
          onClick={async () => {
            if (!vaultPath) return
            const result = await window.api.invoke('proactive:debug-run-cycle', {
              vaultPath,
              entityType: 'vault',
              entityId: 'vault',
              trigger: 'cognitive_review_ready',
              context: { reviewFilePath: '.nexusky/reviews/debug.md', reviewTitle: 'Debug review' }
            })
            setDebugResult(`evaluated=${result.evaluated} emitted=${result.emitted}`)
          }}
        >
          {t('settings.proactive.debugRun')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={async () => {
            const defaults = await window.api.invoke('proactive:set-prefs', { prefs: {
              enabled: true,
              silentHoursStart: undefined,
              silentHoursEnd: undefined,
              defaultSnoozeDays: 7,
              perKindEnabled: { relation: true, theme_link: true, cognitive_review: true, maintenance: true },
              maxPerDay: 5,
              importanceFloor: 30,
              triggerThresholds: DEFAULT_TRIGGER_THRESHOLDS
            } })
            setPrefs(defaults)
          }}
        >
          {t('settings.proactive.resetPrefs')}
        </Button>
      </div>
      {debugResult && <div className="proactive-preferences__debug-result">{debugResult}</div>}
    </div>
  )
}

function renderThresholdSlider(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (next: number) => void,
  format: (v: number) => string = (v) => String(v)
) {
  return (
    <div className="proactive-preferences__range-row" key={label}>
      <label className="proactive-preferences__label" htmlFor={id}>
        {label}: <span className="proactive-preferences__range-value">{format(value)}</span>
      </label>
      <Slider
        id={id}
        className="proactive-preferences__range"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
    </div>
  )
}
