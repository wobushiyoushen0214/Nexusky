import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LongContextInspection, LongContextMetrics, LongContextPackItemPayload, LongContextUserPrefs } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { getRelationTypeLabel } from '../long-context/LongContextBadge'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '../ui/empty'
import { Slider } from '../ui/slider'
import { Spinner } from '../ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { Sparkline } from './Sparkline'
import './observability.css'

type MetricPolarity = 'higherIsBetter' | 'lowerIsBetter'

type PackTab = 'hot' | 'warm' | 'cold' | 'dropped'

const PACK_TABS: PackTab[] = ['hot', 'warm', 'cold', 'dropped']

function DebugEmpty({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <Empty className="long-context-debug-panel__empty">
      {loading && <Spinner className="long-context-debug-panel__empty-spinner" aria-hidden="true" />}
      <EmptyHeader>
        <EmptyTitle>{children}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

export function LongContextDebugPanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const language = useUIStore((s) => s.language)
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
        window.api.invoke('long-context:inspect-pack', { vaultPath, currentFilePath, language }),
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
  }, [vaultPath, currentFilePath, language])

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
      tokenBudget: 3000,
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

  const getTabCount = useCallback((tab: PackTab) => {
    if (!inspection) return 0
    if (tab === 'dropped') return inspection.pack.droppedItems.length
    return inspection.pack[tab].length
  }, [inspection])

  if (!vaultPath) {
    return <DebugEmpty>{t('longContextDebug.noVault')}</DebugEmpty>
  }

  return (
    <div className="long-context-debug-panel">
      <Card asChild className="long-context-debug-panel__section">
        <section>
          <CardHeader className="long-context-debug-panel__section-header">
            <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.inspector')}</h3>
          </CardHeader>
          <CardContent className="long-context-debug-panel__section-content">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PackTab)} className="long-context-debug-panel__pack-tabs">
              <div className="long-context-debug-panel__tabs-row">
                <TabsList className="long-context-debug-panel__tabs">
                  {PACK_TABS.map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="long-context-debug-panel__tab">
                      {t(`longContextDebug.tier.${tab}`)}
                      <Badge variant="secondary" className="long-context-debug-panel__tab-count">
                        {getTabCount(tab)}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Badge variant="secondary" className="long-context-debug-panel__token-count">
                  {inspection ? t('longContextDebug.tokens', { used: inspection.pack.estimatedTokens, budget: inspection.pack.tokenBudget }) : ''}
                </Badge>
              </div>
              <TabsContent value={activeTab} className="long-context-debug-panel__tab-content">
                {tabItems.length === 0 ? (
                  <DebugEmpty loading={loading}>
                    {loading ? t('longContextDebug.loading') : t('longContextDebug.emptyTier')}
                  </DebugEmpty>
                ) : (
                  tabItems.map((item, idx) => <PackItemCard key={`${item.relationId || item.title}-${idx}`} item={item} />)
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </section>
      </Card>

      <Card asChild className="long-context-debug-panel__section">
        <section>
          <CardHeader className="long-context-debug-panel__section-header">
            <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.metrics')}</h3>
          </CardHeader>
          <CardContent className="long-context-debug-panel__section-content">
            {!metrics ? (
              <DebugEmpty loading>{t('longContextDebug.loading')}</DebugEmpty>
            ) : (
              (() => {
                const buckets = metrics.series.buckets
                const shownSeries = buckets.map((b) => b.shown)
                return (
                  <div className="long-context-debug-panel__metrics-grid">
                    <MetricCard
                      label={t('longContextDebug.metric.usefulRate')}
                      value={metrics.rates.usefulRate}
                      rateSeries={buckets.map((b) => b.usefulRate)}
                      shownSeries={shownSeries}
                      polarity="higherIsBetter"
                    />
                    <MetricCard
                      label={t('longContextDebug.metric.openRate')}
                      value={metrics.rates.openRate}
                      rateSeries={buckets.map((b) => b.openRate)}
                      shownSeries={shownSeries}
                      polarity="higherIsBetter"
                    />
                    <MetricCard
                      label={t('longContextDebug.metric.notRelatedRate')}
                      value={metrics.rates.notRelatedRate}
                      rateSeries={buckets.map((b) => b.notRelatedRate)}
                      shownSeries={shownSeries}
                      polarity="lowerIsBetter"
                    />
                  </div>
                )
              })()
            )}
            {metrics && (
              <div className="long-context-debug-panel__counts">
                {t('longContextDebug.counts.shown')} {metrics.counts.suggestionShown} · {t('longContextDebug.counts.opened')} {metrics.counts.suggestionOpened} · {t('longContextDebug.counts.useful')} {metrics.counts.suggestionUseful} · {t('longContextDebug.counts.relations')} {metrics.counts.relationCreated} · {t('longContextDebug.counts.themes')} {metrics.counts.themeCreated}
              </div>
            )}
          </CardContent>
        </section>
      </Card>

      <Card asChild className="long-context-debug-panel__section">
        <section>
          <CardHeader className="long-context-debug-panel__section-header">
            <h3 className="long-context-debug-panel__section-title">{t('longContextDebug.tuning')}</h3>
          </CardHeader>
          <CardContent className="long-context-debug-panel__section-content">
            {!draftPrefs ? (
              <DebugEmpty loading>{t('longContextDebug.loading')}</DebugEmpty>
            ) : (
              <>
                <SliderRow label={t('longContextDebug.pref.confidenceThreshold')} value={draftPrefs.confidenceThreshold} min={0} max={1} step={0.01} fixed={2} onChange={(v) => setDraftPrefs({ ...draftPrefs, confidenceThreshold: v })} />
                <SliderRow label={t('longContextDebug.pref.tokenBudget')} value={draftPrefs.tokenBudget} min={200} max={8000} step={100} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, tokenBudget: v })} />
                <SliderRow label={t('longContextDebug.pref.decayHalfLifeDays')} value={draftPrefs.decayHalfLifeDays} min={30} max={365} step={5} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, decayHalfLifeDays: v })} />
                <SliderRow label={t('longContextDebug.pref.topN')} value={draftPrefs.topN} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, topN: v })} />
                <SliderRow label={t('longContextDebug.pref.hotLimit')} value={draftPrefs.hotLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, hotLimit: v })} />
                <SliderRow label={t('longContextDebug.pref.warmLimit')} value={draftPrefs.warmLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, warmLimit: v })} />
                <SliderRow label={t('longContextDebug.pref.coldLimit')} value={draftPrefs.coldLimit} min={1} max={10} step={1} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, coldLimit: v })} />
                <SliderRow label={t('longContextDebug.pref.archiveAfterDays')} value={draftPrefs.archiveAfterDays} min={60} max={365} step={10} fixed={0} onChange={(v) => setDraftPrefs({ ...draftPrefs, archiveAfterDays: v })} />
                <div className="long-context-debug-panel__actions">
                  <Button type="button" size="xs" onClick={() => void handleSavePrefs()} disabled={saving || !draftPrefs}>
                    {saving ? t('longContextDebug.saving') : t('longContextDebug.save')}
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={handleResetPrefs} disabled={saving}>
                    {t('longContextDebug.resetDefaults')}
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => void refresh()} disabled={loading}>
                    {loading ? t('longContextDebug.loading') : t('longContextDebug.refresh')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </section>
      </Card>
    </div>
  )
}

