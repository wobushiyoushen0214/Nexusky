/**
 * 圆环进度图 - 使用 ECharts
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

type HealthTone = 'good' | 'warn' | 'risk'

interface CircularProgressProps {
  value: number // 0-100
  size?: number
  className?: string
  showValue?: boolean
  tone?: HealthTone
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

function getTone(value: number, tone?: HealthTone): HealthTone {
  if (tone) return tone
  if (value >= 80) return 'good'
  if (value >= 60) return 'warn'
  return 'risk'
}

export function CircularProgress({
  value,
  size = 120,
  className = '',
  showValue = false,
  tone
}: CircularProgressProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = chartRef.current
    if (!host) return

    // Initialize chart
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(host, null, {
        renderer: 'canvas'
      })
    }

    const chart = chartInstanceRef.current
    const healthTone = getTone(value, tone)
    const palette = {
      good: readColor(host, '--success', '#4f8f64'),
      warn: readColor(host, '--warning', '#b8872f'),
      risk: readColor(host, '--danger', '#d25b55'),
      track: readColor(host, '--maintenance-rule', 'rgba(128, 128, 128, 0.14)'),
      text: readColor(host, '--text-primary', '#202124')
    }
    const progressColor = palette[healthTone]

    // Configure chart
    const option: echarts.EChartsOption = {
      animationDuration: 180,
      animationDurationUpdate: 180,
      backgroundColor: 'transparent',
      series: [
        {
          type: 'gauge',
          startAngle: 90,
          endAngle: -270,
          radius: '80%',
          pointer: {
            show: false
          },
          progress: {
            show: true,
            overlap: false,
            roundCap: true,
            clip: false,
            itemStyle: {
              color: progressColor,
              opacity: 0.92
            }
          },
          axisLine: {
            lineStyle: {
              width: 9,
              color: [[1, palette.track]]
            }
          },
          splitLine: {
            show: false
          },
          axisTick: {
            show: false
          },
          axisLabel: {
            show: false
          },
          data: [
            {
              value: value
            }
          ],
          detail: {
            show: showValue,
            valueAnimation: true,
            fontSize: size * 0.28,
            fontWeight: 800,
            color: palette.text,
            formatter: '{value}',
            offsetCenter: [0, '-5%']
          }
        }
      ]
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
  }, [value, size, showValue, tone])

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
