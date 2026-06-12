import * as React from 'react'
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export interface TokenUsagePoint {
  label: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface DiaryHeatmapPoint {
  date: string
  value: number
}

export interface VitalityTrendPoint {
  label: string
  score: number
}

interface TokenUsageAreaChartProps {
  data: TokenUsagePoint[]
  inputLabel: string
  outputLabel: string
  className?: string
}

interface VitalityTrendChartProps {
  data: VitalityTrendPoint[]
  scoreLabel: string
  className?: string
}

interface DiaryHeatmapChartProps {
  data: DiaryHeatmapPoint[]
  startDate: string
  endDate: string
  className?: string
}

function resolveCssColor(source: HTMLElement, value: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback

  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.display = 'none'
  source.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()

  return color || fallback
}

function readColor(source: HTMLElement, name: string, fallback: string): string {
  return toRgbaString(resolveCssColor(source, `var(${name}, ${fallback})`, fallback), fallback)
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function parseAlpha(value: string | undefined): number {
  if (!value) return 1
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) return clamp(Number.parseFloat(trimmed) / 100, 0, 1)
  return clamp(Number.parseFloat(trimmed), 0, 1)
}

function parseRgbChannel(value: string): number {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) return clamp(Number.parseFloat(trimmed) * 2.55, 0, 255)
  return clamp(Number.parseFloat(trimmed), 0, 255)
}

function parseSrgbChannel(value: string): number {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) return clamp(Number.parseFloat(trimmed) * 2.55, 0, 255)
  return clamp(Number.parseFloat(trimmed) * 255, 0, 255)
}

function parseFunctionChannels(body: string): { channels: string[]; alpha?: string } {
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim())
    return { channels: parts.slice(0, 3), alpha: parts[3] }
  }

  const [channelPart, alphaPart] = body.split('/').map((part) => part.trim())
  return {
    channels: channelPart.split(/\s+/).filter(Boolean).slice(0, 3),
    alpha: alphaPart
  }
}

function oklchToRgba(body: string): RgbaColor | null {
  const { channels, alpha } = parseFunctionChannels(body)
  if (channels.length < 3) return null

  const lightness = channels[0].endsWith('%')
    ? Number.parseFloat(channels[0]) / 100
    : Number.parseFloat(channels[0])
  const chroma = Number.parseFloat(channels[1])
  const hue = Number.parseFloat(channels[2]) * Math.PI / 180

  if (![lightness, chroma, hue].every(Number.isFinite)) return null

  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lPrime ** 3
  const m = mPrime ** 3
  const s = sPrime ** 3

  const toSrgb = (linear: number) => {
    const value = linear <= 0.0031308
      ? 12.92 * linear
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
    return clamp(Math.round(value * 255), 0, 255)
  }

  return {
    r: toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: parseAlpha(alpha)
  }
}

function parseCssColor(color: string): RgbaColor | null {
  const normalized = color.trim()
  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch) {
    const { channels, alpha } = parseFunctionChannels(rgbMatch[1])
    if (channels.length < 3) return null
    return {
      r: parseRgbChannel(channels[0]),
      g: parseRgbChannel(channels[1]),
      b: parseRgbChannel(channels[2]),
      a: parseAlpha(alpha)
    }
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    const expanded = hex.length === 3
      ? hex.split('').map((char) => char + char).join('')
      : hex
    const value = Number.parseInt(expanded, 16)
    const red = (value >> 16) & 255
    const green = (value >> 8) & 255
    const blue = value & 255
    return { r: red, g: green, b: blue, a: 1 }
  }

  const srgbMatch = normalized.match(/^color\(\s*srgb\s+([^)]+)\)$/)
  if (srgbMatch) {
    const { channels, alpha } = parseFunctionChannels(srgbMatch[1])
    if (channels.length < 3) return null
    return {
      r: parseSrgbChannel(channels[0]),
      g: parseSrgbChannel(channels[1]),
      b: parseSrgbChannel(channels[2]),
      a: parseAlpha(alpha)
    }
  }

  const oklchMatch = normalized.match(/^oklch\(([^)]+)\)$/)
  if (oklchMatch) return oklchToRgba(oklchMatch[1])

  return null
}