function PackItemCard({ item }: { item: LongContextPackItemPayload }) {
  const { t } = useTranslation()
  return (
    <Card asChild className="long-context-debug-panel__pack-item">
      <article>
        <CardContent className="long-context-debug-panel__pack-item-content">
          <div className="long-context-debug-panel__pack-item-title">{item.title}</div>
          <div className="long-context-debug-panel__pack-item-meta">
            {item.relationType && <span>{getRelationTypeLabel(item.relationType, t)} · </span>}
            {typeof item.confidence === 'number' && <span>{t('longContextDebug.packItem.confidence')} {Math.round(item.confidence * 100)}% · </span>}
            {typeof item.score === 'number' && <span>{t('longContextDebug.packItem.score')} {item.score.toFixed(2)}</span>}
            {item.droppedReason && <span> · {t(`longContextDebug.droppedReason.${item.droppedReason}`)}</span>}
          </div>
          {item.reason && <div className="long-context-debug-panel__pack-item-reason">{item.reason}</div>}
          {item.evidence.length > 0 && (
            <div className="long-context-debug-panel__pack-item-evidence">
              {item.evidence.slice(0, 3).map((e, i) => <div key={i}>“{e}”</div>)}
            </div>
          )}
        </CardContent>
      </article>
    </Card>
  )
}

