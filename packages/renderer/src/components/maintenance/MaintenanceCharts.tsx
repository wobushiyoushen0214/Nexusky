import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import type {
  KnowledgeMaintenanceType,
  MaintenanceFeedbackSummary,
  VaultHealthSummary
} from '@shared/types/ipc'

interface MaintenanceTypeFilter {
  value: 'all' | KnowledgeMaintenanceType
  key: string
}

interface MaintenanceChartPalette {
  text: string
  textSecondary: string
  textMuted: string
  axis: string
  grid: string
  surface: string
  tooltipBg: string
  accent: string
  success: string
  warning: string
  danger: string
  series: string[]
}

const DEFAULT_CHART_PALETTE: MaintenanceChartPalette = {
  text: '#d4dce8',
  textSecondary: '#a8b2c2',
  textMuted: '#7f8a99',
  axis: 'rgba(127, 138, 153, 0.36)',
  grid: 'rgba(127, 138, 153, 0.14)',
  surface: 'rgba(20, 24, 32, 0.92)',
  tooltipBg: 'rgba(25, 29, 38, 0.96)',
  accent: '#4facfe',
  success: '#4ec9a0',
  warning: '#f0a050',
  danger: '#f47067',
  series: ['#4facfe', '#4ec9a0', '#f0a050', '#f47067', '#8aa6cf', '#c49a6c']
}

let maintenanceEChartsLoader: Promise<typeof import('echarts/core')> | null = null

function loadMaintenanceECharts(): Promise<typeof import('echarts/core')> {
  if (!maintenanceEChartsLoader) {
    maintenanceEChartsLoader = Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers')
    ]).then(([echarts, charts, components, renderers]) => {
      echarts.use([
        charts.BarChart,
        charts.LineChart,
        charts.PieChart,
        components.GridComponent,
        components.LegendComponent,
        components.TooltipComponent,
        renderers.SVGRenderer
      ])
      return echarts
    })
  }
  return maintenanceEChartsLoader
}

function readCssVar(source: Element, name: string, fallback: string): string {
  const value = getComputedStyle(source).getPropertyValue(name).trim()
  return value || fallback
}

function readChartPalette(): MaintenanceChartPalette {
  const source = document.documentElement
  const text = readCssVar(source, '--text-primary', DEFAULT_CHART_PALETTE.text)
  const textSecondary = readCssVar(source, '--text-secondary', DEFAULT_CHART_PALETTE.textSecondary)
  const textMuted = readCssVar(source, '--text-tertiary', DEFAULT_CHART_PALETTE.textMuted)
  const accent = readCssVar(source, '--accent', DEFAULT_CHART_PALETTE.accent)
  const success = readCssVar(source, '--success', DEFAULT_CHART_PALETTE.success)
  const warning = readCssVar(source, '--warning', DEFAULT_CHART_PALETTE.warning)
  const danger = readCssVar(source, '--danger', DEFAULT_CHART_PALETTE.danger)
  return {
    text,
    textSecondary,
    textMuted,
    axis: readCssVar(source, '--border-subtle', DEFAULT_CHART_PALETTE.axis),
    grid: readCssVar(source, '--maintenance-soft-border', DEFAULT_CHART_PALETTE.grid),
    surface: readCssVar(source, '--maintenance-section', DEFAULT_CHART_PALETTE.surface),
    tooltipBg: readCssVar(source, '--bg-glass-dense', DEFAULT_CHART_PALETTE.tooltipBg),
    accent,
    success,
    warning,
    danger,
    series: [accent, success, warning, danger, '#8aa6cf', '#c49a6c']
  }
}

function useMaintenanceChartPalette(): MaintenanceChartPalette {
  const [palette, setPalette] = useState(DEFAULT_CHART_PALETTE)

  useEffect(() => {
    const refresh = () => setPalette(readChartPalette())
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    return () => observer.disconnect()
  }, [])

  return palette
}

