import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import type { ProactiveUserPrefs, ProactiveSuggestionKind, ProactiveTriggerThresholds } from '@shared/types/ipc'

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-secondary)',
  marginBottom: 4
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid var(--border-soft, rgba(255,255,255,0.08))',
  background: 'transparent',
  color: 'var(--text-primary)',
  borderRadius: 4
}

const rowStyle: React.CSSProperties = {
  marginBottom: 12
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 18
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  border: '1px solid var(--border-soft, rgba(255,255,255,0.12))',
  background: 'transparent',
  color: 'var(--text-secondary)',
  borderRadius: 4,
  cursor: 'pointer'
}

const debugResultStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  color: 'var(--text-tertiary, rgba(255,255,255,0.5))',
  fontFamily: 'monospace'
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
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>...</div>
  }

  return (
    <div style={{ padding: 4 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {t('settings.proactive.title')}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 18 }}>
        {t('settings.proactive.description')}
      </p>

      <div style={sectionStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => save({ ...prefs, enabled: e.target.checked })}
          />
          <span style={{ fontSize: 13 }}>{t('settings.proactive.enabled')}</span>
        </label>
      </div>

      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>{t('settings.proactive.perKind')}</div>
        {KIND_ORDER.map((kind) => (
          <label key={kind} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={prefs.perKindEnabled[kind]}
              onChange={(e) => save({
                ...prefs,
                perKindEnabled: { ...prefs.perKindEnabled, [kind]: e.target.checked }
              })}
            />
            <span style={{ fontSize: 12 }}>{t(`settings.proactive.kind.${kind}`)}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('settings.proactive.silentHoursStart')}</label>
          <input
            type="text"
            value={prefs.silentHoursStart ?? ''}
            placeholder="22:00"
            onChange={(e) => save({ ...prefs, silentHoursStart: e.target.value || undefined })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('settings.proactive.silentHoursEnd')}</label>
          <input
            type="text"
            value={prefs.silentHoursEnd ?? ''}
            placeholder="08:00"
            onChange={(e) => save({ ...prefs, silentHoursEnd: e.target.value || undefined })}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>{t('settings.proactive.maxPerDay')}: {prefs.maxPerDay}</label>
        <input
          type="range"
          min={1}
          max={20}
          value={prefs.maxPerDay}
          onChange={(e) => save({ ...prefs, maxPerDay: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>{t('settings.proactive.defaultSnoozeDays')}: {prefs.defaultSnoozeDays}</label>
        <input
          type="range"
          min={1}
          max={30}
          value={prefs.defaultSnoozeDays}
          onChange={(e) => save({ ...prefs, defaultSnoozeDays: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>{t('settings.proactive.importanceFloor')}: {prefs.importanceFloor}</label>
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.importanceFloor}
          onChange={(e) => save({ ...prefs, importanceFloor: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.06))', paddingTop: 12, marginTop: 8 }}>
        <div style={{ ...labelStyle, marginBottom: 8, fontWeight: 600 }}>{t('settings.proactive.triggerThresholds')}</div>
        {renderThresholdSlider(
          t('settings.proactive.highScoreThreshold'),
          prefs.triggerThresholds.highScoreThreshold,
          0,
          1,
          0.05,
          (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, highScoreThreshold: v } }),
          (v) => v.toFixed(2)
        )}
        {renderThresholdSlider(
          t('settings.proactive.highScoreRecentHours'),
          prefs.triggerThresholds.highScoreRecentHours,
          1,
          168,
          1,
          (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, highScoreRecentHours: v } }),
          (v) => `${v} h`
        )}
        {renderThresholdSlider(
          t('settings.proactive.staleIslandDays'),
          prefs.triggerThresholds.staleIslandDays,
          7,
          180,
          1,
          (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, staleIslandDays: v } }),
          (v) => `${v} d`
        )}
        {renderThresholdSlider(
          t('settings.proactive.themeKeywordOverlapMin'),
          prefs.triggerThresholds.themeKeywordOverlapMin,
          1,
          10,
          1,
          (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, themeKeywordOverlapMin: v } })
        )}
        {renderThresholdSlider(
          t('settings.proactive.overdueTaskMin'),
          prefs.triggerThresholds.overdueTaskMin,
          1,
          20,
          1,
          (v) => save({ ...prefs, triggerThresholds: { ...prefs.triggerThresholds, overdueTaskMin: v } })
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          type="button"
          style={buttonStyle}
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
        </button>
        <button
          type="button"
          style={buttonStyle}
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
        </button>
      </div>
      {debugResult && <div style={debugResultStyle}>{debugResult}</div>}
    </div>
  )
}

function renderThresholdSlider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (next: number) => void,
  format: (v: number) => string = (v) => String(v)
) {
  return (
    <div style={{ marginBottom: 10 }} key={label}>
      <label style={labelStyle}>
        {label}: <span style={{ color: 'var(--text-primary)' }}>{format(value)}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}
