/**
 * 柱状图 - 使用 ECharts
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

type BarTone = 'high' | 'medium' | 'low'

interface BarChartProps {
  data: Array<{ label: string; value: number; tone?: BarTone }>
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
  return resolveCssColor(source, `var(${name}, ${fallback})`, fallback)
}

function getToneColor(tone: BarTone | undefined, palette: Record<BarTone | 'neutral', string>): string {
  if (!tone) return palette.neutral
  return palette[tone]
}

export function BarChart({
  data,
  height = 200,
  className = ''
}: BarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = chartRef.current
    if (!host || !data.length) return

    // Initialize chart
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, {
        renderer: 'canvas'
      })
    }

    const chart = chartInstanceRef.current
    const palette = {
      high: readColor(host, '--danger', '#d25b55'),
      medium: readColor(host, '--warning', '#b8872f'),
      low: readColor(host, '--success', '#4f8f64'),
      neutral: readColor(host, '--text-secondary', '#7d8490'),
      text: readColor(host, '--text-primary', '#202124'),
      faint: readColor(host, '--text-tertiary', '#8a8f98'),
      track: readColor(host, '--maintenance-rule', 'rgba(128, 128, 128, 0.14)'),
      tooltipBg: readColor(host, '--bg-elevated', '#f6f7f8'),
      tooltipBorder: readColor(host, '--border-default', 'rgba(128, 128, 128, 0.32)')
    }

    // Configure chart
    const option: echarts.EChartsOption = {
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      grid: {
        left: 0,
        right: 2,
        bottom: 18,
        top: 8,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.map(d => d.label),
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: palette.faint,
          fontSize: 10,
          interval: 0,
          margin: 6
        }
      },
      yAxis: {
        type: 'value',
        splitLine: {
          show: false
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          show: false
        }
      },
      series: [
        {
          type: 'bar',
          data: data.map((d, index) => ({
            value: d.value,
            itemStyle: {
              color: getToneColor(d.tone, palette),
              opacity: index === 0 ? 0.92 : 0.68,
              borderRadius: [4, 4, 4, 4]
            }
          })),
          showBackground: true,
          backgroundStyle: {
            color: palette.track,
            borderRadius: [4, 4, 4, 4]
          },
          emphasis: {
            itemStyle: {
              opacity: 0.95
            }
          },
          barMaxWidth: 18,
          barMinHeight: 3
        }
      ],
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: {
          type: 'shadow',
          shadowStyle: {
            color: palette.track
          }
        },
        backgroundColor: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        textStyle: {
          color: palette.text,
          fontSize: 11
        }
      }
    }

    chart.setOption(option)

    // Resize observer
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