function MaintenanceEChart({
  option,
  ariaLabel,
  className,
  emptyLabel
}: {
  option: EChartsCoreOption | null
  ariaLabel: string
  className?: string
  emptyLabel: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const optionRef = useRef<EChartsCoreOption | null>(option)

  useEffect(() => {
    optionRef.current = option
    if (!chartRef.current) return
    if (option) {
      chartRef.current.setOption(option, true)
    } else {
      chartRef.current.clear()
    }
  }, [option])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    loadMaintenanceECharts().then((echarts) => {
      if (disposed || !hostRef.current) return
      const chart = echarts.init(hostRef.current, undefined, { renderer: 'svg' })
      chartRef.current = chart
      if (optionRef.current) chart.setOption(optionRef.current, true)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => chart.resize())
        resizeObserver.observe(hostRef.current)
      }
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return (
    <div className={`maintenance-chart${className ? ` ${className}` : ''}${option ? '' : ' is-empty'}`} role="img" aria-label={ariaLabel}>
      <div ref={hostRef} className="maintenance-chart__canvas" />
      {!option && <span className="maintenance-chart__empty">{emptyLabel}</span>}
    </div>
  )
}

function makeTooltip(palette: MaintenanceChartPalette): EChartsCoreOption['tooltip'] {
  return {
    trigger: 'axis',
    backgroundColor: palette.tooltipBg,
    borderWidth: 0,
    textStyle: {
      color: palette.text,
      fontSize: 11
    },
    confine: true
  }
}

function getFeedbackTotal(summary: MaintenanceFeedbackSummary['last7Days'] | null | undefined): number {
  if (!summary) return 0
  return summary.done + summary.skipped + summary.snoozed + summary.not_relevant
}

export function MaintenanceQueueComposition({
  itemCount,
  counts,
  typeFilters
}: {
  itemCount: number
  counts: Partial<Record<KnowledgeMaintenanceType, number>>
  typeFilters: MaintenanceTypeFilter[]
}) {
  const { t } = useTranslation()
  const palette = useMaintenanceChartPalette()
  const rows = useMemo(() => typeFilters
    .filter((filter) => filter.value !== 'all')
    .map((filter) => ({
      key: filter.key,
      value: filter.value,
      count: counts[filter.value as KnowledgeMaintenanceType] ?? 0
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6), [counts, typeFilters])

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (rows.length === 0) return null
    return {
      color: palette.series,
      tooltip: {
        trigger: 'item',
        backgroundColor: palette.tooltipBg,
        borderWidth: 0,
        textStyle: { color: palette.text, fontSize: 11 },
        confine: true
      },
      series: [
        {
          type: 'pie',
          radius: ['56%', '78%'],
          center: ['50%', '50%'],
          minAngle: 6,
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: palette.surface,
            borderRadius: 7,
            borderWidth: 2
          },
          label: {
            color: palette.textSecondary,
            fontSize: 10,
            lineHeight: 14,
            formatter: '{b}\n{c}'
          },
          labelLine: {
            length: 8,
            length2: 5,
            lineStyle: { color: palette.axis }
          },
          data: rows.map((row, index) => ({
            name: t(`maintenance.filters.${row.key}`),
            value: row.count,
            itemStyle: { color: palette.series[index % palette.series.length] }
          }))
        }
      ]
    }
  }, [palette, rows, t])

  return (
    <section className="maintenance-chart-card maintenance-composition" aria-label={t('maintenance.summary.title')}>
      <div className="maintenance-chart-card__head">
        <div>
          <h3>{t('maintenance.summary.title')}</h3>
          <p>{t('maintenance.summary.ready')} {itemCount.toLocaleString()}</p>
        </div>
        <strong>{itemCount.toLocaleString()}</strong>
      </div>
      <MaintenanceEChart
        className="maintenance-chart--donut"
        option={option}
        ariaLabel={t('maintenance.summary.title')}
        emptyLabel={t('maintenance.empty')}
      />
    </section>
  )
}