function MetricCard({
  label,
  value,
  rateSeries,
  shownSeries,
  polarity
}: {
  label: string
  value: number
  rateSeries: number[]
  shownSeries: number[]
  polarity: MetricPolarity
}) {
  const { t } = useTranslation()
  const pct = Math.round((Number.isFinite(value) ? value : 0) * 100)
  const trend = computeTrend(rateSeries, shownSeries, polarity)
  const sparkTone: 'good' | 'warn' | 'neutral' = polarity === 'higherIsBetter' ? 'good' : 'warn'
  const sparkLabel = t('longContextDebug.sparklineLabel', { label, days: rateSeries.length })

  return (
    <Card className="long-context-debug-panel__metric">
      <CardContent className="long-context-debug-panel__metric-content">
        <div className="long-context-debug-panel__metric-header">
          <div className="long-context-debug-panel__metric-value">{pct}%</div>
          {trend && (() => {
            const trendTitle = `${trend.deltaText} · ${t('longContextDebug.trend.vsPrior', { window: trend.window })}`
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`long-context-debug-panel__metric-trend ${trend.className}`}
                    aria-label={trendTitle}
                  >
                    {trend.text}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{trendTitle}</TooltipContent>
              </Tooltip>
            )
          })()}
        </div>
        <div className="long-context-debug-panel__metric-label">{label}</div>
        <div className="long-context-debug-panel__metric-spark">
          <Sparkline points={rateSeries} tone={sparkTone} ariaLabel={sparkLabel} width={140} height={26} />
        </div>
      </CardContent>
    </Card>
  )
}

interface TrendInfo {
  text: string
  className: string
  window: number
  deltaText: string
}

function computeTrend(rateSeries: number[], shownSeries: number[], polarity: MetricPolarity): TrendInfo | null {
  if (rateSeries.length < 4 || rateSeries.length !== shownSeries.length) return null
  const window = Math.min(7, Math.floor(rateSeries.length / 2))
  if (window < 2) return null

  const recentShown = shownSeries.slice(-window)
  const olderShown = shownSeries.slice(-window * 2, -window)
  const recentTotal = recentShown.reduce((a, b) => a + b, 0)
  const olderTotal = olderShown.reduce((a, b) => a + b, 0)
  if (recentTotal < 3 || olderTotal < 3) return null

  const recentRates = rateSeries.slice(-window)
  const olderRates = rateSeries.slice(-window * 2, -window)
  const recentWeighted = recentRates.reduce((acc, r, i) => acc + r * recentShown[i], 0) / recentTotal
  const olderWeighted = olderRates.reduce((acc, r, i) => acc + r * olderShown[i], 0) / olderTotal
  const deltaPP = (recentWeighted - olderWeighted) * 100

  if (Math.abs(deltaPP) < 0.5) {
    return { text: '→', className: '', window, deltaText: '±0pp' }
  }

  const rising = deltaPP > 0
  const isBetter = (polarity === 'higherIsBetter') === rising
  const arrow = rising ? '↑' : '↓'
  const text = `${arrow}${Math.abs(deltaPP).toFixed(1)}pp`
  const deltaText = `${arrow} ${Math.abs(deltaPP).toFixed(1)}pp`
  return {
    text,
    className: isBetter ? 'is-up' : 'is-down-bad',
    window,
    deltaText
  }
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
      <Slider
        className="long-context-debug-panel__slider"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
      <span className="long-context-debug-panel__slider-value">{value.toFixed(fixed)}</span>
    </div>
  )
}
