/**
 * 环形占比图 - 使用 ECharts
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

type DonutTone = 'high' | 'medium' | 'low' | 'neutral'

interface DonutChartProps {
  data: Array<{ label: string; value: number; tone?: DonutTone }>
  height?: number
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

function getToneColor(tone: DonutTone | undefined, palette: Record<DonutTone, string>): string {
  return palette[tone ?? 'neutral']
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
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
      a: 1
    }
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

export function DonutChart({
  data,
  height = 220,
  className = ''
}: DonutChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = chartRef.current
    if (!host || !data.length) return

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, {
        renderer: 'canvas'
      })
    }

    const chart = chartInstanceRef.current
    const accent = readColor(host, '--accent', '#3b6ee8')
    const accentText = readColor(host, '--accent-text', '#315da8')
    const textSecondary = readColor(host, '--text-secondary', '#7d8490')
    const palette = {
      high: accent,
      medium: withAlpha(accentText, 0.62),
      low: withAlpha(textSecondary, 0.56),
      neutral: textSecondary,
      text: readColor(host, '--text-primary', '#202124'),
      faint: readColor(host, '--text-tertiary', '#8a8f98'),
      tooltipBg: readColor(host, '--bg-elevated', '#f6f7f8'),
      tooltipBorder: readColor(host, '--border-default', 'rgba(128, 128, 128, 0.32)')
    }

    const option: echarts.EChartsOption = {
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      color: data.map((d) => getToneColor(d.tone, palette)),
      series: [
        {
          type: 'pie',
          radius: ['62%', '82%'],
          center: ['50%', '48%'],
          avoidLabelOverlap: true,
          padAngle: 2,
          itemStyle: {
            borderRadius: 6,
            borderWidth: 0,
            borderColor: 'transparent'
          },
          label: {
            color: palette.faint,
            fontSize: 11,
            fontWeight: 600,
            formatter: '{b}'
          },
          labelLine: {
            length: 10,
            length2: 8,
            lineStyle: {
              color: palette.faint,
              opacity: 0.5,
              width: 1.2
            }
          },
          data: data.map((d) => ({
            name: d.label,
            value: d.value,
            itemStyle: {
              color: getToneColor(d.tone, palette),
              opacity: 0.88
            }
          }))
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
    }

    chart.setOption(option)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        chart.resize()
      })
      resizeObserver.observe(host)
    }

    return () => {
      resizeObserver?.disconnect()
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [data, height])

  if (!data.length) return null

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ width: '100%', height }}
    />
  )
}