export function MaintenanceHealthTrendPanel({
  summary,
  feedbackSummary
}: {
  summary: VaultHealthSummary
  feedbackSummary: MaintenanceFeedbackSummary | null
}) {
  const { t } = useTranslation()
  const palette = useMaintenanceChartPalette()
  const trend = summary.trend
  const previous = trend.length > 1 ? trend[trend.length - 2] : null
  const delta = previous ? summary.score - previous.score : null
  const weeklyTotal = getFeedbackTotal(feedbackSummary?.last7Days)
  const factorRows = useMemo(() => [...summary.scoreFactors]
    .sort((a, b) => b.impact - a.impact || a.score - b.score)
    .slice(0, 6), [summary.scoreFactors])

  const trendOption = useMemo<EChartsCoreOption | null>(() => {
    const points = trend.length > 0
      ? trend
      : [{ weekStart: new Date(summary.scannedAt).toISOString(), snapshotDate: new Date(summary.scannedAt).toISOString(), score: summary.score }]
    return {
      tooltip: makeTooltip(palette),
      grid: { left: 28, right: 10, top: 14, bottom: 24 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) => point.weekStart.slice(5)),
        axisLine: { lineStyle: { color: palette.axis } },
        axisTick: { show: false },
        axisLabel: { color: palette.textMuted, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitNumber: 4,
        axisLabel: { color: palette.textMuted, fontSize: 10 },
        splitLine: { lineStyle: { color: palette.grid } }
      },
      series: [
        {
          name: t('maintenance.healthTrend.score'),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: points.map((point) => point.score),
          lineStyle: { width: 2.4, color: palette.accent },
          itemStyle: { color: palette.accent },
          areaStyle: { color: palette.accent, opacity: 0.13 }
        }
      ]
    }
  }, [palette, summary.scannedAt, summary.score, t, trend])

  const factorOption = useMemo<EChartsCoreOption | null>(() => {
    if (factorRows.length === 0) return null
    return {
      tooltip: makeTooltip(palette),
      grid: { left: 78, right: 14, top: 8, bottom: 18 },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: palette.textMuted, fontSize: 10 },
        splitLine: { lineStyle: { color: palette.grid } }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: factorRows.map((factor) => t(`vaultHealth.score.factor.${factor.id}`)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.textSecondary, fontSize: 10 }
      },
      series: [
        {
          name: t('maintenance.healthTrend.score'),
          type: 'bar',
          barWidth: 8,
          data: factorRows.map((factor) => ({
            value: factor.score,
            itemStyle: {
              color: factor.status === 'good'
                ? palette.success
                : factor.status === 'warn'
                  ? palette.warning
                  : palette.danger,
              borderRadius: [5, 5, 5, 5]
            }
          }))
        }
      ]
    }
  }, [factorRows, palette, t])

  const deltaKey = delta == null
    ? 'empty'
    : delta > 0
      ? 'up'
      : delta < 0
        ? 'down'
        : 'flat'

  return (
    <section className="maintenance-chart-card maintenance-health-trend" aria-labelledby="maintenance-health-trend-title">
      <div className="maintenance-chart-card__head maintenance-health-trend__head">
        <div>
          <h3 id="maintenance-health-trend-title">{t('maintenance.healthTrend.title')}</h3>
          <p>{t('maintenance.healthTrend.desc')}</p>
        </div>
        <div className="maintenance-health-trend__score">
          <span>{summary.score}</span>
          <small>{t('maintenance.healthTrend.score')}</small>
        </div>
      </div>
      <div className="maintenance-health-trend__chart-grid">
        <MaintenanceEChart
          className="maintenance-chart--trend"
          option={trendOption}
          ariaLabel={t('maintenance.healthTrend.chartLabel')}
          emptyLabel={t('maintenance.healthTrend.delta.empty')}
        />
        <MaintenanceEChart
          className="maintenance-chart--factors"
          option={factorOption}
          ariaLabel={t('vaultHealth.score.title')}
          emptyLabel={t('vaultHealth.score.noIssues')}
        />
      </div>
      <div className={`maintenance-health-trend__delta is-${deltaKey}`}>
        {delta == null
          ? t('maintenance.healthTrend.delta.empty')
          : delta > 0
            ? t('maintenance.healthTrend.delta.up', { delta })
            : delta < 0
              ? t('maintenance.healthTrend.delta.down', { delta: Math.abs(delta) })
              : t('maintenance.healthTrend.delta.flat')}
      </div>
      <div className="maintenance-health-trend__feedback">
        <span>{t('maintenance.healthTrend.feedback.week', { count: weeklyTotal })}</span>
      </div>
    </section>
  )
}

export function MaintenanceFeedbackChart({
  feedbackSummary
}: {
  feedbackSummary: MaintenanceFeedbackSummary | null
}) {
  const { t } = useTranslation()
  const palette = useMaintenanceChartPalette()
  const option = useMemo<EChartsCoreOption | null>(() => {
    if (!feedbackSummary) return null
    const weekly = feedbackSummary.last7Days
    const monthly = feedbackSummary.last30Days
    const deferred = [weekly.skipped + weekly.snoozed, monthly.skipped + monthly.snoozed]
    return {
      color: [palette.success, palette.warning, palette.danger],
      tooltip: makeTooltip(palette),
      legend: {
        bottom: 0,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: palette.textMuted, fontSize: 10 }
      },
      grid: { left: 34, right: 10, top: 8, bottom: 28 },
      xAxis: {
        type: 'value',
        axisLabel: { color: palette.textMuted, fontSize: 10 },
        splitLine: { lineStyle: { color: palette.grid } }
      },
      yAxis: {
        type: 'category',
        data: ['7d', '30d'],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.textSecondary, fontSize: 10 }
      },
      series: [
        {
          name: t('maintenance.feedback.done'),
          type: 'bar',
          stack: 'feedback',
          barWidth: 12,
          data: [weekly.done, monthly.done]
        },
        {
          name: `${t('maintenance.feedback.skipped')} / ${t('maintenance.feedback.snoozed')}`,
          type: 'bar',
          stack: 'feedback',
          barWidth: 12,
          data: deferred
        },
        {
          name: t('maintenance.feedback.not_relevant'),
          type: 'bar',
          stack: 'feedback',
          barWidth: 12,
          data: [weekly.not_relevant, monthly.not_relevant]
        }
      ]
    }
  }, [feedbackSummary, palette, t])

  return (
    <section className="maintenance-chart-card maintenance-feedback-chart" aria-label={t('maintenance.feedback.label')}>
      <div className="maintenance-chart-card__head">
        <div>
          <h3>{t('maintenance.feedback.label')}</h3>
          <p>{feedbackSummary ? t('maintenance.summary.reviewed') : t('maintenance.healthTrend.feedback.loading')}</p>
        </div>
        <strong>{getFeedbackTotal(feedbackSummary?.last7Days).toLocaleString()}</strong>
      </div>
      <MaintenanceEChart
        className="maintenance-chart--feedback"
        option={option}
        ariaLabel={t('maintenance.feedback.label')}
        emptyLabel={t('maintenance.healthTrend.feedback.loading')}
      />
    </section>
  )
}
