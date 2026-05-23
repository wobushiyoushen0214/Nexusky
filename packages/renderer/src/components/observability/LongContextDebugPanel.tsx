import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LongContextInspection, LongContextMetrics, LongContextPackItemPayload, LongContextUserPrefs } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import './observability.css'

type PackTab = 'hot' | 'warm' | 'cold' | 'dropped'

export function LongContextDebugPanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const [inspection, setInspection] = useState<LongContextInspection | null>(null)
  const [metrics, setMetrics] = useState<LongContextMetrics | null>(null)
  const [prefs, setPrefs] = useState<LongContextUserPrefs | null>(null)
  const [draftPrefs, setDraftPrefs] = useState<LongContextUserPrefs | null>(null)
  const [activeTab, setActiveTab] = useState<PackTab>('hot')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const [inspectionRes, metricsRes, prefsRes] = await Promise.all([
        window.api.invoke('long-context:inspect-pack', { vaultPath, currentFilePath }),
        window.api.invoke('long-context:get-metrics', { vaultPath }),
        window.api.invoke('long-context:get-prefs', undefined)
      ])
      setInspection(inspectionRes)
      setMetrics(metricsRes)
      setPrefs(prefsRes)
      setDraftPrefs(prefsRes)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [vaultPath, currentFilePath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSavePrefs = useCallback(async () => {
    if (!draftPrefs) return
    setSaving(true)
    try {
      const next = await window.api.invoke('long-context:set-prefs', { prefs: draftPrefs })
      setPrefs(next)
      setDraftPrefs(next)
      toast(t('longContextDebug.saveOk'), 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }, [draftPrefs, t])

  const handleResetPrefs = useCallback(() => {
    if (!prefs) return
    const defaults: LongContextUserPrefs = {
      confidenceThreshold: 0.65,
      tokenBudget: 1200,
      hotRatio: 0.5,
      warmRatio: 0.3,
      coldRatio: 0.2,
      decayHalfLifeDays: 90,
      topN: 3,
      hotLimit: 3,
      warmLimit: 3,
      coldLimit: 3,
      archiveAfterDays: 180
    }
    setDraftPrefs(defaults)
  }, [prefs])

  const tabItems = useMemo<LongContextPackItemPayload[]>(() => {
    if (!inspection) return []
    if (activeTab === 'hot') return inspection.pack.hot
    if (activeTab === 'warm') return inspection.pack.warm
    if (activeTab === 'cold') return inspection.pack.cold
    return inspection.pack.droppedItems
  }, [inspection, activeTab])

  if (!vaultPath) {
    return <div className="long-context-debug-panel__empty">{t('longContextDebug.noVault')}</div>
  }

  return (
    <div className="long-context-debug-panel">
      <div className="long-context-debug-panel__section">
        <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.inspector')}</h3>
        <div className="long-context-debug-panel__tabs">
          {(['hot', 'warm', 'cold', 'dropped'] as PackTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`long-context-debug-panel__tab${activeTab === tab ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`longContextDebug.tier.${tab}`)} ({tab === 'dropped' ? inspection?.pack.droppedItems.length ?? 0 : (inspection?.pack[tab].length ?? 0)})
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>
            {inspection ? t('longContextDebug.tokens', { used: inspection.pack.estimatedTokens, budget: inspection.pack.tokenBudget }) : ''}
          </span>
        </div>
        {tabItems.length === 0 ? (
          <div className="long-context-debug-panel__empty">
            {loading ? t('longContextDebug.loading') : t('longContextDebug.emptyTier')}
          </div>
        ) : (
          tabItems.map((item, idx) => <PackItemCard key={`${item.relationId || item.title}-${idx}`} item={item} />)
        )}
      </div>

      <div className="long-context-debug-panel__section">
        <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.metrics')}</h3>
        {!metrics ? (
          <div className="long-context-debug-panel__empty">{t('longContextDebug.loading')}</div>
        ) : (
          <div className="long-context-debug-panel__metrics-grid">
            <MetricCard label={t('longContextDebug.metric.usefulRate')} value={metrics.rates.usefulRate} />
            <MetricCard label={t('longContextDebug.metric.openRate')} value={metrics.rates.openRate} />
            <MetricCard label={t('longContextDebug.metric.notRelatedRate')} value={metrics.rates.notRelatedRate} />
          </div>
        )}
        {metrics && (
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)' }}>
            shown {metrics.counts.suggestionShown} · opened {metrics.counts.suggestionOpened} · useful {metrics.counts.suggestionUseful} · relations {metrics.counts.relationCreated} · themes {metrics.counts.themeCreated}
          </div>
        )}
      </div>

      <div className="long-context-debug-panel__section">
        <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.tuning')}</h3>
        {!draftPrefs ? (
          <div className="long-context-debug-panel__empty">{t('longContextDebug.loading')}</div>
        ) : (
          <>
            <SliderRow label={t('longContextDebug.pref.confidenceThreshold')} value={draftPrefs.confidenceThreshold} min={0} max={1} step={0.01} fixed={2} onChange={(v) => setDraftPrefs({ ...draftPrefs, confidenceThreshold: v })} />
            <SliderRow label={t('longContextDebug.pref.tokenBudget')} value={draftPrefs.tokenBudget} min={200} max={4000} step={50} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, tokenBudget: v })} />
            <SliderRow label={t('longContextDebug.pref.decayHalfLifeDays')} value={draftPrefs.decayHalfLifeDays} min={30} max={365} step={5} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, decayHalfLifeDays: v })} />
            <SliderRow label={t('longContextDebug.pref.topN')} value={draftPrefs.topN} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, topN: v })} />
            <SliderRow label={t('longContextDebug.pref.hotLimit')} value={draftPrefs.hotLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, hotLimit: v })} />
            <SliderRow label={t('longContextDebug.pref.warmLimit')} value={draftPrefs.warmLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, warmLimit: v })} />
            <SliderRow label={t('longContextDebug.pref.coldLimit')} value={draftPrefs.coldLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, coldLimit: v })} />
            <SliderRow label={t('longContextDebug.pref.archiveAfterDays')} value={draftPrefs.archiveAfterDays} min={60} max={365} step={10} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, archiveAfterDays: v })} />
            <div className="long-context-debug-panel__actions">
              <button type="button" className="long-context-debug-panel__btn" onClick={() => void handleSavePrefs()} disabled={saving || !draftPrefs}>
                {saving ? t('longContextDebug.saving') : t('longContextDebug.save')}
              </button>
              <button type="button" className="long-context-debug-panel__btn long-context-debug-panel__btn--ghost" onClick={handleResetPrefs} disabled={saving}>
                {t('longContextDebug.resetDefaults')}
              </button>
              <button type="button" className="long-context-debug-panel__btn long-context-debug-panel__btn--ghost" onClick={() => void refresh()} disabled={loading}>
                {loading ? t('longContextDebug.loading') : t('longContextDebug.refresh')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PackItemCard({ item }: { item: LongContextPackItemPayload }) {
  const { t } = useTranslation()
  return (
    <div className="long-context-debug-panel__pack-item">
      <div className="long-context-debug-panel__pack-item-title">{item.title}</div>
      <div className="long-context-debug-panel__pack-item-meta">
        {item.relationType && <span>{item.relationType} · </span>}
        {typeof item.confidence === 'number' && <span>conf {Math.round(item.confidence * 100)}% · </span>}
        {typeof item.score === 'number' && <span>score {item.score.toFixed(2)}</span>}
        {item.droppedReason && <span> · {t(`longContextDebug.droppedReason.${item.droppedReason}`)}</span>}
      </div>
      {item.reason && <div className="long-context-debug-panel__pack-item-reason">{item.reason}</div>}
      {item.evidence.length > 0 && (
        <div className="long-context-debug-panel__pack-item-evidence">
          {item.evidence.slice(0, 3).map((e, i) => <div key={i}>“{e}”</div>)}
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  const pct = Math.round((Number.isFinite(value) ? value : 0) * 100)
  return (
    <div className="long-context-debug-panel__metric">
      <div className="long-context-debug-panel__metric-value">{pct}%</div>
      <div className="long-context-debug-panel__metric-label">{label}</div>
    </div>
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  fixed: number
  onChange: (next: number) => void
}

function SliderRow({ label, value, min, max, step, fixed, onChange }: SliderRowProps) {
  return (
    <div className="long-context-debug-panel__tuning-row">
      <span className="long-context-debug-panel__tuning-label">{label}</span>
      <input
        type="range"
        className="long-context-debug-panel__slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="long-context-debug-panel__slider-value">{value.toFixed(fixed)}</span>
    </div>
  )
}