function toRgbaString(color: string, fallback = 'rgba(0, 0, 0, 1)', alphaOverride?: number): string {
  const parsed = parseCssColor(color) || parseCssColor(fallback) || { r: 0, g: 0, b: 0, a: 1 }
  const alpha = alphaOverride === undefined ? parsed.a : clamp(alphaOverride, 0, 1)
  return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${alpha})`
}

function withAlpha(color: string, alpha: number): string {
  return toRgbaString(color, color, alpha)
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return String(Math.round(value))
}

export function TokenUsageAreaChart({ data, inputLabel, outputLabel, className = '' }: TokenUsageAreaChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)
  const [themeKey, setThemeKey] = React.useState(0)

  React.useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(k => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = chartRef.current
    if (!host) return

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, { renderer: 'canvas' })
    }

    const chart = chartInstanceRef.current
    const palette = {
      input: readColor(host, '--text-secondary', '#627083'),
      output: readColor(host, '--accent', '#3b6ee8'),
      text: readColor(host, '--text-primary', '#202124'),
      faint: readColor(host, '--text-tertiary', '#8a8f98'),
      rule: readColor(host, '--maintenance-rule', 'rgba(128, 128, 128, 0.14)'),
      tooltipBg: readColor(host, '--bg-elevated', '#f6f7f8'),
      tooltipBorder: readColor(host, '--border-default', 'rgba(128, 128, 128, 0.32)')
    }

    chart.setOption({
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      grid: {
        left: 10,
        right: 16,
        bottom: 24,
        top: 18,
        containLabel: true
      },
      legend: {
        top: 0,
        right: 4,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 6,
        textStyle: {
          color: palette.faint,
          fontSize: 11
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map((point) => point.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.faint,
          fontSize: 10,
          interval: Math.max(0, Math.ceil(data.length / 6) - 1),
          margin: 10
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitNumber: 3,
        splitLine: {
          lineStyle: {
            color: palette.rule,
            type: 'dashed'
          }
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.faint,
          fontSize: 10,
          formatter: (value: number) => formatCompactNumber(value)
        }
      },
      series: [
        {
          name: inputLabel,
          type: 'line',
          stack: 'tokens',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: data.map((point) => point.inputTokens),
          lineStyle: { color: palette.input, width: 2.4 },
          itemStyle: { color: palette.input, borderColor: withAlpha(palette.tooltipBg, 0.82), borderWidth: 1 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(palette.input, 0.28) },
                { offset: 1, color: withAlpha(palette.input, 0.03) }
              ]
            }
          }
        },
        {
          name: outputLabel,
          type: 'line',
          stack: 'tokens',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: data.map((point) => point.outputTokens),
          lineStyle: { color: palette.output, width: 2.4 },
          itemStyle: { color: palette.output, borderColor: withAlpha(palette.tooltipBg, 0.82), borderWidth: 1 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(palette.output, 0.24) },
                { offset: 1, color: withAlpha(palette.output, 0.03) }
              ]
            }
          }
        }
      ],
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        textStyle: {
          color: palette.text,
          fontSize: 11
        }
      }
    })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart.resize())
      resizeObserver.observe(host)
    }

    return () => {
      resizeObserver?.disconnect()
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [data, inputLabel, outputLabel, themeKey])

  return <div ref={chartRef} className={className} style={{ width: '100%', height: '100%' }} />
}

export function VitalityTrendChart({ data, scoreLabel, className = '' }: VitalityTrendChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)
  const [themeKey, setThemeKey] = React.useState(0)

  React.useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(k => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = chartRef.current
    if (!host) return

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, { renderer: 'canvas' })
    }

    const chart = chartInstanceRef.current
    const palette = {
      line: readColor(host, '--accent', '#3b6ee8'),
      text: readColor(host, '--text-primary', '#202124'),
      faint: readColor(host, '--text-tertiary', '#8a8f98'),
      rule: readColor(host, '--maintenance-rule', 'rgba(128, 128, 128, 0.14)'),
      tooltipBg: readColor(host, '--bg-elevated', '#f6f7f8'),
      tooltipBorder: readColor(host, '--border-default', 'rgba(128, 128, 128, 0.32)')
    }
    const lastPoint = data[data.length - 1]

    chart.setOption({
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      grid: {
        left: 8,
        right: 8,
        bottom: 10,
        top: 12,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map((point) => point.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: {
          lineStyle: {
            color: palette.rule,
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: scoreLabel,
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: data.map((point) => point.score),
          lineStyle: {
            color: palette.line,
            width: 2.5
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(palette.line, 0.2) },
                { offset: 0.72, color: withAlpha(palette.line, 0.055) },
                { offset: 1, color: withAlpha(palette.line, 0) }
              ]
            }
          },
          markPoint: lastPoint
            ? {
                silent: true,
                symbol: 'circle',
                symbolSize: 8,
                data: [{ coord: [lastPoint.label, lastPoint.score] }],
                label: { show: false },
                itemStyle: {
                  color: palette.tooltipBg,
                  borderColor: palette.line,
                  borderWidth: 2
                }
              }
            : undefined
        }
      ],
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        textStyle: {
          color: palette.text,
          fontSize: 11
        },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] as { data?: number; axisValueLabel?: string } : null
          if (!first) return ''
          return `${first.axisValueLabel || scoreLabel}<br/>${scoreLabel}: ${first.data ?? '-'}`
        }
      }
    })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart.resize())
      resizeObserver.observe(host)
    }

    return () => {
      resizeObserver?.disconnect()
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [data, scoreLabel, themeKey])

  return <div ref={chartRef} className={className} style={{ width: '100%', height: '100%' }} />
}

export function DiaryHeatmapChart({ data, startDate, endDate, className = '' }: DiaryHeatmapChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)
  const [themeKey, setThemeKey] = React.useState(0)

  React.useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(k => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = chartRef.current
    if (!host) return

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, { renderer: 'canvas' })
    }

    const chart = chartInstanceRef.current
    const palette = {
      accent: readColor(host, '--accent', '#3b6ee8'),
      well: readColor(host, '--bg-elevated', '#eef5f7'),
      text: readColor(host, '--text-primary', '#202124'),
      faint: readColor(host, '--text-tertiary', '#8a8f98'),
      rule: readColor(host, '--maintenance-rule', 'rgba(128, 128, 128, 0.14)'),
      tooltipBg: readColor(host, '--bg-elevated', '#f6f7f8'),
      tooltipBorder: readColor(host, '--border-default', 'rgba(128, 128, 128, 0.32)')
    }
    const maxValue = Math.max(1, ...data.map((point) => point.value))

    chart.setOption({
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      visualMap: {
        min: 0,
        max: maxValue,
        show: false,
        inRange: {
          color: [
            withAlpha(palette.well, 0.52),
            withAlpha(palette.accent, 0.2),
            withAlpha(palette.accent, 0.48),
            withAlpha(palette.accent, 0.82)
          ]
        }
      },
      calendar: {
        range: [startDate, endDate],
        top: 28,
        left: 28,
        right: 16,
        bottom: 10,
        cellSize: ['auto', 16],
        splitLine: { show: false },
        yearLabel: { show: false },
        monthLabel: {
          color: palette.faint,
          fontSize: 10,
          margin: 9
        },
        dayLabel: {
          firstDay: 1,
          color: palette.faint,
          fontSize: 10,
          margin: 8
        },
        itemStyle: {
          color: withAlpha(palette.well, 0.28),
          borderColor: palette.rule,
          borderWidth: 1
        }
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: data.map((point) => [point.date, point.value]),
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: withAlpha(palette.text, 0.14)
            }
          }
        }
      ],
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        textStyle: {
          color: palette.text,
          fontSize: 11
        }
      }
    })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart.resize())
      resizeObserver.observe(host)
    }

    return () => {
      resizeObserver?.disconnect()
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [data, endDate, startDate, themeKey])

  return <div ref={chartRef} className={className} style={{ width: '100%', height: '100%' }} />
}
